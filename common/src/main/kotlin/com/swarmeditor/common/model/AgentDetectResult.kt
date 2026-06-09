package com.swarmeditor.common.model

/**
 * Agent 检测结果 — 表示 [AgentAdapter.detect] 的三态返回值。
 *
 * 三态语义：
 * - [found]: 检测到 Agent，版本可用
 * - [foundButFailed]: 检测到 Agent，但版本不兼容或执行失败
 * - [notFound]: 未检测到 Agent
 *
 * @property version 版本号字符串
 * @property executablePath 可执行文件路径（[found] 时有值）
 * @property isCompatible 是否兼容可用
 * @property errorMessage 错误描述（检测失败时有值）
 */
data class AgentDetectResult(
    val version: String,
    val executablePath: String?,
    val isCompatible: Boolean,
    val errorMessage: String?
) {
    companion object {
        /**
         * 检测到 Agent，版本可用。
         */
        fun found(version: String, path: String): AgentDetectResult = AgentDetectResult(
            version = version,
            executablePath = path,
            isCompatible = true,
            errorMessage = null
        )

        /**
         * 检测到 Agent，但版本不兼容或执行失败。
         */
        fun foundButFailed(version: String, error: String): AgentDetectResult = AgentDetectResult(
            version = version,
            executablePath = null,
            isCompatible = false,
            errorMessage = error
        )

        /**
         * 未检测到 Agent。
         */
        fun notFound(error: String): AgentDetectResult = AgentDetectResult(
            version = "",
            executablePath = null,
            isCompatible = false,
            errorMessage = error
        )
    }
}
