package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmArtifactFileOperation
import com.swarmeditor.common.model.SwarmArtifactHunkDependencyKind
import com.swarmeditor.common.model.SwarmArtifactRiskLevel
import com.swarmeditor.common.model.SwarmArtifactRiskReason
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SwarmArtifactRiskAnalyzerTest {
    @Test
    fun `splits unified diff into stable review hunks`() {
        val diff = """
            diff --git a/src/App.kt b/src/App.kt
            index 1111111..2222222 100644
            --- a/src/App.kt
            +++ b/src/App.kt
            @@ -1,2 +1,3 @@
             fun main() {
            +    println("ready")
             }
            @@ -8,1 +9,2 @@
             val mode = "safe"
            +val enabled = true
        """.trimIndent()

        val first = SwarmArtifactRiskAnalyzer.analyze(diff)
        val second = SwarmArtifactRiskAnalyzer.analyze(diff)

        assertEquals(2, first.size)
        assertEquals(first.map { it.id }, second.map { it.id })
        assertEquals(listOf("src/App.kt", "src/App.kt"), first.map { it.path })
        assertEquals(listOf(1, 1), first.map { it.addedLineCount })
        assertEquals(listOf(1, 8), first.map { it.oldStartLine })
        assertEquals(listOf(1, 9), first.map { it.newStartLine })
    }

    @Test
    fun `marks execution and public contract changes as high risk`() {
        val diff = """
            diff --git a/common/src/commonMain/kotlin/Runtime.kt b/common/src/commonMain/kotlin/Runtime.kt
            --- a/common/src/commonMain/kotlin/Runtime.kt
            +++ b/common/src/commonMain/kotlin/Runtime.kt
            @@ -1,1 +1,3 @@
            -class RuntimeConfig
            +@Serializable
            +data class RuntimeConfig(val command: String)
            +fun launch() = ProcessBuilder(command).start()
        """.trimIndent()

        val hunk = SwarmArtifactRiskAnalyzer.analyze(diff).single()

        assertEquals(SwarmArtifactRiskLevel.HIGH, hunk.riskLevel)
        assertTrue(SwarmArtifactRiskReason.PUBLIC_CONTRACT in hunk.riskReasons)
        assertTrue(SwarmArtifactRiskReason.PROCESS_OR_TOOL_EXECUTION in hunk.riskReasons)
    }

    @Test
    fun `keeps ordinary localized edits low risk`() {
        val diff = """
            diff --git a/desktopApp/src/main/kotlin/ui/Label.kt b/desktopApp/src/main/kotlin/ui/Label.kt
            --- a/desktopApp/src/main/kotlin/ui/Label.kt
            +++ b/desktopApp/src/main/kotlin/ui/Label.kt
            @@ -1,1 +1,1 @@
            -Text("Old")
            +Text("New")
        """.trimIndent()

        assertEquals(SwarmArtifactRiskLevel.LOW, SwarmArtifactRiskAnalyzer.analyze(diff).single().riskLevel)
    }

    @Test
    fun `requires explicit review for binary changes`() {
        val diff = """
            diff --git a/assets/icon.png b/assets/icon.png
            index 1111111..2222222 100644
            Binary files a/assets/icon.png and b/assets/icon.png differ
        """.trimIndent()

        val hunk = SwarmArtifactRiskAnalyzer.analyze(diff).single()

        assertEquals(SwarmArtifactRiskLevel.HIGH, hunk.riskLevel)
        assertTrue(SwarmArtifactRiskReason.BINARY_OR_GENERATED in hunk.riskReasons)
        assertEquals(SwarmArtifactFileOperation.BINARY, hunk.fileOperation)
    }

    @Test
    fun `links declaration hunks to changed symbol references`() {
        val diff = """
            diff --git a/src/Calculator.kt b/src/Calculator.kt
            --- a/src/Calculator.kt
            +++ b/src/Calculator.kt
            @@ -1,1 +1,1 @@
            -fun oldTotal() = 1
            +fun calculateTotal() = 1
            diff --git a/src/Usage.kt b/src/Usage.kt
            --- a/src/Usage.kt
            +++ b/src/Usage.kt
            @@ -3,1 +3,1 @@
            -val total = oldTotal()
            +val total = calculateTotal()
        """.trimIndent()
        val hunks = SwarmArtifactRiskAnalyzer.analyze(diff)

        val dependencies = SwarmArtifactRiskAnalyzer.dependencies(hunks)
        val components = SwarmArtifactRiskAnalyzer.dependencyComponents(hunks, dependencies)
        val componentByHunkId = components.flatMap { component ->
            component.hunkIds.map { hunkId -> hunkId to component }
        }.toMap()

        assertTrue(
            dependencies.any { dependency ->
                dependency.prerequisiteHunkId == hunks[0].id &&
                    dependency.dependentHunkId == hunks[1].id &&
                    dependency.kind == SwarmArtifactHunkDependencyKind.SYMBOL_REFERENCE &&
                    dependency.symbol == "calculateTotal"
                }
        )
        assertEquals(2, components.size)
        assertEquals(
            listOf(componentByHunkId.getValue(hunks[0].id).id),
            componentByHunkId.getValue(hunks[1].id).prerequisiteComponentIds,
        )
        assertTrue(components.none { it.cyclic })
    }

    @Test
    fun `couples hunks that share a file lifecycle operation`() {
        val diff = """
            diff --git a/src/NewFile.kt b/src/NewFile.kt
            new file mode 100644
            --- /dev/null
            +++ b/src/NewFile.kt
            @@ -0,0 +1,2 @@
            +class NewFile
            +fun first() = 1
            @@ -0,0 +20,1 @@
            +fun second() = first()
            @@ -0,0 +40,1 @@
            +fun third() = second()
        """.trimIndent()
        val hunks = SwarmArtifactRiskAnalyzer.analyze(diff)

        val dependencies = SwarmArtifactRiskAnalyzer.dependencies(hunks)
        val lifecycleDependencies = dependencies.filter {
            it.kind == SwarmArtifactHunkDependencyKind.FILE_LIFECYCLE
        }
        val components = SwarmArtifactRiskAnalyzer.dependencyComponents(hunks, dependencies)

        assertEquals(List(3) { SwarmArtifactFileOperation.ADDED }, hunks.map { it.fileOperation })
        assertEquals(4, lifecycleDependencies.size)
        assertTrue(
            hunks.drop(1).all { hunk ->
                lifecycleDependencies.any {
                    it.prerequisiteHunkId == hunks.first().id && it.dependentHunkId == hunk.id
                } && lifecycleDependencies.any {
                    it.prerequisiteHunkId == hunk.id && it.dependentHunkId == hunks.first().id
                }
            }
        )
        assertEquals(1, components.size)
        assertEquals(hunks.map { it.id }, components.single().hunkIds)
        assertTrue(components.single().cyclic)
        assertTrue(components.single().prerequisiteComponentIds.isEmpty())
    }
}
