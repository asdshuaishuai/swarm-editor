package com.swarmeditor.backend.lsp

import java.io.ByteArrayInputStream
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.CancellationException
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

class LspServiceTest {
    @Test
    fun `prefers official Kotlin LSP command`() {
        val spec = kotlinSpec()

        assertEquals(
            listOf(listOf("kotlin-lsp"), listOf("kotlin-language-server")),
            spec.commandCandidates,
        )
        assertEquals(
            listOf("kotlin-lsp"),
            resolveLspCommand(spec) { it == "kotlin-lsp" || it == "kotlin-language-server" },
        )
    }

    @Test
    fun `falls back to legacy Kotlin language server`() {
        assertEquals(
            listOf("kotlin-language-server"),
            resolveLspCommand(kotlinSpec()) { it == "kotlin-language-server" },
        )
    }

    @Test
    fun `explicit LSP override replaces default candidates`() {
        val spec = lspSpec(
            id = "kotlin",
            displayName = "Kotlin Language Server",
            languageId = "kotlin",
            extensions = setOf("kt", "kts"),
            fallbackCommands = kotlinCommands,
            environment = { "/opt/kotlin/bin/kotlin-lsp --stdio" },
            systemProperty = { "ignored-language-server" },
        )

        assertEquals(
            listOf(listOf("/opt/kotlin/bin/kotlin-lsp", "--stdio")),
            spec.commandCandidates,
        )
    }

    @Test
    fun `service launches the first available command candidate`() = runTest {
        var launchedSpec: LspServerSpec? = null
        val service = LspService(
            projectRoot = File("."),
            specs = listOf(kotlinSpec()),
            sessionFactory = { spec ->
                launchedSpec = spec
                object : LspSession {
                    override suspend fun highlight(file: File, content: String) = LspHighlightResult(
                        languageId = "kotlin",
                        serverName = "legacy",
                    )

                    override suspend fun close() = Unit
                }
            },
            commandAvailability = { it == "kotlin-language-server" },
        )

        val result = service.highlight(File("Main.kt"), "fun main() = Unit")

        assertEquals(listOf("kotlin-language-server"), launchedSpec?.command)
        assertEquals("legacy", result.serverName)
        service.close()
    }

    @Test
    fun `service falls back when preferred command fails during initialization`() = runTest {
        val launchedCommands = mutableListOf<List<String>>()
        val service = LspService(
            projectRoot = File("."),
            specs = listOf(kotlinSpec()),
            sessionFactory = { spec ->
                launchedCommands += spec.command
                object : LspSession {
                    override suspend fun highlight(file: File, content: String): LspHighlightResult {
                        if (spec.command.first() == "kotlin-lsp") error("preferred server exited")
                        return LspHighlightResult(languageId = "kotlin", serverName = "legacy")
                    }

                    override suspend fun close() = Unit
                }
            },
            commandAvailability = { true },
        )

        val result = service.highlight(File("Main.kt"), "fun main() = Unit")

        assertEquals(kotlinCommands, launchedCommands)
        assertEquals("legacy", result.serverName)
        service.close()
    }

    @Test
    fun `failed candidate close prevents launching a duplicate LSP process`() = runTest {
        val session = RetryableCloseLspSession(failHighlight = true)
        val launchedCommands = mutableListOf<List<String>>()
        val service = LspService(
            projectRoot = File("."),
            specs = listOf(kotlinSpec()),
            sessionFactory = { spec ->
                launchedCommands += spec.command
                session
            },
            commandAvailability = { true },
        )

        val result = service.highlight(File("Main.kt"), "fun main() = Unit")

        assertEquals(listOf(kotlinCommands.first()), launchedCommands)
        assertContains(result.message.orEmpty(), "preferred server exited")
        assertEquals(1, session.closeAttempts)
        service.close()
        assertEquals(2, session.closeAttempts)
    }

