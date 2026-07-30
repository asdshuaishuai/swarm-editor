package com.swarmeditor.desktop.attachment

import com.swarmeditor.desktop.viewmodel.UiImageAttachment
import java.awt.Image
import java.awt.Toolkit
import java.awt.datatransfer.DataFlavor
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Base64
import java.util.UUID
import javax.imageio.ImageIO
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

fun clipboardContainsImages(): Boolean {
    val clipboard = runCatching { Toolkit.getDefaultToolkit().systemClipboard }.getOrNull() ?: return false
    if (clipboard.isDataFlavorAvailable(DataFlavor.imageFlavor)) return true
    if (!clipboard.isDataFlavorAvailable(DataFlavor.javaFileListFlavor)) return false
    return runCatching {
        @Suppress("UNCHECKED_CAST")
        (clipboard.getData(DataFlavor.javaFileListFlavor) as? List<File>)
            .orEmpty()
            .any { it.imageMimeType() != null }
    }.getOrDefault(false)
}

suspend fun readClipboardImageAttachments(): List<UiImageAttachment> = withContext(Dispatchers.IO) {
    val clipboard = Toolkit.getDefaultToolkit().systemClipboard
    when {
        clipboard.isDataFlavorAvailable(DataFlavor.javaFileListFlavor) -> {
            @Suppress("UNCHECKED_CAST")
            (clipboard.getData(DataFlavor.javaFileListFlavor) as? List<File>)
                .orEmpty()
                .mapNotNull(File::toImageAttachment)
        }
        clipboard.isDataFlavorAvailable(DataFlavor.imageFlavor) -> {
            val image = clipboard.getData(DataFlavor.imageFlavor) as? Image ?: return@withContext emptyList()
            listOf(image.toClipboardAttachment())
        }
        else -> emptyList()
    }
}

fun File.toImageAttachment(): UiImageAttachment? {
    if (!isFile) return null
    val mimeType = imageMimeType() ?: return null
    val canonicalPath = canonicalPath
    return UiImageAttachment(
        id = canonicalPath,
        path = canonicalPath,
        name = name,
        mimeType = mimeType,
        sizeBytes = length(),
    )
}

private fun File.imageMimeType(): String? = when (extension.lowercase()) {
    "png" -> "image/png"
    "jpg", "jpeg" -> "image/jpeg"
    "webp" -> "image/webp"
    else -> null
}

private fun Image.toClipboardAttachment(): UiImageAttachment {
    val width = getWidth(null).coerceAtLeast(1)
    val height = getHeight(null).coerceAtLeast(1)
    val buffered = BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB)
    buffered.createGraphics().use { graphics -> graphics.drawImage(this, 0, 0, null) }
    val bytes = ByteArrayOutputStream().use { output ->
        check(ImageIO.write(buffered, "png", output)) { "无法编码剪贴板图片" }
        output.toByteArray()
    }
    return UiImageAttachment(
        id = UUID.randomUUID().toString(),
        path = "",
        name = "clipboard-${System.currentTimeMillis()}.png",
        mimeType = "image/png",
        sizeBytes = bytes.size.toLong(),
        base64 = Base64.getEncoder().encodeToString(bytes),
    )
}

private inline fun <T : java.awt.Graphics> T.use(action: (T) -> Unit) {
    try {
        action(this)
    } finally {
        dispose()
    }
}
