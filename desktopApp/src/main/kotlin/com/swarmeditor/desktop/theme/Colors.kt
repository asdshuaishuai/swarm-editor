package com.swarmeditor.desktop.theme

import androidx.compose.ui.graphics.Color

/* ═══════════════════════════════════════════════════════════════
   Swarm Editor — Design System Colors (from MVP mockup)
   ═══════════════════════════════════════════════════════════════ */

val Bg0 get() = ThemeRuntime.palette.bg0
val Bg1 get() = ThemeRuntime.palette.bg1
val Bg2 get() = ThemeRuntime.palette.bg2
val Bg3 get() = ThemeRuntime.palette.bg3
val Line get() = ThemeRuntime.palette.line
val Line2 get() = ThemeRuntime.palette.line2
val Tx get() = ThemeRuntime.palette.tx
val Tx2 get() = ThemeRuntime.palette.tx2
val Tx3 get() = ThemeRuntime.palette.tx3
val Ac get() = ThemeRuntime.palette.ac
val Ac2 get() = ThemeRuntime.palette.ac2
val AcLight get() = ThemeRuntime.palette.acLight
val OnAccent get() = ThemeRuntime.palette.onAccent
val Scrim get() = ThemeRuntime.palette.scrim
val ControlBlue get() = ThemeRuntime.palette.controlBlue
val ControlPurple get() = ThemeRuntime.palette.controlPurple
val ControlGreen get() = ThemeRuntime.palette.controlGreen
val ControlOrange get() = ThemeRuntime.palette.controlOrange
val ControlRed get() = ThemeRuntime.palette.controlRed
val AgentClaude get() = ThemeRuntime.palette.agentClaude
val AgentQwen get() = ThemeRuntime.palette.agentQwen
val AgentGemini get() = ThemeRuntime.palette.agentGemini
val AgentKimi get() = ThemeRuntime.palette.agentKimi
val AgentOpenCode get() = ThemeRuntime.palette.agentOpenCode
val Ok get() = ThemeRuntime.palette.ok
val OkLight get() = ThemeRuntime.palette.okLight
val Warn get() = ThemeRuntime.palette.warn
val WarnLight get() = ThemeRuntime.palette.warnLight
val Err get() = ThemeRuntime.palette.err
val ErrLight get() = ThemeRuntime.palette.errLight

// Derived alpha helper (renamed to avoid conflict with Color.alpha property)
fun Color.withAlpha(a: Float) = this.copy(alpha = a)
