plugins {
    alias(libs.plugins.kotlinJvm)
    alias(libs.plugins.kotlinSerialization)
}

dependencies {
    implementation(projects.common)

    // Coroutines
    implementation(libs.kotlinx.coroutines.core)

    // Serialization
    implementation(libs.kotlinx.serialization.json)

    // DateTime

    // Logging
    implementation(libs.oshai.kotlin.logging)
    implementation(libs.logback.classic)

    // Testing
    testImplementation(libs.kotlin.test)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.mockk)
}

val piRoot = rootProject.layout.projectDirectory.dir("pi-0.83.0")

val installPiRuntime by tasks.registering(Exec::class) {
    workingDir(piRoot)
    commandLine("npm", "ci", "--ignore-scripts")
    inputs.files(piRoot.file("package.json"), piRoot.file("package-lock.json"))
    outputs.file(piRoot.file("node_modules/.package-lock.json"))
}

val buildPiTui by tasks.registering(Exec::class) {
    dependsOn(installPiRuntime)
    workingDir(piRoot)
    commandLine("npm", "--prefix", "packages/tui", "run", "build")
    inputs.dir(piRoot.dir("packages/tui/src"))
    outputs.dir(piRoot.dir("packages/tui/dist"))
}

val buildPiAi by tasks.registering(Exec::class) {
    dependsOn(buildPiTui)
    workingDir(piRoot)
    commandLine("npm", "--prefix", "packages/ai", "run", "build:offline")
    inputs.dir(piRoot.dir("packages/ai/src"))
    outputs.dir(piRoot.dir("packages/ai/dist"))
}

val buildPiAgent by tasks.registering(Exec::class) {
    dependsOn(buildPiAi)
    workingDir(piRoot)
    commandLine("npm", "exec", "--", "tsgo", "-p", "packages/agent/tsconfig.build.json")
    inputs.dir(piRoot.dir("packages/agent/src"))
    outputs.dir(piRoot.dir("packages/agent/dist"))
}

val buildPiCodingAgent by tasks.registering(Exec::class) {
    dependsOn(buildPiAgent)
    workingDir(piRoot)
    commandLine("npm", "--prefix", "packages/coding-agent", "run", "build")
    inputs.dir(piRoot.dir("packages/coding-agent/src"))
    outputs.file(piRoot.file("packages/coding-agent/dist/rpc-entry.js"))
}

val preparePiRuntime by tasks.registering {
    group = "build"
    description = "Builds the vendored pi 0.83.0 RPC runtime from the frozen model catalog."
    dependsOn(buildPiCodingAgent)
}

tasks.named("assemble") {
    dependsOn(preparePiRuntime)
}

tasks.named("test") {
    dependsOn(preparePiRuntime)
}
