package com.swarmeditor.backend.capability

import com.swarmeditor.common.model.CapabilityDescriptor
import com.swarmeditor.common.model.CapabilityKind
import com.swarmeditor.common.model.CapabilityPermission
import com.swarmeditor.common.model.CapabilityTrust
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class CapabilityRegistryTest {
    @Test
    fun `builtin capabilities expose declared permissions`() = runTest {
        val registry = CapabilityRegistry()

        val read = registry.check("project.search", setOf(CapabilityPermission.READ_PROJECT))
        val write = registry.check("project.search", setOf(CapabilityPermission.WRITE_PROJECT))

        assertTrue(read.allowed)
        assertFalse(write.allowed)
        assertTrue(registry.capabilities.value.any { it.id == "wasm.execute" })
    }

    @Test
    fun `unknown disabled and untrusted capabilities are denied`() = runTest {
        val registry = CapabilityRegistry(
            listOf(
                CapabilityDescriptor(
                    id = "external.tool",
                    kind = CapabilityKind.CI,
                    version = "1",
                    displayName = "External tool",
                    trust = CapabilityTrust.UNTRUSTED,
                    enabled = true,
                ),
                CapabilityDescriptor(
                    id = "disabled.tool",
                    kind = CapabilityKind.CI,
                    version = "1",
                    displayName = "Disabled tool",
                    trust = CapabilityTrust.USER_APPROVED,
                    enabled = false,
                ),
            ),
        )

        assertFalse(registry.check("missing.tool").allowed)
        assertFalse(registry.check("external.tool").allowed)
        assertFalse(registry.check("disabled.tool").allowed)
    }

    @Test
    fun `registry rejects duplicate and malformed capability identifiers`() = runTest {
        val registry = CapabilityRegistry()
        val capability = CapabilityDescriptor(
            id = "project.search",
            kind = CapabilityKind.PROJECT_EXPLORER,
            version = "1",
            displayName = "Duplicate",
            trust = CapabilityTrust.BUILTIN,
        )

        assertFailsWith<IllegalArgumentException> { registry.register(capability) }
        assertFailsWith<IllegalArgumentException> {
            CapabilityRegistry(
                listOf(capability.copy(id = "../unsafe")),
            )
        }
        assertEquals("project.search", registry.get("project.search")?.id)
    }
}
