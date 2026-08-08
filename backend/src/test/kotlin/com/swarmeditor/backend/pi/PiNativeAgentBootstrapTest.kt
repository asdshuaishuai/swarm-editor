package com.swarmeditor.backend.pi

import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

@OptIn(kotlin.io.path.ExperimentalPathApi::class)
class PiNativeAgentBootstrapTest {
    @Test
    fun `seeds missing pi configuration and replaces only empty auth`() = runTest {
        val root = Files.createTempDirectory("pi-native-bootstrap")
        try {
            val native = root.resolve("native").toFile().apply { mkdirs() }
            val managed = root.resolve("managed").toFile().apply { mkdirs() }
            native.resolve("auth.json").writeText("""{"minimax-cn":{"type":"api_key","key":"secret"}}""")
            native.resolve("models-store.json").writeText("""{"minimax-cn":{"models":[]}}""")
            native.resolve("settings.json").writeText("""{"defaultProvider":"minimax-cn"}""")
            managed.resolve("auth.json").writeText("{}")
            managed.resolve("settings.json").writeText("""{"theme":"dark"}""")

            PiNativeAgentBootstrap(native).syncMissingConfiguration(managed)

            assertTrue(managed.resolve("auth.json").readText().contains("minimax-cn"))
            assertTrue(managed.resolve("models-store.json").isFile)
            assertEquals("""{"theme":"dark"}""", managed.resolve("settings.json").readText())
            assertFalse(managed.resolve("models.json").exists())
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `does not overwrite an existing non-empty auth file`() = runTest {
        val root = Files.createTempDirectory("pi-native-bootstrap-existing")
        try {
            val native = root.resolve("native").toFile().apply { mkdirs() }
            val managed = root.resolve("managed").toFile().apply { mkdirs() }
            native.resolve("auth.json").writeText("""{"minimax-cn":{"type":"api_key","key":"native"}}""")
            managed.resolve("auth.json").writeText("""{"openai":{"type":"api_key","key":"managed"}}""")

            PiNativeAgentBootstrap(native).syncMissingConfiguration(managed)

            assertEquals(
                """{"openai":{"type":"api_key","key":"managed"}}""",
                managed.resolve("auth.json").readText(),
            )
        } finally {
            root.deleteRecursively()
        }
    }
}
