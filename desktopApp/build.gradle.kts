import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.gradle.api.tasks.Sync
import org.gradle.api.tasks.bundling.Compression
import org.gradle.api.tasks.bundling.Tar

plugins {
    alias(libs.plugins.kotlinJvm)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
}

val piRoot = rootProject.layout.projectDirectory.dir("pi-0.83.0")
val piResourcesRoot = layout.buildDirectory.dir("piResources")
val stagedPiRuntimeDirectory = piResourcesRoot.map { it.dir("common/pi-runtime") }

val cleanStagedPiRuntime by tasks.registering(Delete::class) {
    delete(stagedPiRuntimeDirectory)
}

val stagePiRuntime by tasks.registering(Sync::class) {
    dependsOn(":backend:preparePiRuntime", cleanStagedPiRuntime)
    into(stagedPiRuntimeDirectory)
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
    workingDir(stagedPiRuntimeDirectory)
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
    implementation(libs.jbr.api)

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

        buildTypes.release.proguard {
            isEnabled.set(false)
        }

        nativeDistributions {
            modules("java.naming")
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

val compactLauncherScript = rootProject.layout.projectDirectory.file("scripts/compact-jpackage-classpath.mjs")

fun registerLauncherClasspathTask(name: String, sourceTask: String, outputVariant: String) = tasks.register<Exec>(name) {
    dependsOn(sourceTask)
    val launcherConfig = layout.buildDirectory.file(
        "compose/binaries/$outputVariant/app/SwarmEditor/lib/app/SwarmEditor.cfg",
    )
    inputs.file(compactLauncherScript)
    inputs.file(launcherConfig)
    outputs.file(launcherConfig)
    commandLine("node", compactLauncherScript.asFile.absolutePath, launcherConfig.get().asFile.absolutePath)
}

val compactDistributableClasspath = registerLauncherClasspathTask(
    name = "compactDistributableClasspath",
    sourceTask = "createDistributable",
    outputVariant = "main",
)
val compactReleaseDistributableClasspath = registerLauncherClasspathTask(
    name = "compactReleaseDistributableClasspath",
    sourceTask = "createReleaseDistributable",
    outputVariant = "main-release",
)

tasks.matching { it.name == "createDistributable" }.configureEach {
    finalizedBy(compactDistributableClasspath)
}
tasks.matching { it.name == "createReleaseDistributable" }.configureEach {
    finalizedBy(compactReleaseDistributableClasspath)
}

tasks.register<Tar>("packageLinuxPortable") {
    dependsOn(compactReleaseDistributableClasspath)
    group = "distribution"
    description = "Builds a self-contained Linux tar.gz without native package-manager dependencies"
    compression = Compression.GZIP
    archiveFileName.set("SwarmEditor-${compose.desktop.application.nativeDistributions.packageVersion}-linux-${System.getProperty("os.arch")}.tar.gz")
    destinationDirectory.set(layout.buildDirectory.dir("compose/binaries/main/portable"))
    from(layout.buildDirectory.dir("compose/binaries/main-release/app")) {
        include("SwarmEditor/**")
        filesMatching(
            listOf(
                "SwarmEditor/bin/SwarmEditor",
                "SwarmEditor/lib/libapplauncher.so",
                "SwarmEditor/lib/runtime/lib/jexec",
                "SwarmEditor/lib/runtime/lib/jspawnhelper",
            ),
        ) {
            permissions { unix("rwxr-xr-x") }
        }
    }
    doFirst {
        check(System.getProperty("os.name").startsWith("Linux", ignoreCase = true)) {
            "packageLinuxPortable can only run on Linux"
        }
    }
}
