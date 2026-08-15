package com.swarmeditor.common.model

import kotlinx.serialization.Serializable

@Serializable
enum class CapabilityKind {
    PROJECT_EXPLORER,
    PI_TOOL,
    LSP,
    WASM_PLUGIN,
    IDE_ACTION,
    CI,
    ORCHESTRATION,
}

@Serializable
enum class CapabilityTrust {
    BUILTIN,
    PROJECT_TRUSTED,
    USER_APPROVED,
    EXTERNAL,
    UNTRUSTED,
}

@Serializable
enum class CapabilityPermission {
    READ_PROJECT,
    WRITE_PROJECT,
    EXECUTE_PROCESS,
    NETWORK,
    READ_SECRET,
    WRITE_SYSTEM,
}

@Serializable
data class CapabilityDescriptor(
    val id: String,
    val kind: CapabilityKind,
    val version: String,
    val displayName: String,
    val description: String = "",
    val trust: CapabilityTrust,
    val permissions: Set<CapabilityPermission> = emptySet(),
    val source: String = "builtin",
    val enabled: Boolean = true,
)

@Serializable
data class CapabilityDecision(
    val capabilityId: String,
    val allowed: Boolean,
    val requestedPermissions: Set<CapabilityPermission> = emptySet(),
    val grantedPermissions: Set<CapabilityPermission> = emptySet(),
    val reason: String,
)
