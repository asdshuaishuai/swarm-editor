package com.swarmeditor.desktop.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Activity
import com.woowla.compose.icon.collections.feather.feather.BookOpen
import com.woowla.compose.icon.collections.feather.feather.Box
import com.woowla.compose.icon.collections.feather.feather.Code
import com.woowla.compose.icon.collections.feather.feather.Command
import com.woowla.compose.icon.collections.feather.feather.Cpu
import com.woowla.compose.icon.collections.feather.feather.Database
import com.woowla.compose.icon.collections.feather.feather.File
import com.woowla.compose.icon.collections.feather.feather.FileText
import com.woowla.compose.icon.collections.feather.feather.Folder
import com.woowla.compose.icon.collections.feather.feather.GitBranch
import com.woowla.compose.icon.collections.feather.feather.Github
import com.woowla.compose.icon.collections.feather.feather.Globe
import com.woowla.compose.icon.collections.feather.feather.Grid
import com.woowla.compose.icon.collections.feather.feather.Hexagon
import com.woowla.compose.icon.collections.feather.feather.Image
import com.woowla.compose.icon.collections.feather.feather.Layers
import com.woowla.compose.icon.collections.feather.feather.Package
import com.woowla.compose.icon.collections.feather.feather.Server
import com.woowla.compose.icon.collections.feather.feather.Settings
import com.woowla.compose.icon.collections.feather.feather.Terminal
import com.woowla.compose.icon.collections.feather.feather.Tool
import com.woowla.compose.icon.collections.feather.feather.User
import com.woowla.compose.icon.collections.feather.feather.Users
import com.woowla.compose.icon.collections.feather.feather.Zap
import com.swarmeditor.desktop.theme.*

internal data class SemanticIconSpec(
    val imageVector: ImageVector,
    val accent: Color,
    val badge: String? = null,
)

@Composable
internal fun SemanticIconBadge(
    spec: SemanticIconSpec,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    size: Dp = 32.dp,
    showBadge: Boolean = true,
) {
    val shape = RoundedCornerShape(size * 0.28f)
    Box(
        modifier = modifier
            .size(size)
            .clip(shape)
            .background(spec.accent.withAlpha(0.12f))
            .border(1.dp, spec.accent.withAlpha(0.28f), shape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = spec.imageVector,
            contentDescription = contentDescription,
            tint = spec.accent,
            modifier = Modifier.size(size * 0.50f),
        )
        if (showBadge && !spec.badge.isNullOrBlank()) {
            Text(
                text = spec.badge,
                color = spec.accent,
                fontSize = if (size >= 40.dp) 7.sp else 6.sp,
                lineHeight = 7.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .clip(RoundedCornerShape(topStart = 4.dp))
                    .background(Bg0.copy(alpha = 0.92f))
                    .padding(horizontal = 2.dp, vertical = 1.dp),
            )
        }
    }
}

internal fun semanticFileIcon(name: String, isDirectory: Boolean = false): ImageVector {
    return semanticFileIconSpec(name, isDirectory).imageVector
}