    @Test
    fun `failed service close retains the LSP session only for cleanup retry`() = runTest {
        val session = RetryableCloseLspSession()
        var creations = 0
        val service = LspService(
            projectRoot = File("."),
            specs = listOf(kotlinSpec()),
            sessionFactory = {
                creations++
                session
            },
            commandAvailability = { true },
        )
        service.highlight(File("Main.kt"), "fun main() = Unit")

        assertFailsWith<IllegalStateException> { service.close() }
        val closedError = assertFailsWith<IllegalStateException> {
            service.highlight(File("Main.kt"), "fun retained() = Unit")
        }

        assertEquals("LSP service is closed", closedError.message)
        assertEquals(1, creations)
        assertEquals(1, session.closeAttempts)
        service.close()
        assertEquals(2, session.closeAttempts)
    }

    @Test
    fun `closed service rejects new LSP process creation`() = runTest {
        var creations = 0
        val service = LspService(
            projectRoot = File("."),
            specs = listOf(kotlinSpec()),
            sessionFactory = {
                creations++
                GatedLspSession()
            },
            commandAvailability = { true },
        )

        service.close()
        val error = assertFailsWith<IllegalStateException> {
            service.highlight(File("Main.kt"), "fun main() = Unit")
        }

        assertEquals("LSP service is closed", error.message)
        assertEquals(0, creations)
    }

    @Test
    fun `unavailable server message lists candidates and override`() = runTest {
        var sessionStarted = false
        val service = LspService(
            projectRoot = File("."),
            specs = listOf(kotlinSpec()),
            sessionFactory = {
                sessionStarted = true
                error("session must not start")
            },
            commandAvailability = { false },
        )

        val result = service.highlight(File("Main.kt"), "fun main() = Unit")

        assertFalse(sessionStarted)
        assertContains(result.message.orEmpty(), "kotlin-lsp / kotlin-language-server")
        assertContains(result.message.orEmpty(), "SWARM_LSP_KOTLIN")
        assertContains(result.message.orEmpty(), "swarm.lsp.kotlin")
    }

    @Test
    fun `default specs cover common source languages`() {
        val specsByExtension = defaultLspServerSpecs()
            .flatMap { spec -> spec.extensions.map { extension -> extension to spec } }
            .toMap()

        val expected = mapOf(
            "java" to Triple("java", "java", listOf("jdtls")),
            "cs" to Triple("csharp", "csharp", listOf("csharp-ls")),
            "dart" to Triple("dart", "dart", listOf("dart", "language-server", "--protocol=lsp")),
            "php" to Triple("php", "php", listOf("intelephense", "--stdio")),
            "phtml" to Triple("php", "php", listOf("intelephense", "--stdio")),
            "rb" to Triple("ruby", "ruby", listOf("ruby-lsp")),
            "rake" to Triple("ruby", "ruby", listOf("ruby-lsp")),
            "gemspec" to Triple("ruby", "ruby", listOf("ruby-lsp")),
            "swift" to Triple("swift", "swift", listOf("sourcekit-lsp")),
        )

        expected.forEach { (extension, expectation) ->
            val spec = specsByExtension.getValue(extension)
            assertEquals(expectation.first, spec.id, extension)
            assertEquals(expectation.second, spec.languageId, extension)
            assertEquals(expectation.third, spec.command, extension)
        }
    }

    @Test
    fun `unavailable server message includes complete command candidate`() = runTest {
        val dartSpec = defaultLspServerSpecs().single { it.id == "dart" }
        val service = LspService(
            projectRoot = File("."),
            specs = listOf(dartSpec),
            commandAvailability = { false },
        )

        val result = service.highlight(File("main.dart"), "void main() {}")

        assertEquals("dart", result.languageId)
        assertContains(result.message.orEmpty(), "dart language-server --protocol=lsp")
        assertContains(result.message.orEmpty(), "SWARM_LSP_DART")
    }

    @Test
    fun `semantic token capabilities advertise standard client support`() {
        val capabilities = semanticTokensClientCapabilities()
        val tokenTypes = capabilities.getValue("tokenTypes").jsonArray.map { it.jsonPrimitive.content }
        val tokenModifiers = capabilities.getValue("tokenModifiers").jsonArray.map { it.jsonPrimitive.content }
        val formats = capabilities.getValue("formats").jsonArray.map { it.jsonPrimitive.content }

        assertContains(tokenTypes, "class")
        assertContains(tokenTypes, "function")
        assertContains(tokenTypes, "label")
        assertContains(tokenModifiers, "declaration")
        assertContains(tokenModifiers, "defaultLibrary")
        assertEquals(listOf("relative"), formats)
    }

