package com.swarmeditor.desktop.platform

import com.jetbrains.JBR
import com.jetbrains.JBRFileDialog
import java.awt.Dialog
import java.awt.FileDialog
import java.awt.Frame
import java.awt.Window
import java.io.File

data class NativeDirectorySelection(
    val handled: Boolean,
    val directory: File? = null,
)

fun chooseDirectoryWithJetBrainsRuntime(
    owner: Window?,
    currentDirectory: File?,
): NativeDirectorySelection {
    if (!JBR.isAvailable()) return NativeDirectorySelection(handled = false)
    val dialog = when (owner) {
        is Frame -> FileDialog(owner, "打开项目文件夹", FileDialog.LOAD)
        is Dialog -> FileDialog(owner, "打开项目文件夹", FileDialog.LOAD)
        else -> FileDialog(null as Frame?, "打开项目文件夹", FileDialog.LOAD)
    }
    val extension = JBRFileDialog.get(dialog) ?: return NativeDirectorySelection(handled = false)
    extension.setHints(JBRFileDialog.SELECT_DIRECTORIES_HINT or JBRFileDialog.CREATE_DIRECTORIES_HINT)
    extension.setLocalizationString(JBRFileDialog.OPEN_DIRECTORY_BUTTON_KEY, "打开项目")
    currentDirectory?.takeIf(File::isDirectory)?.let { dialog.directory = it.absolutePath }
    dialog.isVisible = true
    return NativeDirectorySelection(
        handled = true,
        directory = resolveNativeDirectorySelection(dialog.directory, dialog.file),
    )
}

internal fun resolveNativeDirectorySelection(parent: String?, selected: String?): File? {
    if (selected.isNullOrBlank()) return null
    return File(parent.orEmpty(), selected).absoluteFile.normalize().takeIf(File::isDirectory)
}
