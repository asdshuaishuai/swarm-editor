package com.swarmeditor.desktop.theme

import androidx.compose.ui.graphics.Color

/* ═══════════════════════════════════════════════════════════════
   Swarm Editor — Design System Colors (from MVP mockup)
   ═══════════════════════════════════════════════════════════════ */

// Backgrounds — 深色分层（越深越靠后，营造深度感）
val Bg0 = Color(0xFF060709)      // 最深背景（app 底）
val Bg1 = Color(0xFF0a0b11)      // 侧栏/面板底（比 Bg0 稍亮，与卡片拉开层次）
val Bg2 = Color(0xFF12151e)      // 卡片/输入框底
val Bg3 = Color(0xFF1a1f2c)      // hover/高亮底（足够亮，反馈明显）

// Lines / Borders — 分隔线层次
val Line = Color(0xFF1e2330)     // 主分隔线
val Line2 = Color(0xFF2b3142)    // hover 分隔线

// Text — 三级文字层次（对比度递减）
val Tx = Color(0xFFf0f1f6)       // 主文字（更亮，可读性优）
val Tx2 = Color(0xFF9aa3b8)      // 次文字
val Tx3 = Color(0xFF6b7388)      // 弱化/标签文字（稍亮，减少疲劳）

// Accent (purple)
val Ac = Color(0xFFa78bfa)         // Primary accent
val Ac2 = Color(0xFF7c3aed)      // Deep accent (gradients)
val AcLight = Color(0xFFc4b5fd)   // Light accent (text on dark bg)

// Agent brand colors
val AgentClaude = Color(0xFFa78bfa)
val AgentQwen = Color(0xFF60a5fa)
val AgentGemini = Color(0xFF34d399)
val AgentKimi = Color(0xFFfbbf24)
val AgentOpenCode = Color(0xFFfb923c)

// Status colors
val Ok = Color(0xFF22c55e)       // Success / online
val OkLight = Color(0xFF4ade80)  // Brighter success
val Warn = Color(0xFFf59e0b)     // Warning / pending
val WarnLight = Color(0xFFfbbf24)// Brighter warning
val Err = Color(0xFFef4444)     // Error / offline
val ErrLight = Color(0xFFf87171) // Brighter error

// Derived alpha helper (renamed to avoid conflict with Color.alpha property)
fun Color.withAlpha(a: Float) = this.copy(alpha = a)

// ── Backward-compatible aliases (old UI → new design system) ──
val Pr = AgentClaude
val Gn = AgentGemini
val Rd = Err
val Or = AgentOpenCode
val Gd = Warn
val Bd = Line
val Bd2 = Line2
val Tx4 = Tx3
val Glass = Bg2
val Glass2 = Bg3
val Surface = Bg2
val Surface2 = Bg3
val RR = R8
val RR2 = R12
val RR3 = R16
val AcD = Ac.withAlpha(0.12f)
val PrD = AgentClaude.withAlpha(0.12f)
val GnD = AgentGemini.withAlpha(0.12f)
val RdD = Err.withAlpha(0.12f)
val RdD2 = Err.withAlpha(0.12f)
val GdD = Warn.withAlpha(0.12f)
val Glow = Ac.withAlpha(0.3f)
val GlowGn = AgentGemini.withAlpha(0.3f)
val Bg = Bg0