    @Test
    fun `accepts null semantic token result as empty highlight data`() {
        val response = buildJsonObject {
            put("jsonrpc", "2.0")
            put("id", 1)
            put("result", JsonNull)
        }

        assertEquals(emptyList(), semanticTokenData(response))
    }

    @Test
    fun `rejects semantic token payload when any element is not an integer`() {
        val response = buildJsonObject {
            putJsonObject("result") {
                putJsonArray("data") {
                    add(JsonPrimitive("invalid"))
                    add(JsonPrimitive(0))
                    add(JsonPrimitive(0))
                    add(JsonPrimitive(4))
                    add(JsonPrimitive(0))
                    add(JsonPrimitive(0))
                }
            }
        }

        assertEquals(emptyList(), semanticTokenData(response))
    }

    @Test
    fun `preserves complete semantic token tuples`() {
        val response = buildJsonObject {
            putJsonObject("result") {
                putJsonArray("data") {
                    listOf(0, 2, 4, 1, 0).forEach { add(JsonPrimitive(it)) }
                }
            }
        }

        assertEquals(listOf(0, 2, 4, 1, 0), semanticTokenData(response))
    }

    @Test
    fun `reads a complete LSP protocol frame`() {
        val body = """{"jsonrpc":"2.0","id":7,"result":null}"""
        val frame = "Content-Length: ${body.toByteArray().size}\r\nContent-Type: application/vscode-jsonrpc\r\n\r\n$body"
        val message = readLspMessage(ByteArrayInputStream(frame.toByteArray()), Json)

        assertEquals(7, message?.get("id")?.jsonPrimitive?.int)
        assertEquals(JsonNull, message?.get("result"))
    }

    @Test
    fun `rejects an LSP frame without content length`() {
        val frame = "Content-Type: application/vscode-jsonrpc\r\n\r\n{}"

        val error = assertFailsWith<IllegalStateException> {
            readLspMessage(ByteArrayInputStream(frame.toByteArray()), Json)
        }

        assertContains(error.message.orEmpty(), "Content-Length")
    }

    @Test
    fun `rejects oversized LSP frames before reading the body`() {
        val frame = "Content-Length: ${16 * 1024 * 1024 + 1}\r\n\r\n"

        val error = assertFailsWith<IllegalStateException> {
            readLspMessage(ByteArrayInputStream(frame.toByteArray()), Json)
        }

        assertContains(error.message.orEmpty(), "Content-Length")
    }

    @Test
    fun `rejects truncated LSP frame bodies`() {
        val frame = "Content-Length: 10\r\n\r\n{}"

        val error = assertFailsWith<IllegalStateException> {
            readLspMessage(ByteArrayInputStream(frame.toByteArray()), Json)
        }

        assertContains(error.message.orEmpty(), "message body")
    }

    @Test
    fun `gopls initialization enables semantic tokens and workspace folder`() {
        val spec = defaultLspServerSpecs().single { it.id == "go" }
        val root = File("/tmp/swarm-go-project")
        val params = lspInitializeParams(root, spec)
        val folder = params.getValue("workspaceFolders").jsonArray.single().jsonObject

        assertTrue(
            params.getValue("initializationOptions")
                .jsonObject
                .getValue("semanticTokens")
                .jsonPrimitive
                .boolean,
        )
        assertEquals(root.toURI().toString(), params.getValue("rootUri").jsonPrimitive.content)
        assertEquals(root.toURI().toString(), folder.getValue("uri").jsonPrimitive.content)
        assertEquals("swarm-go-project", folder.getValue("name").jsonPrimitive.content)
    }

