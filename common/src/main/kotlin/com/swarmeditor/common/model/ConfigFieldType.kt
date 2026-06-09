package com.swarmeditor.common.model

/**
 * Agent 原生配置字段类型。
 */
enum class ConfigFieldType {
    /** 普通文本输入 */
    Text,
    /** 密码输入（脱敏显示） */
    Password,
    /** 下拉选择 */
    Select,
    /** 数字输入 */
    Number
}
