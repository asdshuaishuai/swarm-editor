package com.swarmeditor.desktop

import androidx.compose.foundation.LocalScrollbarStyle
import androidx.compose.foundation.ScrollbarStyle
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.material3.LocalRippleConfiguration
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.arkivanov.essenty.lifecycle.destroy
import com.arkivanov.essenty.lifecycle.resume
import com.swarmeditor.backend.shutdownBackendServices
import com.swarmeditor.backend.PROJECT_ROOT_PROPERTY
import com.swarmeditor.desktop.navigation.RootComponent
import com.swarmeditor.desktop.attachment.clipboardContainsImages
import com.swarmeditor.desktop.attachment.chooseImageFiles
import com.swarmeditor.desktop.attachment.chooseWorkspaceDirectory
import com.swarmeditor.desktop.attachment.readClipboardImageAttachments
import com.swarmeditor.desktop.resources.Res
import com.swarmeditor.desktop.resources.swarm_editor
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.Bg1
import com.swarmeditor.desktop.theme.Bg3
import com.swarmeditor.desktop.theme.GeekColorScheme
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.ThemeRuntime
import com.swarmeditor.backend.initializeBackendServices
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.MutableSharedFlow
import java.awt.dnd.DnDConstants
import java.awt.dnd.DropTarget
import java.awt.dnd.DropTargetAdapter
import java.awt.dnd.DropTargetDropEvent
import java.awt.datatransfer.DataFlavor
import java.io.File
import org.jetbrains.compose.resources.painterResource

private const val DEFAULT_WINDOW_WIDTH = 1280
private const val DEFAULT_WINDOW_HEIGHT = 960
private const val MIN_WINDOW_WIDTH = 760
private const val MIN_WINDOW_HEIGHT = 600
private const val DESKTOP_MAIN_CLASS = "com.swarmeditor.desktop.MainKt"
private val WorkspaceRelaunchProperties = listOf(
    "compose.application.resources.dir",
    "compose.application.configure.swing.globals",
    "skiko.library.path",
)

internal fun initialWindowSize(width: String?, height: String?): DpSize = DpSize(
    width = width?.toIntOrNull()?.coerceIn(MIN_WINDOW_WIDTH, 2560)?.dp ?: DEFAULT_WINDOW_WIDTH.dp,
    height = height?.toIntOrNull()?.coerceIn(MIN_WINDOW_HEIGHT, 1600)?.dp ?: DEFAULT_WINDOW_HEIGHT.dp,
)

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
fun main(args: Array<String>) {
    startupProjectDirectory(args)?.let { directory ->
        System.setProperty(PROJECT_ROOT_PROPERTY, directory.absolutePath)
    }
    runBlocking { initializeBackendServices() }
    application {
    val lifecycle = remember { LifecycleRegistry().apply { resume() } }
    val root = remember(lifecycle) { RootComponent(DefaultComponentContext(lifecycle)) }
    LaunchedEffect(root) {
        System.getProperty("swarm.view")?.let(root::switchView)
        System.getProperty("swarm.file")?.takeIf(String::isNotBlank)?.let(root.projectVm::selectFile)
        when (System.getProperty("swarm.dialog")) {
            "settings" -> root.showSettingsDialog()
            "command" -> root.showCmdKDialog()
        }
    }
    DisposableEffect(lifecycle) {
        onDispose {
            lifecycle.destroy()
            runBlocking { shutdownBackendServices() }
        }
    }

    Window(
        onCloseRequest = ::exitApplication,
        title = "Swarm Editor",
        icon = painterResource(Res.drawable.swarm_editor),
        state = rememberWindowState(
            size = initialWindowSize(
                width = System.getProperty("swarm.windowWidth"),
                height = System.getProperty("swarm.windowHeight"),
            ),
        ),
        resizable = true,
        undecorated = true
    ) {
        val awtWindow = window
        val themeMode by root.themeMode.collectAsState()
        ThemeRuntime.use(themeMode)
        val droppedImageFiles = remember { MutableSharedFlow<List<File>>(extraBufferCapacity = 1) }
        DisposableEffect(awtWindow) {
            val previousDropTarget = awtWindow.dropTarget
            val dropTarget = DropTarget(
                awtWindow,
                DnDConstants.ACTION_COPY,
                object : DropTargetAdapter() {
                    override fun drop(event: DropTargetDropEvent) {
                        try {
                            if (!event.isDataFlavorSupported(DataFlavor.javaFileListFlavor)) {
                                event.rejectDrop()
                                return
                            }
                            event.acceptDrop(DnDConstants.ACTION_COPY)
                            @Suppress("UNCHECKED_CAST")
                            val files = event.transferable
                                .getTransferData(DataFlavor.javaFileListFlavor) as? List<File>
                            val accepted = files.orEmpty().filter(File::isFile)
                            event.dropComplete(droppedImageFiles.tryEmit(accepted))
                        } catch (_: Exception) {
                            event.dropComplete(false)
                        }
                    }
                },
                true,
            )
            onDispose {
                if (awtWindow.dropTarget === dropTarget) awtWindow.dropTarget = previousDropTarget
            }
        }
        MaterialTheme(colorScheme = GeekColorScheme) {
            CompositionLocalProvider(
                LocalScrollbarStyle provides ScrollbarStyle(
                    minimalHeight = 16.dp,
                    thickness = 6.dp,
                    shape = RoundedCornerShape(3.dp),
                    hoverDurationMillis = 200,
                    unhoverColor = Line,
                    hoverColor = Bg3
                ),
                LocalTextSelectionColors provides TextSelectionColors(
                    handleColor = Ac,
                    backgroundColor = Ac.copy(alpha = 0.3f)
                ),
                LocalRippleConfiguration provides null
            ) {
                App(
                    root = root,
                    onClose = ::exitApplication,
                    onMinimize = { (awtWindow as? java.awt.Frame)?.extendedState = java.awt.Frame.ICONIFIED },
                    onMaximizeToggle = {
                        val frame = awtWindow as? java.awt.Frame
                        if (frame != null) {
                            frame.extendedState = if (frame.extendedState and java.awt.Frame.MAXIMIZED_BOTH != 0)
                                java.awt.Frame.NORMAL else java.awt.Frame.MAXIMIZED_BOTH
                        }
                    },
                    onPickImages = {
                        chooseImageFiles(awtWindow, File(root.projectVm.projectPath))
                    },
                    onOpenWorkspace = {
                        chooseWorkspaceDirectory(awtWindow, File(root.projectVm.projectPath), createNew = false)
                            ?.let { directory ->
                                launchWorkspace(directory).onSuccess { exitApplication() }
                                    .onFailure { root.showToast(it.message ?: "无法打开工作区", com.swarmeditor.desktop.viewmodel.ToastType.ERROR) }
                            }
                    },
                    onCreateWorkspace = {
                        chooseWorkspaceDirectory(awtWindow, File(root.projectVm.projectPath), createNew = true)
                            ?.let { directory ->
                                launchWorkspace(directory).onSuccess { exitApplication() }
                                    .onFailure { root.showToast(it.message ?: "无法创建工作区", com.swarmeditor.desktop.viewmodel.ToastType.ERROR) }
                            }
                    },
                    onAttachWorkspace = {
                        chooseWorkspaceDirectory(awtWindow, File(root.projectVm.projectPath), createNew = false)
                            ?.let(root.workspaceVm::attachExistingWorktree)
                    },
                    droppedImageFiles = droppedImageFiles,
                    clipboardHasImages = ::clipboardContainsImages,
                    onReadClipboardImages = ::readClipboardImageAttachments,
                )
            }
        }
    }
    }
}