    @Test
    fun `answers workspace configuration requests without blocking the server`() {
        val response = serverRequestResponse(
            request = buildJsonObject {
                put("jsonrpc", "2.0")
                put("id", "server-1")
                put("method", "workspace/configuration")
                putJsonObject("params") {
                    putJsonArray("items") {
                        add(buildJsonObject { put("section", "kotlin") })
                        add(buildJsonObject { put("section", "editor") })
                    }
                }
            },
            projectRoot = File("/tmp/swarm-project"),
        )

        assertEquals("server-1", response?.get("id")?.jsonPrimitive?.content)
        val result = response?.get("result")?.jsonArray.orEmpty()
        assertEquals(2, result.size)
        assertTrue(result.all { it == JsonNull })
    }

    @Test
    fun `returns project workspace folder to language server`() {
        val response = serverRequestResponse(
            request = buildJsonObject {
                put("jsonrpc", "2.0")
                put("id", 7)
                put("method", "workspace/workspaceFolders")
            },
            projectRoot = File("/tmp/swarm-project"),
        )
        val folder = response?.get("result")?.jsonArray?.single()?.jsonObject

        assertEquals(7, response?.get("id")?.jsonPrimitive?.int)
        assertEquals("swarm-project", folder?.get("name")?.jsonPrimitive?.content)
        assertEquals(File("/tmp/swarm-project").toURI().toString(), folder?.get("uri")?.jsonPrimitive?.content)
    }

    @Test
    fun `rejects unsupported server request with method not found`() {
        val response = serverRequestResponse(
            request = buildJsonObject {
                put("jsonrpc", "2.0")
                put("id", 9)
                put("method", "custom/serverRequest")
            },
            projectRoot = File("."),
        )
        val error = response?.get("error")?.jsonObject

        assertEquals(-32601, error?.get("code")?.jsonPrimitive?.int)
        assertContains(error?.get("message")?.jsonPrimitive?.content.orEmpty(), "custom/serverRequest")
    }

    @Test
    fun `document synchronization remains consistent when preview is cancelled`() = runTest {
        val synchronizer = LspDocumentSynchronizer("kotlin")
        val enteredNotify = CompletableDeferred<Unit>()
        val releaseNotify = CompletableDeferred<Unit>()
        val methods = mutableListOf<String>()
        val uri = File("Main.kt").toURI().toString()
        val first = launch {
            synchronizer.sync(uri, "class First") { method, _ ->
                enteredNotify.complete(Unit)
                releaseNotify.await()
                methods += method
            }
        }

        enteredNotify.await()
        first.cancel()
        releaseNotify.complete(Unit)
        first.join()
        synchronizer.sync(uri, "class Second") { method, _ -> methods += method }

        assertEquals(listOf("textDocument/didOpen", "textDocument/didChange"), methods)
    }

    @Test
    fun `failed document notification does not advance local state`() = runTest {
        val synchronizer = LspDocumentSynchronizer("kotlin")
        val uri = File("Main.kt").toURI().toString()
        assertFailsWith<IllegalStateException> {
            synchronizer.sync(uri, "class First") { _, _ -> error("write failed") }
        }
        var retryMethod = ""

        synchronizer.sync(uri, "class First") { method, _ -> retryMethod = method }

        assertEquals("textDocument/didOpen", retryMethod)
    }

    @Test
    fun `close releases every LSP session when its caller is canceled`() = runTest {
        val firstCloseStarted = CompletableDeferred<Unit>()
        val allowFirstClose = CompletableDeferred<Unit>()
        val first = GatedLspSession(firstCloseStarted, allowFirstClose)
        val second = GatedLspSession()
        val service = LspService(
            projectRoot = File("."),
            specs = listOf(
                testSpec("kotlin", setOf("kt")),
                testSpec("python", setOf("py")),
            ),
            sessionFactory = { spec -> if (spec.id == "kotlin") first else second },
            commandAvailability = { true },
        )
        service.highlight(File("Main.kt"), "fun main() = Unit")
        service.highlight(File("main.py"), "print('ready')")

        val close = async { service.close() }
        firstCloseStarted.await()
        close.cancel()
        allowFirstClose.complete(Unit)

        assertFailsWith<CancellationException> { close.await() }
        assertTrue(first.closed)
        assertTrue(second.closed)
    }

