package com.swarmeditor.desktop.ui.common

import java.awt.Toolkit
import java.awt.datatransfer.StringSelection

internal fun copyTextToClipboard(text: String) {
    Toolkit.getDefaultToolkit().systemClipboard.setContents(StringSelection(text), null)
}
