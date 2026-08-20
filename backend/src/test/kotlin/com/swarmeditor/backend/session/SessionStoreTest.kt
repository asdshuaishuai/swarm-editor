package com.swarmeditor.backend.session

import com.swarmeditor.common.model.ContentBlock
import com.swarmeditor.common.model.ImageData
import com.swarmeditor.common.model.MessageRole
import com.swarmeditor.common.model.Message
import com.swarmeditor.common.model.TokenUsage
import com.swarmeditor.common.model.ToolExecution
import kotlinx.coroutines.test.runTest
import java.io.File
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.test.assertNull
import com.swarmeditor.common.model.SessionStatus
import kotlin.time.Instant

class SessionStoreTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `persists title and remote session identity`() = runTest {
        val directory = Files.createTempDirectory("swarm-session-store")
        try {
            val store = SessionStore(directory.toFile())
            val created = store.create("pi-default", "Review repository")
            store.associateRemoteSession(created.id, "remote-123")

            val reloaded = SessionStore(directory.toFile())
            reloaded.load()
            val session = reloaded.get(created.id)

            assertEquals("Review repository", session?.title)
            assertEquals("remote-123", session?.remoteSessionId)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `backs up original branch and persists replacement branch atomically`() = runTest {
        val directory = Files.createTempDirectory("swarm-session-branches")
        try {
            val store = SessionStore(directory.toFile())
            val created = store.create("pi-default", "Branch session")
            store.addMessage(
                created.id,
                MessageRole.USER,
                listOf(ContentBlock(type = "text", text = "original prompt")),
            )
            val replacementMessage = Message(
                id = "pi-user-1",
                role = MessageRole.USER,
                content = listOf(ContentBlock(type = "text", text = "new branch prompt")),
                createdAt = Instant.parse("2026-07-24T12:00:00Z"),
            )

            val (branched, backup) = store.applyRemoteBranch(
                created.id,
                "remote-branched",
                listOf(replacementMessage),
            )

            assertEquals("remote-branched", branched.remoteSessionId)
            assertEquals("new branch prompt", branched.messages.single().content.single().text)
            assertTrue(backup.title.endsWith("· 原分支"))
            assertEquals("original prompt", backup.messages.single().content.single().text)

            val reloaded = SessionStore(directory.toFile()).also { it.load() }
            assertEquals(2, reloaded.getAll().size)
            assertEquals("remote-branched", reloaded.get(created.id)?.remoteSessionId)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `reconciles matching remote session without creating another backup`() = runTest {
        val directory = Files.createTempDirectory("swarm-session-reconcile")
        try {
            val store = SessionStore(directory.toFile())
            val created = store.create("pi-default", "Recover session")
            store.associateRemoteSession(created.id, "remote-active")
            val recoveredMessage = Message(
                id = "pi-user-recovered",
                role = MessageRole.USER,
                content = listOf(ContentBlock(type = "text", text = "recovered prompt")),
                createdAt = Instant.parse("2026-07-24T12:30:00Z"),
            )

            val (synchronized, backup) = store.reconcileRemoteSession(
                created.id,
                "remote-active",
                listOf(recoveredMessage),
            )

            assertEquals(null, backup)
            assertEquals("recovered prompt", synchronized.messages.single().content.single().text)
            assertEquals(1, store.getAll().size)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `reconciles changed remote identity by preserving the local branch`() = runTest {
        val directory = Files.createTempDirectory("swarm-session-reconcile-branch")
        try {
            val store = SessionStore(directory.toFile())
            val created = store.create("pi-default", "Recover branch")
            store.associateRemoteSession(created.id, "remote-old")

            val (synchronized, backup) = store.reconcileRemoteSession(
                created.id,
                "remote-new",
                emptyList(),
            )

            assertEquals("remote-new", synchronized.remoteSessionId)
            assertEquals("remote-old", backup?.remoteSessionId)
            assertEquals(2, store.getAll().size)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `persists image message content`() = runTest {
        val directory = Files.createTempDirectory("swarm-session-images")
        try {
            val store = SessionStore(directory.toFile())
            val created = store.create("pi-default", "Image session")
            store.addMessage(
                created.id,
                MessageRole.USER,
                listOf(
                    ContentBlock(type = "text", text = "inspect"),
                    ContentBlock(
                        type = "image",
                        image = ImageData("aGVsbG8=", "image/png", "screen.png")
                    )
                )
            )

            val reloaded = SessionStore(directory.toFile()).also { it.load() }
            val content = reloaded.get(created.id)?.messages?.single()?.content.orEmpty()

            assertEquals("inspect", content.first().text)
            assertEquals("screen.png", content.last().image?.name)
            assertEquals("aGVsbG8=", content.last().image?.base64)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `persists pi tool execution content`() = runTest {
        val directory = Files.createTempDirectory("swarm-session-tools")
        try {
            val store = SessionStore(directory.toFile())
            val created = store.create("pi-default", "Tool session")
            val execution = ToolExecution(
                id = "tool-1",
                name = "read",
                arguments = "{\"path\":\"README.md\"}",
                output = "README contents",
            )
            store.addMessage(
                created.id,
                MessageRole.ASSISTANT,
                listOf(
                    ContentBlock(type = "text", text = "Done"),
                    ContentBlock(type = "tool", toolExecution = execution),
                ),
            )

            val reloaded = SessionStore(directory.toFile()).also { it.load() }
            val content = reloaded.get(created.id)?.messages?.single()?.content.orEmpty()

            assertEquals("Done", content.first().text)
            assertEquals(execution, content.last().toolExecution)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `loads legacy ISO instant strings`() = runTest {
        val directory = Files.createTempDirectory("swarm-session-legacy")
        try {
            directory.resolve("legacy.json").toFile().writeText(
                """
                {
                  "id": "legacy",
                  "agentId": "pi-default",
                  "title": "Legacy session",
                  "createdAt": "2026-07-20T12:00:00Z",
                  "updatedAt": "2026-07-20T12:01:00Z",
                  "messages": [
                    {
                      "id": "message-1",
                      "role": "user",
                      "content": [{"text": "hello"}],
                      "createdAt": "2026-07-20T12:00:30Z"
                    }
                  ]
                }
                """.trimIndent()
            )

            val store = SessionStore(directory.toFile()).also { it.load() }
            val session = store.get("legacy")

            assertEquals(Instant.parse("2026-07-20T12:00:00Z"), session?.createdAt)
            assertEquals(Instant.parse("2026-07-20T12:01:00Z"), session?.updatedAt)
            assertEquals(Instant.parse("2026-07-20T12:00:30Z"), session?.messages?.single()?.createdAt)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `create rolls back memory when session file cannot be written`() = runTest {
        val parentFile = Files.createTempFile("session-store-parent", ".file").toFile()
        try {
            val store = SessionStore(File(parentFile, "sessions"))

            assertFailsWith<Exception> { store.create("pi-default", "Should fail") }
            assertEquals(emptyList(), store.getAll())
        } finally {
            parentFile.delete()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `legacy agent ids migrate to the single pi agent`() = runTest {
        val directory = Files.createTempDirectory("session-store-agent-migration")
        try {
            val sessionFile = directory.resolve("legacy-agent.json").toFile().apply {
                writeText(
                    """
                    {
                      "id": "legacy-agent",
                      "agentId": "claude-code",
                      "title": "Legacy agent session",
                      "createdAt": "2026-07-20T12:00:00Z",
                      "updatedAt": "2026-07-20T12:00:00Z"
                    }
                    """.trimIndent()
                )
            }

            val store = SessionStore(directory.toFile()).also { it.load() }

            assertEquals("pi-default", store.get("legacy-agent")?.agentId)
            assertTrue("\"agentId\": \"pi-default\"" in sessionFile.readText())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `quarantines session whose persisted id does not match its file`() = runTest {
        val directory = Files.createTempDirectory("session-store-id-integrity")
        try {
            val sessionFile = directory.resolve("safe.json").toFile().apply { writeText(
                """
                {
                  "id": "../escaped",
                  "agentId": "pi-default",
                  "createdAt": "2026-07-20T12:00:00Z",
                  "updatedAt": "2026-07-20T12:00:00Z"
                }
                """.trimIndent()
            ) }

            val store = SessionStore(directory.toFile()).also { it.load() }

            assertEquals(emptyList(), store.getAll())
            assertFalse(sessionFile.exists())
            assertEquals(1, directory.toFile().listFiles().orEmpty().count { it.name.startsWith("safe.json.corrupt-") })
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `oversized session creation rolls back memory and disk`() = runTest {
        val directory = Files.createTempDirectory("session-store-size")
        try {
            val store = SessionStore(directory.toFile(), maxFileBytes = 400)

            assertFailsWith<IllegalArgumentException> {
                store.create("pi-default", "x".repeat(1_000))
            }

            assertEquals(emptyList(), store.getAll())
            assertTrue(directory.toFile().listFiles().orEmpty().isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `persists token usage with the session`() = runTest {
        val directory = Files.createTempDirectory("session-store-token-usage")
        try {
            val store = SessionStore(directory.toFile())
            val session = store.create("pi-default", "Token usage")
            store.updateTokenUsage(
                session.id,
                TokenUsage(input = 120, output = 80, cacheRead = 40, total = 240, cost = 0.0123)
            )

            val reloaded = SessionStore(directory.toFile()).also { it.load() }
            val usage = reloaded.get(session.id)!!.tokenUsage

            assertEquals(120, usage.input)
            assertEquals(80, usage.output)
            assertEquals(40, usage.cacheRead)
            assertEquals(240, usage.total)
            assertEquals(0.0123, usage.cost)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `renames, archives, restores and deletes an archived session`() = runTest {
        val directory = Files.createTempDirectory("session-store-lifecycle")
        try {
            val store = SessionStore(directory.toFile())
            val created = store.create("pi-default", "Original title")

            store.rename(created.id, "Renamed title")
            assertEquals("Renamed title", store.get(created.id)?.title)

            store.archive(created.id)
            assertEquals(SessionStatus.ARCHIVED, store.get(created.id)?.status)

            store.unarchive(created.id)
            assertEquals(SessionStatus.ACTIVE, store.get(created.id)?.status)

            store.delete(created.id)
            assertNull(store.get(created.id))
            assertEquals(emptyList(), store.getAll())
            assertTrue(directory.toFile().listFiles().orEmpty().isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rename ignores blank title`() = runTest {
        val directory = Files.createTempDirectory("session-store-rename-blank")
        try {
            val store = SessionStore(directory.toFile())
            val session = store.create("pi-default", "Kept")
            store.rename(session.id, "   ")
            assertEquals("Kept", store.get(session.id)?.title)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `persists workspace binding and cwd`() = runTest {
        val directory = Files.createTempDirectory("session-store-workspace")
        try {
            val store = SessionStore(directory.toFile())
            val session = store.create("pi-default", "Bound", workspaceId = "workspace-1", cwd = "/work/alpha")

            assertEquals("workspace-1", session.workspaceId)
            assertEquals("/work/alpha", session.cwd)

            val reloaded = SessionStore(directory.toFile()).also { it.load() }
            assertEquals("workspace-1", reloaded.get(session.id)?.workspaceId)
            assertEquals("/work/alpha", reloaded.get(session.id)?.cwd)
        } finally {
            directory.deleteRecursively()
        }
    }
}
