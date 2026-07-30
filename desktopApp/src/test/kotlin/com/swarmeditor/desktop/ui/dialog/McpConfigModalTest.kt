package com.swarmeditor.desktop.ui.dialog

import kotlin.test.Test
import kotlin.test.assertEquals

class McpConfigModalTest {
    @Test
    fun `parses semicolon and newline separated key value fields`() {
        val parsed = parseKeyValueList("TOKEN=secret; X-Tenant=swarm\nEMPTY=")

        assertEquals(
            mapOf("TOKEN" to "secret", "X-Tenant" to "swarm", "EMPTY" to ""),
            parsed
        )
    }

    @Test
    fun `ignores malformed key value fields`() {
        assertEquals(mapOf("VALID" to "value=with=equals"), parseKeyValueList("broken; =missing; VALID=value=with=equals"))
    }
}
