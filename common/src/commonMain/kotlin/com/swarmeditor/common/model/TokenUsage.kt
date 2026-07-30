package com.swarmeditor.common.model

import kotlinx.serialization.Serializable

@Serializable
data class TokenUsage(
    val input: Long = 0,
    val output: Long = 0,
    val cacheRead: Long = 0,
    val cacheWrite: Long = 0,
    val total: Long = 0,
    val cost: Double = 0.0,
) {
    operator fun plus(other: TokenUsage): TokenUsage = TokenUsage(
        input = input + other.input,
        output = output + other.output,
        cacheRead = cacheRead + other.cacheRead,
        cacheWrite = cacheWrite + other.cacheWrite,
        total = total + other.total,
        cost = cost + other.cost,
    )
}
