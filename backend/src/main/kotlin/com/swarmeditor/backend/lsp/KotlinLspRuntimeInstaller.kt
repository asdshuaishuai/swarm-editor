package com.swarmeditor.backend.lsp

import com.swarmeditor.common.config.ConfigPaths
import java.io.File
import kotlinx.coroutines.runBlocking

fun main() = runBlocking {
    val installRoot = System.getProperty("swarm.kotlinLsp.installRoot")
        ?.takeIf(String::isNotBlank)
        ?.let(::File)
        ?: File(ConfigPaths.KOTLIN_LSP_RUNTIME_DIR)
    val manager = KotlinLspRuntimeManager(installRoot)
    val current = manager.inspect()
    if (current.health == KotlinLspRuntimeHealth.READY) {
        println(current.message)
        return@runBlocking
    }

    var lastPercent = -1
    val installed = manager.install { progress ->
        val percent = ((progress.downloadedBytes * 100) / progress.totalBytes).toInt()
        if (percent != lastPercent) {
            val mode = if (progress.resumed) "resuming" else "downloading"
            println("Kotlin LSP $mode: $percent% (${progress.downloadedBytes}/${progress.totalBytes} bytes)")
            lastPercent = percent
        }
    }
    check(installed.health == KotlinLspRuntimeHealth.READY) { installed.message }
    println(installed.message)
    println(installed.command.joinToString(" "))
}
