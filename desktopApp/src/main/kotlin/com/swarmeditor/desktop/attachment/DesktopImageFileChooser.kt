package com.swarmeditor.desktop.attachment

import com.swarmeditor.desktop.platform.chooseDirectoryWithJetBrainsRuntime
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Component
import java.awt.Dimension
import java.awt.Font
import java.awt.Image
import java.awt.Window
import java.io.File
import javax.imageio.ImageIO
import javax.swing.BorderFactory
import javax.swing.ImageIcon
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JFileChooser
import javax.swing.JLabel
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.JTable
import javax.swing.JTextField
import javax.swing.JOptionPane
import javax.swing.SwingConstants
import javax.swing.SwingUtilities
import javax.swing.UIManager
import javax.swing.filechooser.FileNameExtensionFilter
import javax.swing.border.EmptyBorder
import javax.swing.border.LineBorder
import kotlin.math.min
import java.util.Locale

private val SupportedImageExtensions = setOf("png", "jpg", "jpeg", "webp")

private object ChooserPalette {
    val background = Color(18, 23, 32)
    val surface = Color(27, 34, 47)
    val elevated = Color(36, 45, 60)
    val border = Color(65, 79, 101)
    val text = Color(228, 234, 244)
    val muted = Color(143, 157, 178)
    val accent = Color(78, 143, 255)
    val accentHover = Color(98, 158, 255)
}

internal fun isSupportedImageFile(file: File): Boolean =
    file.isFile && file.extension.lowercase() in SupportedImageExtensions

internal fun imageChooserInitialDirectory(projectDirectory: File?, userHome: File?): File? = when {
    projectDirectory?.isDirectory == true -> projectDirectory
    projectDirectory?.parentFile?.isDirectory == true -> projectDirectory.parentFile
    userHome?.isDirectory == true -> userHome
    else -> null
}

fun chooseImageFiles(owner: Window?, projectDirectory: File?): List<File> {
    var selectedFiles = emptyList<File>()
    val showChooser = Runnable {
        withLocalizedFileChooserDefaults {
            val chooser = createImageFileChooser(projectDirectory)
            if (chooser.showOpenDialog(owner) == JFileChooser.APPROVE_OPTION) {
                selectedFiles = chooser.selectedFiles.filter(::isSupportedImageFile)
            }
        }
    }

    if (SwingUtilities.isEventDispatchThread()) showChooser.run() else SwingUtilities.invokeAndWait(showChooser)
    return selectedFiles
}

fun chooseWorkspaceDirectory(
    owner: Window?,
    currentDirectory: File?,
    createNew: Boolean,
): File? {
    if (!createNew) {
        val nativeSelection = chooseDirectoryWithJetBrainsRuntime(owner, currentDirectory)
        if (nativeSelection.handled) return nativeSelection.directory
    }
    var selectedDirectory: File? = null
    val showChooser = Runnable {
        withLocalizedFileChooserDefaults {
            val chooser = createWorkspaceFileChooser(currentDirectory, createNew)
            while (selectedDirectory == null) {
                val result = if (createNew) chooser.showSaveDialog(owner) else chooser.showOpenDialog(owner)
                if (result != JFileChooser.APPROVE_OPTION) break
                val selected = chooser.selectedFile ?: continue
                prepareWorkspaceDirectory(selected, createNew)
                    .onSuccess { selectedDirectory = it }
                    .onFailure { error ->
                        JOptionPane.showMessageDialog(
                            owner,
                            error.message ?: "无法使用所选目录",
                            if (createNew) "无法创建项目" else "无法打开项目",
                            JOptionPane.ERROR_MESSAGE,
                        )
                    }
            }
        }
    }
    if (SwingUtilities.isEventDispatchThread()) showChooser.run() else SwingUtilities.invokeAndWait(showChooser)
    return selectedDirectory
}

internal fun prepareWorkspaceDirectory(selected: File, createNew: Boolean): Result<File> = runCatching {
    val directory = selected.absoluteFile.normalize()
    if (createNew) {
        require(!directory.exists()) { "项目已存在，请输入新的项目名称：${directory.name}" }
        require(directory.mkdirs()) { "无法创建项目目录：${directory.absolutePath}" }
    } else {
        require(directory.isDirectory) { "请选择一个有效的项目文件夹" }
    }
    directory
}