    @Test
    fun `close terminates an LSP server that ignores shutdown`() = runBlocking {
        val projectRoot = Files.createTempDirectory("lsp-close-test")
        val script = projectRoot.resolve("unresponsive-lsp.js")
        Files.writeString(script, UNRESPONSIVE_LSP_SERVER)
        val service = LspService(
            projectRoot = projectRoot.toFile(),
            specs = listOf(
                LspServerSpec(
                    id = "test",
                    displayName = "Unresponsive LSP",
                    languageId = "test",
                    extensions = setOf("test"),
                    commandCandidates = listOf(listOf("node", script.toString())),
                ),
            ),
            commandAvailability = { true },
        )

        try {
            val result = withTimeout(3_000) {
                service.highlight(projectRoot.resolve("sample.test").toFile(), "sample")
            }
            assertEquals("Unresponsive LSP", result.serverName)

            withTimeout(2_000) { service.close() }
        } finally {
            service.close()
            projectRoot.toFile().deleteRecursively()
        }
    }

    @Test
    fun `concurrent highlights keep semantic tokens aligned with each document version`() = runBlocking {
        val projectRoot = Files.createTempDirectory("lsp-version-test")
        val script = projectRoot.resolve("versioned-lsp.js")
        val firstRequestMarker = projectRoot.resolve("first-request.marker")
        Files.writeString(script, VERSIONED_LSP_SERVER)
        val service = LspService(
            projectRoot = projectRoot.toFile(),
            specs = listOf(
                LspServerSpec(
                    id = "versioned",
                    displayName = "Versioned LSP",
                    languageId = "test",
                    extensions = setOf("test"),
                    commandCandidates = listOf(listOf("node", script.toString(), firstRequestMarker.toString())),
                ),
            ),
            commandAvailability = { true },
        )
        val file = projectRoot.resolve("sample.test").toFile()

        try {
            val first = async { service.highlight(file, "one") }
            withTimeout(2_000) {
                while (!Files.exists(firstRequestMarker)) delay(10)
            }
            val second = async { service.highlight(file, "second") }

            assertEquals(3, withTimeout(3_000) { first.await() }.highlights.single().length)
            assertEquals(6, withTimeout(3_000) { second.await() }.highlights.single().length)
        } finally {
            service.close()
            projectRoot.toFile().deleteRecursively()
        }
    }

    @Test
    fun `decodes relative semantic token positions and modifiers`() {
        val tokens = decodeSemanticTokens(
            data = listOf(
                2, 4, 6, 0, 1,
                0, 8, 3, 1, 0,
                3, 1, 5, 0, 0,
            ),
            tokenTypes = listOf("class", "method"),
            tokenModifiers = listOf("declaration"),
        )

        assertEquals(
            listOf(
                SemanticHighlight(2, 4, 6, "class", setOf("declaration")),
                SemanticHighlight(2, 12, 3, "method"),
                SemanticHighlight(5, 1, 5, "class"),
            ),
            tokens,
        )
    }

    @Test
    fun `rejects malformed semantic token data`() {
        assertEquals(emptyList(), decodeSemanticTokens(listOf(0, 0, 4), listOf("class"), emptyList()))
    }

    private fun kotlinSpec(): LspServerSpec = lspSpec(
        id = "kotlin",
        displayName = "Kotlin Language Server",
        languageId = "kotlin",
        extensions = setOf("kt", "kts"),
        fallbackCommands = kotlinCommands,
        environment = { null },
        systemProperty = { null },
    )

    private fun testSpec(id: String, extensions: Set<String>) = LspServerSpec(
        id = id,
        displayName = id,
        languageId = id,
        extensions = extensions,
        commandCandidates = listOf(listOf(id)),
    )

