package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmTask
import kotlin.test.Test
import kotlin.test.assertFailsWith

class SwarmGraphTest {
    @Test
    fun `rejects cyclic task dependencies`() {
        assertFailsWith<IllegalArgumentException> {
            SwarmGraph.validate(
                listOf(
                    task("a", dependsOn = listOf("b")),
                    task("b", dependsOn = listOf("a")),
                )
            )
        }
    }

    @Test
    fun `rejects missing dependency`() {
        assertFailsWith<IllegalArgumentException> {
            SwarmGraph.validate(listOf(task("a", dependsOn = listOf("missing"))))
        }
    }

    private fun task(id: String, dependsOn: List<String> = emptyList()) = SwarmTask(
        id = id,
        title = id,
        prompt = "Execute $id",
        dependsOn = dependsOn,
    )
}
