package com.swarmeditor.desktop.ui.dialog

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.dp
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.ui.common.IdeDialogShell
import com.swarmeditor.desktop.viewmodel.WorkspaceViewModel

@Composable
fun WorkspaceCreateModal(
    workspaceVm: WorkspaceViewModel,
    onDismiss: () -> Unit,
) {
    var branch by remember { mutableStateOf("") }
    val normalizedBranch = branch.trim()

    IdeDialogShell(
        title = "创建工作区",
        detail = "Git worktree",
        onClose = onDismiss,
        maxWidth = 520.dp,
        heightFraction = 0.42f,
        footer = {
            Spacer(Modifier.weight(1f))
            GhostButton("取消", onClick = onDismiss)
            Spacer(Modifier.width(8.dp))
            GlowButton(
                "创建并切换",
                active = normalizedBranch.isNotBlank(),
                onClick = {
                    workspaceVm.createManagedWorktree(normalizedBranch)
                    onDismiss()
                },
            )
        },
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 14.dp),
        ) {
            Text("分支名称", color = Tx, style = AppType.bodySm)
            Spacer(Modifier.height(7.dp))
            BasicTextField(
                value = branch,
                onValueChange = { branch = it.take(180) },
                singleLine = true,
                cursorBrush = SolidColor(Ac),
                textStyle = AppType.body.copy(color = Tx),
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Bg2, RoundedCornerShape(6.dp))
                    .border(1.dp, Line2, RoundedCornerShape(6.dp))
                    .padding(horizontal = 10.dp, vertical = 9.dp),
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "将在 project-workspaces 目录创建独立 Git worktree，创建后自动切换当前工作区。",
                color = Tx3,
                style = AppType.caption,
            )
        }
    }
}
