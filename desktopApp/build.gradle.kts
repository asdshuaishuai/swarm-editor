import org.jetbrains.compose.desktop.application.dsl.TargetFormat

plugins {
    alias(libs.plugins.kotlinJvm)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
}

dependencies {
    implementation(projects.common)

    // Ktor Client (for backend API communication)
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.cio)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.kotlinx.json)

    // Compose Desktop
    implementation(compose.desktop.currentOs)
    implementation(compose.material3)
    implementation(compose.foundation)
    implementation(compose.runtime)
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
}

compose.desktop {
    application {
        mainClass = "com.swarmeditor.desktop.MainKt"

        nativeDistributions {
            targetFormats(TargetFormat.Dmg, TargetFormat.Msi, TargetFormat.Deb)
            packageName = "SwarmEditor"
            packageVersion = "1.0.0"
        }
    }
}