internal fun startupProjectDirectory(args: Array<String>): File? {
    val rawPath = args.firstOrNull { argument -> argument.isNotBlank() && !argument.startsWith("--") }
        ?: return null
    val directory = File(rawPath).absoluteFile.normalize()
    require(directory.isDirectory) { "项目目录不存在：${directory.absolutePath}" }
    return directory
}

internal fun workspaceLaunchCommand(
    directory: File,
    candidates: List<File> = defaultWorkspaceLauncherCandidates(),
    javaLaunchPrefix: List<String>? = defaultJavaWorkspaceLaunchPrefix(),
): List<String> {
    require(directory.isDirectory) { "工作区目录不存在：${directory.absolutePath}" }
    candidates.firstOrNull { it.isFile && it.canExecute() }
        ?.let { launcher -> return listOf(launcher.absolutePath, directory.absolutePath) }
    require(!javaLaunchPrefix.isNullOrEmpty()) {
        "找不到可用的 Swarm Editor 启动器，也无法复用当前 JVM 启动新工作区"
    }
    return javaLaunchPrefix + directory.absolutePath
}

internal fun defaultWorkspaceLauncherCandidates(
    currentCommand: String? = ProcessHandle.current().info().command().orElse(null),
    userHome: String? = System.getProperty("user.home"),
): List<File> = buildList {
    currentCommand
        ?.takeIf { command -> File(command).nameWithoutExtension.equals("SwarmEditor", ignoreCase = true) }
        ?.let(::File)
        ?.let(::add)
    userHome?.let { home ->
        add(File(home, ".local/opt/swarm-editor/bin/SwarmEditor"))
        add(File(home, ".local/bin/swarm-editor"))
    }
}.distinctBy { it.absolutePath }

internal fun defaultJavaWorkspaceLaunchPrefix(
    javaHome: String? = System.getProperty("java.home"),
    classPath: String? = System.getProperty("java.class.path"),
    osName: String = System.getProperty("os.name"),
    propertyValue: (String) -> String? = System::getProperty,
): List<String>? {
    val executableName = if (osName.startsWith("Windows", ignoreCase = true)) "java.exe" else "java"
    val javaExecutable = javaHome?.takeIf(String::isNotBlank)?.let { File(it, "bin/$executableName") }
        ?.takeIf { it.isFile && it.canExecute() }
        ?: return null
    val activeClassPath = classPath?.takeIf(String::isNotBlank) ?: return null
    return buildList {
        add(javaExecutable.absolutePath)
        WorkspaceRelaunchProperties.forEach { name ->
            propertyValue(name)?.takeIf(String::isNotBlank)?.let { value -> add("-D$name=$value") }
        }
        add("-cp")
        add(activeClassPath)
        add(DESKTOP_MAIN_CLASS)
    }
}

internal fun launchWorkspace(directory: File): Result<Process> = runCatching {
    ProcessBuilder(workspaceLaunchCommand(directory))
        .directory(directory)
        .start()
}