    private companion object {
        val kotlinCommands = listOf(listOf("kotlin-lsp"), listOf("kotlin-language-server"))

        val UNRESPONSIVE_LSP_SERVER =
            """
            let pending = Buffer.alloc(0);
            process.stdin.on("data", (chunk) => {
              pending = Buffer.concat([pending, chunk]);
              while (true) {
                const headerEnd = pending.indexOf("\r\n\r\n");
                if (headerEnd < 0) return;
                const header = pending.subarray(0, headerEnd).toString("ascii");
                const match = /Content-Length:\s*(\d+)/i.exec(header);
                if (!match) process.exit(2);
                const length = Number(match[1]);
                const bodyStart = headerEnd + 4;
                if (pending.length < bodyStart + length) return;
                const message = JSON.parse(pending.subarray(bodyStart, bodyStart + length).toString("utf8"));
                pending = pending.subarray(bodyStart + length);
                handle(message);
              }
            });
            function respond(id, result) {
              const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, result }), "utf8");
              process.stdout.write(`Content-Length: ${'$'}{body.length}\r\n\r\n`);
              process.stdout.write(body);
            }
            function handle(message) {
              switch (message.method) {
                case "initialize":
                  respond(message.id, {
                    serverInfo: { name: "Unresponsive LSP" },
                    capabilities: {
                      semanticTokensProvider: {
                        legend: { tokenTypes: ["type"], tokenModifiers: [] },
                        full: true
                      }
                    }
                  });
                  break;
                case "textDocument/semanticTokens/full":
                  respond(message.id, { data: [] });
                  break;
                case "shutdown":
                  break;
              }
            }
            """.trimIndent()

        val VERSIONED_LSP_SERVER =
            """
            const fs = require("node:fs");
            const marker = process.argv[2];
            let pending = Buffer.alloc(0);
            let currentContent = "";
            let semanticRequestCount = 0;
            process.stdin.on("data", (chunk) => {
              pending = Buffer.concat([pending, chunk]);
              while (true) {
                const headerEnd = pending.indexOf("\r\n\r\n");
                if (headerEnd < 0) return;
                const header = pending.subarray(0, headerEnd).toString("ascii");
                const match = /Content-Length:\s*(\d+)/i.exec(header);
                if (!match) process.exit(2);
                const length = Number(match[1]);
                const bodyStart = headerEnd + 4;
                if (pending.length < bodyStart + length) return;
                const message = JSON.parse(pending.subarray(bodyStart, bodyStart + length).toString("utf8"));
                pending = pending.subarray(bodyStart + length);
                handle(message);
              }
            });
            function respond(id, result) {
              const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, result }), "utf8");
              process.stdout.write(`Content-Length: ${'$'}{body.length}\r\n\r\n`);
              process.stdout.write(body);
            }
            function handle(message) {
              switch (message.method) {
                case "initialize":
                  respond(message.id, {
                    serverInfo: { name: "Versioned LSP" },
                    capabilities: {
                      semanticTokensProvider: {
                        legend: { tokenTypes: ["type"], tokenModifiers: [] },
                        full: true
                      }
                    }
                  });
                  break;
                case "textDocument/didOpen":
                  currentContent = message.params.textDocument.text;
                  break;
                case "textDocument/didChange":
                  currentContent = message.params.contentChanges[0].text;
                  break;
                case "textDocument/semanticTokens/full":
                  semanticRequestCount += 1;
                  if (semanticRequestCount === 1) fs.writeFileSync(marker, "ready");
                  setTimeout(() => {
                    respond(message.id, { data: [0, 0, currentContent.length, 0, 0] });
                  }, 200);
                  break;
                case "shutdown":
                  respond(message.id, null);
                  break;
                case "exit":
                  process.exit(0);
                  break;
              }
            }
            """.trimIndent()
    }
}

private class GatedLspSession(
    private val closeStarted: CompletableDeferred<Unit>? = null,
    private val allowClose: CompletableDeferred<Unit>? = null,
) : LspSession {
    var closed = false

    override suspend fun highlight(file: File, content: String) = LspHighlightResult(languageId = file.extension)

    override suspend fun close() {
        closeStarted?.complete(Unit)
        allowClose?.await()
        closed = true
    }
}

private class RetryableCloseLspSession(
    private val failHighlight: Boolean = false,
) : LspSession {
    var closeAttempts = 0

    override suspend fun highlight(file: File, content: String): LspHighlightResult {
        if (failHighlight) error("preferred server exited")
        return LspHighlightResult(languageId = file.extension, serverName = "retryable")
    }

    override suspend fun close() {
        closeAttempts++
        if (closeAttempts == 1) error("LSP process did not close")
    }
}
