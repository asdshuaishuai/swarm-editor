package com.swarmeditor.common.model

/**
 * Agent 原生配置字段元数据。
 *
 * 供 UI 动态渲染配置表单使用。
 */
data class ConfigFieldMeta(
    /** 字段标识，如 "apiKey" */
    val id: String,
    /** 显示标签，如 "API Key" */
    val label: String,
    /** 字段类型 */
    val type: ConfigFieldType,
    /** Select 类型的选项列表 */
    val options: List<String> = emptyList(),
    /** 是否敏感字段（脱敏显示） */
    val isSensitive: Boolean = false,
    /** 对应的环境变量名 */
    val envVarName: String? = null
)