private inline fun <T> withLocalizedFileChooserDefaults(block: () -> T): T {
    val localizedValues = mapOf(
        "FileChooser.lookInLabelText" to "位置",
        "FileChooser.saveInLabelText" to "位置",
        "FileChooser.fileNameLabelText" to "文件名",
        "FileChooser.folderNameLabelText" to "文件夹",
        "FileChooser.filesOfTypeLabelText" to "文件类型",
        "FileChooser.cancelButtonText" to "取消",
        "FileChooser.cancelButtonToolTipText" to "关闭文件选择器",
        "FileChooser.upFolderToolTipText" to "返回上一级",
        "FileChooser.homeFolderToolTipText" to "主目录",
        "FileChooser.newFolderToolTipText" to "新建文件夹",
        "FileChooser.listViewButtonToolTipText" to "列表视图",
        "FileChooser.detailsViewButtonToolTipText" to "详细视图",
    )
    val defaults = UIManager.getDefaults()
    val previousValues = localizedValues.keys.associateWith(defaults::get)
    localizedValues.forEach(UIManager::put)
    return try {
        block()
    } finally {
        previousValues.forEach { (key, value) ->
            if (value == null) defaults.remove(key) else UIManager.put(key, value)
        }
    }
}

private fun createImageFileChooser(projectDirectory: File?): JFileChooser {
    val initialDirectory = imageChooserInitialDirectory(projectDirectory, System.getProperty("user.home")?.let(::File))
    return JFileChooser(initialDirectory).apply {
        dialogTitle = "添加图片到当前对话"
        approveButtonText = "添加到对话"
        approveButtonToolTipText = "将选中的图片作为上下文附件"
        fileSelectionMode = JFileChooser.FILES_ONLY
        isMultiSelectionEnabled = true
        isAcceptAllFileFilterUsed = false
        fileFilter = FileNameExtensionFilter("图片文件  PNG · JPG · WEBP", *SupportedImageExtensions.toTypedArray())
        preferredSize = Dimension(920, 640)
        minimumSize = Dimension(760, 520)
        accessory = ImagePreviewPanel(this)
        border = EmptyBorder(10, 10, 10, 10)
        styleChooserTree(this, approveButtonText)
    }
}

private fun createWorkspaceFileChooser(currentDirectory: File?, createNew: Boolean): JFileChooser {
    val initialDirectory = imageChooserInitialDirectory(currentDirectory, System.getProperty("user.home")?.let(::File))
    val approveText = if (createNew) "创建并打开" else "打开工作区"
    return JFileChooser(initialDirectory).apply {
        dialogTitle = if (createNew) "新建 Swarm Editor 项目" else "打开项目文件夹"
        approveButtonText = approveText
        approveButtonToolTipText = if (createNew) "创建项目目录并在新窗口打开" else "在新窗口中打开所选目录"
        fileSelectionMode = if (createNew) JFileChooser.FILES_ONLY else JFileChooser.DIRECTORIES_ONLY
        isMultiSelectionEnabled = false
        isAcceptAllFileFilterUsed = false
        if (createNew) selectedFile = File(initialDirectory, "untitled-project")
        preferredSize = Dimension(920, 640)
        minimumSize = Dimension(760, 520)
        border = EmptyBorder(10, 10, 10, 10)
        styleChooserTree(this, approveText)
    }
}

private class ImagePreviewPanel(chooser: JFileChooser) : JPanel(BorderLayout(0, 12)) {
    private val preview = JLabel("选择图片以预览", SwingConstants.CENTER)
    private val metadata = JLabel("PNG · JPG · JPEG · WEBP", SwingConstants.CENTER)