internal fun semanticFileIconSpec(name: String, isDirectory: Boolean = false): SemanticIconSpec {
    if (isDirectory) return SemanticIconSpec(Feather.Folder, ControlBlue)
    val normalized = name.lowercase()
    val extension = normalized.substringAfterLast('.', "")
    return when {
        normalized.startsWith("readme") || normalized.startsWith("license") -> SemanticIconSpec(Feather.BookOpen, ControlPurple, "MD")
        normalized in PACKAGE_FILES || extension in PACKAGE_EXTENSIONS -> SemanticIconSpec(Feather.Package, ControlOrange, "PKG")
        normalized in CONFIG_FILES || extension in CONFIG_EXTENSIONS -> SemanticIconSpec(Feather.Settings, Tx2, "CFG")
        normalized.startsWith("dockerfile") -> SemanticIconSpec(Feather.Box, ControlBlue, "OCI")
        normalized.startsWith(".git") || extension == "git" -> SemanticIconSpec(Feather.GitBranch, ControlOrange, "GIT")
        extension in KOTLIN_EXTENSIONS -> SemanticIconSpec(Feather.Code, AgentKimi, "KT")
        extension == "java" -> SemanticIconSpec(Feather.Code, ControlOrange, "JAVA")
        extension in TYPESCRIPT_EXTENSIONS -> SemanticIconSpec(Feather.Code, ControlBlue, "TS")
        extension in JAVASCRIPT_EXTENSIONS -> SemanticIconSpec(Feather.Code, WarnLight, "JS")
        extension == "py" -> SemanticIconSpec(Feather.Code, AgentGemini, "PY")
        extension == "rs" -> SemanticIconSpec(Feather.Code, ControlOrange, "RS")
        extension == "go" -> SemanticIconSpec(Feather.Code, AgentQwen, "GO")
        extension in CPP_EXTENSIONS -> SemanticIconSpec(Feather.Code, AgentQwen, if (extension == "c" || extension == "h") "C" else "C++")
        extension == "swift" -> SemanticIconSpec(Feather.Code, ControlOrange, "SW")
        extension == "dart" -> SemanticIconSpec(Feather.Code, ControlBlue, "DART")
        extension in TERMINAL_EXTENSIONS -> SemanticIconSpec(Feather.Terminal, AgentGemini, "SH")
        extension in IMAGE_EXTENSIONS -> SemanticIconSpec(Feather.Image, ControlPurple, extension.take(4).uppercase())
        extension == "json" || extension == "jsonl" -> SemanticIconSpec(Feather.Database, WarnLight, "{}")
        extension in YAML_EXTENSIONS -> SemanticIconSpec(Feather.Settings, AgentQwen, "YML")
        extension in XML_EXTENSIONS -> SemanticIconSpec(Feather.Code, ControlOrange, "<>")
        extension in STYLE_EXTENSIONS -> SemanticIconSpec(Feather.Layers, ControlBlue, extension.uppercase())
        extension in DATA_EXTENSIONS -> SemanticIconSpec(Feather.Database, AgentQwen, extension.take(4).uppercase())
        extension in DOCUMENT_EXTENSIONS -> SemanticIconSpec(Feather.FileText, ControlPurple, extension.take(4).uppercase())
        extension in SOURCE_EXTENSIONS -> SemanticIconSpec(Feather.Code, Ac, extension.take(4).uppercase())
        else -> SemanticIconSpec(Feather.File, Tx3, extension.takeIf(String::isNotBlank)?.take(4)?.uppercase())
    }
}

internal fun semanticPluginIcon(name: String, isSkill: Boolean): ImageVector {
    return semanticPluginIconSpec(name, isSkill).imageVector
}

internal fun semanticPluginIconSpec(name: String, isSkill: Boolean): SemanticIconSpec {
    val normalized = name.lowercase()
    return when {
        "github" in normalized || "gitlab" in normalized || normalized == "git" -> SemanticIconSpec(Feather.Github, Tx, "GIT")
        listOf("browser", "web", "search", "fetch", "http").any(normalized::contains) -> SemanticIconSpec(Feather.Globe, ControlBlue, "WEB")
        listOf("sql", "database", "postgres", "sqlite", "redis").any(normalized::contains) -> SemanticIconSpec(Feather.Database, AgentQwen, "DB")
        listOf("file", "filesystem", "folder").any(normalized::contains) -> SemanticIconSpec(Feather.Folder, ControlOrange, "FS")
        listOf("terminal", "shell", "bash", "exec").any(normalized::contains) -> SemanticIconSpec(Feather.Terminal, AgentGemini, "CLI")
        listOf("code", "lsp", "compile", "kotlin", "compose").any(normalized::contains) -> SemanticIconSpec(Feather.Code, AgentKimi, "LSP")
        listOf("agent", "swarm", "team").any(normalized::contains) -> SemanticIconSpec(Feather.Users, ControlPurple, "AI")
        listOf("animation", "motion", "design").any(normalized::contains) -> SemanticIconSpec(Feather.Zap, ControlOrange, "FX")
        listOf("image", "media", "vision").any(normalized::contains) -> SemanticIconSpec(Feather.Image, ControlPurple, "IMG")
        listOf("docs", "document", "markdown", "mail").any(normalized::contains) -> SemanticIconSpec(Feather.BookOpen, ControlBlue, "DOC")
        isSkill -> SemanticIconSpec(Feather.Tool, AgentGemini, "SKL")
        else -> SemanticIconSpec(Feather.Server, Ac, "MCP")
    }
}

