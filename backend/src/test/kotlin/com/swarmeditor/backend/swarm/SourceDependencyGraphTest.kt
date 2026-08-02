package com.swarmeditor.backend.swarm

import kotlin.test.Test
import kotlin.test.assertEquals

class SourceDependencyGraphTest {
    @Test
    fun `Tarjan analysis condenses mutually dependent source files into stable clusters`() {
        val analysis = SourceDependencyGraph.analyze(
            mapOf(
                "src/a/A.kt" to """
                    package sample.a
                    import sample.b.B
                    class A(val dependency: B)
                """.trimIndent(),
                "src/b/B.kt" to """
                    package sample.b
                    import sample.a.A
                    class B(val dependency: A)
                """.trimIndent(),
                "src/c/C.kt" to """
                    package sample.c
                    import sample.a.A
                    class C(val dependency: A)
                """.trimIndent(),
            ),
        )

        assertEquals(setOf("src/b/B.kt"), analysis.dependencies.getValue("src/a/A.kt"))
        assertEquals(setOf("src/a/A.kt"), analysis.dependencies.getValue("src/b/B.kt"))
        assertEquals(setOf("src/a/A.kt"), analysis.dependencies.getValue("src/c/C.kt"))
        assertEquals(
            SourceDependencyCluster(
                id = "scc-1",
                members = listOf("src/a/A.kt", "src/b/B.kt"),
                incomingClusterIds = setOf("scc-2"),
                outgoingClusterIds = emptySet(),
            ),
            analysis.clusters.first(),
        )
    }

    @Test
    fun `relative TypeScript imports resolve index and extension candidates`() {
        val analysis = SourceDependencyGraph.analyze(
            mapOf(
                "src/a.ts" to "import { b } from './b'; export const a = b;",
                "src/b.ts" to "import { a } from './a'; export const b = a;",
            ),
        )

        assertEquals(listOf("src/a.ts", "src/b.ts"), analysis.clusters.single().members)
    }
}
