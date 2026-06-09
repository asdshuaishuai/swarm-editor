package com.swarmeditor.backend.agent

/**
 * Provider 预设 — 描述 Agent 可用的 LLM 服务提供商配置。
 */
data class ProviderPreset(val name: String, val baseUrl: String, val model: String)
