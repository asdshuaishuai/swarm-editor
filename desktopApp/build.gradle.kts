import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.gradle.api.tasks.Sync

plugins {
    alias(libs.plugins.kotlinJvm)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
}

val piRoot = rootProject.layout.projectDirectory.dir("pi-0.80.10")
val piResourcesRoot = layout.buildDirectory.dir("piResources")

val stagePiRuntime by tasks.registering(Sync::class) {
    dependsOn(":backend:preparePiRuntime")
    val runtimeDirectory = piResourcesRoot.map { it.dir("common/pi-runtime") }
    into(runtimeDirectory)
    doFirst {
        delete(runtimeDirectory)
    }
    from(piRoot) {
        include("package.json")
        include("package-lock.json")
        include("packages/*/package.json")
        include("packages/coding-agent/examples/extensions/*/package.json")
        include("packages/tui/dist/**")
        include("packages/ai/dist/**")
        include("packages/agent/dist/**")
        include("packages/coding-agent/dist/**")
    }
}

val installStagedPiRuntime by tasks.registering(Exec::class) {
    dependsOn(stagePiRuntime)
    workingDir(piResourcesRoot.map { it.dir("common/pi-runtime") })
    commandLine("npm", "ci", "--omit=dev", "--ignore-scripts")
    inputs.files(piRoot.file("package.json"), piRoot.file("package-lock.json"))
    outputs.file(piResourcesRoot.map { it.file("common/pi-runtime/node_modules/.package-lock.json") })
}

dependencies {
    implementation(projects.common)
    implementation(projects.backend)

    // Compose Desktop
    implementation(compose.desktop.currentOs)
    implementation(compose.material3)
    implementation(compose.foundation)
    implementation(compose.runtime)
    implementation(libs.compose.components.resources)
    implementation(compose.materialIconsExtended)
    implementation(libs.compose.uiToolingPreview)

    // UI libs (Hybrid redesign: haze blur, Lucide icons, markdown render)
    implementation(libs.haze)
    implementation(libs.lucide.icons)  // woowla feather icons (Lucide 前身，同款线性)
    implementation(libs.markdown.renderer)

    // Coroutines
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.swing)

    // Serialization
    implementation(libs.kotlinx.serialization.json)

    // AndroidX Lifecycle (for ViewModel in Compose)
    implementation(libs.androidx.lifecycle.viewmodelCompose)
    implementation(libs.androidx.lifecycle.runtimeCompose)

    // Decompose (navigation & lifecycle)
    implementation(libs.decompose)
    implementation(libs.decompose.extensions.compose)

    testImplementation(libs.kotlin.test)
    testImplementation(libs.kotlinx.coroutines.test)
}

compose.resources {
    packageOfResClass = "com.swarmeditor.desktop.resources"
}

compose.desktop {
    application {
        mainClass = "com.swarmeditor.desktop.MainKt"

        nativeDistributions {
            appResourcesRootDir.set(piResourcesRoot)
            targetFormats(TargetFormat.Dmg, TargetFormat.Msi, TargetFormat.Deb)
            packageName = "SwarmEditor"
            packageVersion = "1.0.0"

            linux {
                iconFile.set(project.file("src/main/packageResources/swarm-editor.png"))
            }
            windows {
                iconFile.set(project.file("src/main/packageResources/swarm-editor.ico"))
            }
            macOS {
                iconFile.set(project.file("src/main/packageResources/swarm-editor.icns"))
            }
        }
    }
}

tasks.matching { task ->
    task.name.startsWith("package") ||
        task.name == "createDistributable" ||
        task.name == "prepareAppResources"
}.configureEach {
    dependsOn(installStagedPiRuntime)
}