    init {
        preferredSize = Dimension(236, 0)
        minimumSize = Dimension(210, 0)
        background = ChooserPalette.surface
        border = BorderFactory.createCompoundBorder(
            LineBorder(ChooserPalette.border, 1, true),
            EmptyBorder(14, 14, 14, 14),
        )
        preview.isOpaque = true
        preview.background = ChooserPalette.background
        preview.foreground = ChooserPalette.muted
        preview.font = Font(Font.DIALOG, Font.PLAIN, 12)
        preview.border = LineBorder(ChooserPalette.border, 1, true)
        metadata.foreground = ChooserPalette.muted
        metadata.font = Font(Font.DIALOG, Font.PLAIN, 11)
        add(preview, BorderLayout.CENTER)
        add(metadata, BorderLayout.SOUTH)

        chooser.addPropertyChangeListener(JFileChooser.SELECTED_FILE_CHANGED_PROPERTY) { event ->
            updatePreview(event.newValue as? File)
        }
    }

    private fun updatePreview(file: File?) {
        if (file == null || !isSupportedImageFile(file)) {
            preview.icon = null
            preview.text = "选择图片以预览"
            metadata.text = "PNG · JPG · JPEG · WEBP"
            return
        }

        val image = runCatching { ImageIO.read(file) }.getOrNull()
        if (image == null) {
            preview.icon = null
            preview.text = file.name
            metadata.text = "${formatFileSize(file.length())} · 预览不可用"
            return
        }

        val maxWidth = 204
        val maxHeight = 360
        val scale = min(1.0, min(maxWidth.toDouble() / image.width, maxHeight.toDouble() / image.height))
        val width = (image.width * scale).toInt().coerceAtLeast(1)
        val height = (image.height * scale).toInt().coerceAtLeast(1)
        preview.text = null
        preview.icon = ImageIcon(image.getScaledInstance(width, height, Image.SCALE_SMOOTH))
        metadata.text = "<html><center>${escapeHtml(file.name)}<br>${image.width} × ${image.height} · ${formatFileSize(file.length())}</center></html>"
    }
}

private fun styleChooserTree(component: Component, approveButtonText: String) {
    component.font = Font(Font.DIALOG, Font.PLAIN, 13)
    when (component) {
        is JFileChooser -> {
            component.background = ChooserPalette.background
            component.foreground = ChooserPalette.text
        }
        is JPanel -> {
            component.background = ChooserPalette.background
            component.foreground = ChooserPalette.text
        }
        is JButton -> {
            val isApprove = component.text == approveButtonText
            component.isFocusPainted = false
            component.background = if (isApprove) ChooserPalette.accent else ChooserPalette.elevated
            component.foreground = if (isApprove) Color.WHITE else ChooserPalette.text
            component.border = BorderFactory.createCompoundBorder(
                LineBorder(if (isApprove) ChooserPalette.accentHover else ChooserPalette.border, 1, true),
                EmptyBorder(7, 13, 7, 13),
            )
        }
        is JTextField -> {
            component.background = ChooserPalette.surface
            component.foreground = ChooserPalette.text
            component.caretColor = ChooserPalette.accent
            component.selectionColor = ChooserPalette.accent
            component.selectedTextColor = Color.WHITE
            component.border = BorderFactory.createCompoundBorder(
                LineBorder(ChooserPalette.border, 1, true),
                EmptyBorder(7, 9, 7, 9),
            )
        }
        is JList<*> -> {
            component.background = ChooserPalette.background
            component.foreground = ChooserPalette.text
            component.selectionBackground = ChooserPalette.accent
            component.selectionForeground = Color.WHITE
        }
        is JTable -> {
            component.background = ChooserPalette.background
            component.foreground = ChooserPalette.text
            component.selectionBackground = ChooserPalette.accent
            component.selectionForeground = Color.WHITE
            component.gridColor = ChooserPalette.border
        }
        is JScrollPane -> {
            component.background = ChooserPalette.background
            component.viewport.background = ChooserPalette.background
            component.border = LineBorder(ChooserPalette.border, 1, true)
        }
        is JLabel -> component.foreground = ChooserPalette.text
        is JComponent -> {
            component.background = ChooserPalette.background
            component.foreground = ChooserPalette.text
        }
    }

    if (component is java.awt.Container) {
        component.components.forEach { child -> styleChooserTree(child, approveButtonText) }
    }
}

internal fun formatFileSize(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> String.format(Locale.ROOT, "%.1f KB", bytes / 1024.0)
    else -> String.format(Locale.ROOT, "%.1f MB", bytes / (1024.0 * 1024.0))
}

private fun escapeHtml(value: String): String = value
    .replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;")
