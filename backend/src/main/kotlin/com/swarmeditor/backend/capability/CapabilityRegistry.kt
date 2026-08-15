package com.swarmeditor.backend.capability

import com.swarmeditor.common.model.CapabilityDecision
import com.swarmeditor.common.model.CapabilityDescriptor
import com.swarmeditor.common.model.CapabilityKind
import com.swarmeditor.common.model.CapabilityPermission
import com.swarmeditor.common.model.CapabilityTrust
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class CapabilityRegistry(
    initialCapabilities: Collection<CapabilityDescriptor> = defaultCapabilities(),
) {
    private val mutex = Mutex()
    private val byId = linkedMapOf<String, CapabilityDescriptor>()
    private val _capabilities = MutableStateFlow<List<CapabilityDescriptor>>(emptyList())

    init {
        initialCapabilities.forEach { capability ->
            validate(capability)
            require(byId.put(capability.id, capability) == null) {
                "Duplicate capability id: ${capability.id}"
            }
        }
        publishLocked()
    }

    val capabilities: StateFlow<List<CapabilityDescriptor>> = _capabilities.asStateFlow()

    suspend fun register(capability: CapabilityDescriptor) = mutex.withLock {
        validate(capability)
        require(!byId.containsKey(capability.id)) { "Capability already registered: ${capability.id}" }
        byId[capability.id] = capability
        publishLocked()
    }

    suspend fun replace(capability: CapabilityDescriptor) = mutex.withLock {
        validate(capability)
        require(byId.containsKey(capability.id)) { "Capability is not registered: ${capability.id}" }
        byId[capability.id] = capability
        publishLocked()
    }

    suspend fun remove(id: String): CapabilityDescriptor? = mutex.withLock {
        val removed = byId.remove(id)
        if (removed != null) publishLocked()
        removed
    }

    suspend fun get(id: String): CapabilityDescriptor? = mutex.withLock { byId[id] }

    suspend fun check(
        id: String,
        requestedPermissions: Set<CapabilityPermission> = emptySet(),
    ): CapabilityDecision = mutex.withLock {
        val capability = byId[id]
        if (capability == null) {
            return@withLock CapabilityDecision(
                capabilityId = id,
                allowed = false,
                requestedPermissions = requestedPermissions,
                reason = "Capability is not registered",
            )
        }
        if (!capability.enabled) {
            return@withLock CapabilityDecision(
                capabilityId = id,
                allowed = false,
                requestedPermissions = requestedPermissions,
                reason = "Capability is disabled",
            )
        }
        if (capability.trust == CapabilityTrust.UNTRUSTED) {
            return@withLock CapabilityDecision(
                capabilityId = id,
                allowed = false,
                requestedPermissions = requestedPermissions,
                reason = "Capability trust is not admitted",
            )
        }
        val missing = requestedPermissions - capability.permissions
        if (missing.isNotEmpty()) {
            return@withLock CapabilityDecision(
                capabilityId = id,
                allowed = false,
                requestedPermissions = requestedPermissions,
                grantedPermissions = capability.permissions,
                reason = "Requested permissions are not declared: ${missing.joinToString(",")}",
            )
        }
        CapabilityDecision(
            capabilityId = id,
            allowed = true,
            requestedPermissions = requestedPermissions,
            grantedPermissions = requestedPermissions,
            reason = "Capability admitted",
        )
    }

    private fun publishLocked() {
        _capabilities.value = byId.values.sortedBy(CapabilityDescriptor::id)
    }

    private fun validate(capability: CapabilityDescriptor) {
        require(capability.id.matches(ID_PATTERN)) { "Invalid capability id: ${capability.id}" }
        require(capability.version.isNotBlank()) { "Capability version cannot be blank" }
        require(capability.displayName.isNotBlank()) { "Capability display name cannot be blank" }
    }

    companion object {
        private val ID_PATTERN = Regex("[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*")

        fun defaultCapabilities(): List<CapabilityDescriptor> = listOf(
            CapabilityDescriptor(
                id = "swarm.create",
                kind = CapabilityKind.ORCHESTRATION,
                version = "1",
                displayName = "Create Swarm run",
                description = "Create a durable Swarm delivery envelope and pending task graph.",
                trust = CapabilityTrust.BUILTIN,
            ),
            CapabilityDescriptor(
                id = "review.open",
                kind = CapabilityKind.ORCHESTRATION,
                version = "1",
                displayName = "Open review package",
                description = "Create a durable review package and its delivery envelope.",
                trust = CapabilityTrust.BUILTIN,
            ),
            CapabilityDescriptor(
                id = "project.search",
                kind = CapabilityKind.PROJECT_EXPLORER,
                version = "1",
                displayName = "Project search",
                description = "Bounded read-only text and symbol exploration.",
                trust = CapabilityTrust.BUILTIN,
                permissions = setOf(CapabilityPermission.READ_PROJECT),
            ),
            CapabilityDescriptor(
                id = "lsp.inspect",
                kind = CapabilityKind.LSP,
                version = "1",
                displayName = "LSP inspection",
                description = "Read-only symbols, diagnostics and source locations.",
                trust = CapabilityTrust.BUILTIN,
                permissions = setOf(CapabilityPermission.READ_PROJECT),
            ),
            CapabilityDescriptor(
                id = "pi.read",
                kind = CapabilityKind.PI_TOOL,
                version = "1",
                displayName = "Pi read tool",
                trust = CapabilityTrust.BUILTIN,
                permissions = setOf(CapabilityPermission.READ_PROJECT),
            ),
            CapabilityDescriptor(
                id = "pi.edit",
                kind = CapabilityKind.PI_TOOL,
                version = "1",
                displayName = "Pi edit tool",
                trust = CapabilityTrust.BUILTIN,
                permissions = setOf(CapabilityPermission.READ_PROJECT, CapabilityPermission.WRITE_PROJECT),
            ),
            CapabilityDescriptor(
                id = "pi.bash",
                kind = CapabilityKind.PI_TOOL,
                version = "1",
                displayName = "Pi command tool",
                trust = CapabilityTrust.BUILTIN,
                permissions = setOf(CapabilityPermission.EXECUTE_PROCESS),
            ),
            CapabilityDescriptor(
                id = "wasm.execute",
                kind = CapabilityKind.WASM_PLUGIN,
                version = "1",
                displayName = "WASM plugin execution",
                trust = CapabilityTrust.USER_APPROVED,
                permissions = setOf(CapabilityPermission.EXECUTE_PROCESS),
            ),
        )
    }
}
