package com.swarmeditor.backend.pi

import java.io.File
import java.nio.file.Files
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

@OptIn(ExperimentalPathApi::class)
class PiModelConfigServiceTest {

    private fun createService(directory: File, onInvalidate: suspend () -> Unit = {}): PiModelConfigService =
        PiModelConfigService(
            invalidateRuntimes = onInvalidate,
            agentDirectoryProvider = { directory },
        )

    @Test
    fun `empty directory exposes empty provider view`() = runTest {
        val directory = Files.createTempDirectory("pi-config-empty")
        try {
            val service = createService(directory.toFile())
            service.load()
            assertTrue(service.state.value.providers.isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `upserting a provider writes models auth and reloads view`() = runTest {
        val directory = Files.createTempDirectory("pi-config-upsert")
        try {
            val service = createService(directory.toFile())
            service.upsertProvider(
                providerId = "minimax-cn",
                name = "MiniMax CN",
                baseUrl = "https://api.minimaxi.com/anthropic",
                api = "anthropic-messages",
                apiKey = "sk-secret",
                authHeader = true,
            )

            val state = service.state.value
            assertEquals(1, state.providers.size)
            val provider = state.providers.single()
            assertEquals("minimax-cn", provider.id)
            assertEquals("MiniMax CN", provider.name)
            assertEquals("https://api.minimaxi.com/anthropic", provider.baseUrl)
            assertEquals("anthropic-messages", provider.api)
            assertEquals("sk-secret", provider.apiKey)
            assertTrue(provider.authHeader)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `file round-trip keeps provider and api key across reload`() = runTest {
        val directory = Files.createTempDirectory("pi-config-roundtrip")
        try {
            createService(directory.toFile()).upsertProvider(
                providerId = "deepseek",
                name = "DeepSeek",
                baseUrl = "https://api.deepseek.com",
                api = "openai-completions",
                apiKey = "sk-ds",
                authHeader = false,
            )

            val reloaded = createService(directory.toFile())
            reloaded.load()
            val provider = reloaded.state.value.providers.single()
            assertEquals("deepseek", provider.id)
            assertEquals("https://api.deepseek.com", provider.baseUrl)
            assertEquals("sk-ds", provider.apiKey)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `set defaults writes settings and reloads view`() = runTest {
        val directory = Files.createTempDirectory("pi-config-defaults")
        try {
            val service = createService(directory.toFile())
            service.setDefaults(
                defaultProvider = "minimax-cn",
                defaultModel = "MiniMax-M2.7",
                defaultThinkingLevel = "medium",
            )

            val state = service.state.value
            assertEquals("minimax-cn", state.defaultProvider)
            assertEquals("MiniMax-M2.7", state.defaultModel)
            assertEquals("medium", state.defaultThinkingLevel)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `delete provider removes from models and auth`() = runTest {
        val directory = Files.createTempDirectory("pi-config-delete")
        try {
            val service = createService(directory.toFile())
            service.upsertProvider("alpha", "Alpha", "https://a.example", "openai", "key-a", false)
            service.upsertProvider("beta", "Beta", "https://b.example", "openai", "key-b", false)

            service.deleteProvider("alpha")

            val state = service.state.value
            assertEquals(listOf("beta"), state.providers.map { it.id })
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `apply changes triggers runtime invalidation`() = runTest {
        val directory = Files.createTempDirectory("pi-config-invalidate")
        try {
            var invalidated = false
            val service = createService(directory.toFile()) { invalidated = true }
            service.applyChanges()
            assertTrue(invalidated)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `upserting a model endpoint adds it under the provider`() = runTest {
        val directory = Files.createTempDirectory("pi-config-model-add")
        try {
            val service = createService(directory.toFile())
            service.upsertProvider("minimax-cn", "MiniMax CN", "https://api.minimaxi.com", "anthropic-messages", "sk", false)
            service.upsertModel("minimax-cn", "MiniMax-M2.7", "MiniMax M2.7", "https://api.minimaxi.com/anthropic", true)

            val state = service.state.value
            val provider = state.providers.single()
            assertEquals(1, provider.models.size)
            val model = provider.models.single()
            assertEquals("MiniMax-M2.7", model.id)
            assertEquals("MiniMax M2.7", model.name)
            assertEquals("https://api.minimaxi.com/anthropic", model.baseUrl)
            assertTrue(model.reasoning)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `updating an existing model endpoint preserves other fields`() = runTest {
        val directory = Files.createTempDirectory("pi-config-model-update")
        try {
            val service = createService(directory.toFile())
            service.upsertProvider("deepseek", "DeepSeek", "https://api.deepseek.com", "openai-completions", "sk", false)
            service.upsertModel("deepseek", "deepseek-chat", "DeepSeek Chat", "https://api.deepseek.com/v1", false)
            // 更新：同名 ID 覆盖，携带 contextWindow 保留字段
            service.upsertModel("deepseek", "deepseek-chat", "DeepSeek Chat V3", "", true)

            val state = service.state.value
            val model = state.providers.single().models.single()
            assertEquals("deepseek-chat", model.id)
            assertEquals("DeepSeek Chat V3", model.name)
            assertTrue(model.reasoning)
            // 更新时未传 baseUrl，保留原值
            assertEquals("https://api.deepseek.com/v1", model.baseUrl)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `deleting a model endpoint removes it`() = runTest {
        val directory = Files.createTempDirectory("pi-config-model-delete")
        try {
            val service = createService(directory.toFile())
            service.upsertProvider("alpha", "Alpha", "https://a.example", "openai", "key", false)
            service.upsertModel("alpha", "alpha-1", "Alpha 1", "", false)
            service.upsertModel("alpha", "alpha-2", "Alpha 2", "", false)

            service.deleteModel("alpha", "alpha-1")

            val state = service.state.value
            assertEquals(listOf("alpha-2"), state.providers.single().models.map { it.id })
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `model endpoints round-trip across reload`() = runTest {
        val directory = Files.createTempDirectory("pi-config-model-roundtrip")
        try {
            createService(directory.toFile()).run {
                upsertProvider("beta", "Beta", "https://b.example", "anthropic-messages", "key", false)
                upsertModel("beta", "beta-3", "Beta 3", "https://b.example/v1", true)
            }

            val reloaded = createService(directory.toFile())
            reloaded.load()
            val model = reloaded.state.value.providers.single().models.single()
            assertEquals("beta-3", model.id)
            assertTrue(model.reasoning)
        } finally {
            directory.deleteRecursively()
        }
    }
}
