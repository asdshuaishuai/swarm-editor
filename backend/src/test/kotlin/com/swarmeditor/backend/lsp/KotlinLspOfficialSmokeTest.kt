package com.swarmeditor.backend.lsp

import java.io.File
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout

class KotlinLspOfficialSmokeTest {
    @Test
    fun `official archive installs and connects over stdio when fixture is provided`() = runBlocking {
        val archive = System.getenv(OFFICIAL_ARCHIVE_ENV)?.let(::File)?.takeIf(File::isFile) ?: return@runBlocking
        val installRoot = Files.createTempDirectory("official-kotlin-lsp")
        val manager = KotlinLspRuntimeManager(
            installRoot = installRoot.toFile(),
            environmentProvider = { emptyMap() },
            osNameProvider = { "Linux" },
            architectureProvider = { "amd64" },
            downloader = { _, destination -> archive.copyTo(destination, overwrite = true) },
        )

        val installed = manager.install()
        assertEquals(KotlinLspRuntimeHealth.READY, installed.health)

        val projectRoot = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
            .first { File(it, ".git").isDirectory }
        val sourceFile = File(projectRoot, "build.gradle.kts")
        val service = LspService(
            projectRoot = projectRoot,
            specs = defaultLspServerSpecs().filter { it.id == "kotlin" },
            managedCommandProvider = { manager.managedCommandOrNull() },
        )
        try {
            val result = withTimeout(90_000) { service.highlight(sourceFile, sourceFile.readText()) }
            assertNotNull(result.serverName, result.message)
            assertEquals(LspConnectionPhase.CONNECTED, service.serverStates.value.getValue("kotlin").phase)
        } finally {
            service.close()
            installRoot.toFile().deleteRecursively()
        }
    }
}

private const val OFFICIAL_ARCHIVE_ENV = "SWARM_KOTLIN_LSP_TEST_ARCHIVE"