internal fun semanticAgentIcon(name: String, id: String): ImageVector {
    return semanticAgentIconSpec(name, id).imageVector
}

internal fun semanticAgentIconSpec(name: String, id: String): SemanticIconSpec {
    val normalized = "$id $name".lowercase()
    return when {
        listOf("primary", "main", "主智能体", "pi").any(normalized::contains) -> SemanticIconSpec(Feather.Cpu, AgentKimi, "PI")
        listOf("swarm", "orchestr", "planner", "manager").any(normalized::contains) -> SemanticIconSpec(Feather.Users, ControlPurple, "PLAN")
        listOf("code", "develop", "implement").any(normalized::contains) -> SemanticIconSpec(Feather.Code, ControlBlue, "DEV")
        listOf("review", "inspect", "audit", "test").any(normalized::contains) -> SemanticIconSpec(Feather.Activity, ControlOrange, "QA")
        listOf("research", "search", "web").any(normalized::contains) -> SemanticIconSpec(Feather.Globe, AgentQwen, "R&D")
        listOf("terminal", "shell", "command").any(normalized::contains) -> SemanticIconSpec(Feather.Command, AgentGemini, "CLI")
        listOf("plugin", "mcp", "tool").any(normalized::contains) -> SemanticIconSpec(Feather.Hexagon, Ac, "MCP")
        listOf("ui", "design", "layout").any(normalized::contains) -> SemanticIconSpec(Feather.Layers, ControlPurple, "UI")
        else -> SemanticIconSpec(Feather.User, Tx2, "AGT")
    }
}

private val SOURCE_EXTENSIONS = setOf(
    "kt", "kts", "java", "js", "jsx", "ts", "tsx", "py", "rs", "go", "c", "cc", "cpp", "h", "hpp", "cs", "swift", "dart",
)
private val KOTLIN_EXTENSIONS = setOf("kt", "kts")
private val TYPESCRIPT_EXTENSIONS = setOf("ts", "tsx")
private val JAVASCRIPT_EXTENSIONS = setOf("js", "jsx")
private val CPP_EXTENSIONS = setOf("c", "cc", "cpp", "cxx", "h", "hpp")
private val TERMINAL_EXTENSIONS = setOf("sh", "bash", "zsh", "fish", "ps1", "bat", "cmd")
private val IMAGE_EXTENSIONS = setOf("png", "jpg", "jpeg", "gif", "webp", "svg", "ico")
private val DATA_EXTENSIONS = setOf("json", "jsonl", "yaml", "yml", "toml", "xml", "sql", "db", "sqlite")
private val YAML_EXTENSIONS = setOf("yaml", "yml")
private val XML_EXTENSIONS = setOf("xml", "html", "htm")
private val STYLE_EXTENSIONS = setOf("css", "scss", "less")
private val DOCUMENT_EXTENSIONS = setOf("md", "mdx", "txt", "html", "htm", "css", "scss", "less", "csv")
private val PACKAGE_EXTENSIONS = setOf("gradle", "lock")
private val CONFIG_EXTENSIONS = setOf("conf", "config", "properties", "env", "ini")
private val PACKAGE_FILES = setOf("package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "pom.xml", "build.gradle", "build.gradle.kts")
private val CONFIG_FILES = setOf("gradle.properties", "settings.gradle", "settings.gradle.kts", ".editorconfig", ".env", ".env.example")
