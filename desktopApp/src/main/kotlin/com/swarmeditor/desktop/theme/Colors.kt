package com.swarmeditor.desktop.theme

import androidx.compose.ui.graphics.Color

/* ═══════════════════════════════════════════════════════════════
   Swarm Editor — Design System Colors (from MVP mockup)
   ═══════════════════════════════════════════════════════════════ */

// Backgrounds — Hybrid 柔和深色分层（紫调身份 + Apple 克制）
val Bg0 = Color(0xFF0f1018)      // 最深背景（微调：更深一档，增加深度层次）
val Bg1 = Color(0xFF171823)      // 侧栏/面板底
val Bg2 = Color(0xFF1f2030)      // 卡片/输入框底（磨砂感）
val Bg3 = Color(0xFF2a2c40)      // hover/高亮底（柔和反馈）

// Lines / Borders — 柔化分隔线
val Line = Color(0xFF252637)     // 主分隔线（微调：降饱和）
val Line2 = Color(0xFF33354a)    // hover 分隔线

// Text — 三级文字（微调：提高主文字对比度）
val Tx = Color(0xFFeaecf4)       // 主文字（微提亮）
val Tx2 = Color(0xFF949bb0)      // 次文字
val Tx3 = Color(0xFF62677d)      // 弱化/标签文字

// Accent (purple) — 紫身份保留；Hybrid 克制：仅 CTA/激活态用（使用面靠组件层收）
val Ac = Color(0xFFa78bfa)         // Primary accent
val Ac2 = Color(0xFF7c3aed)      // Deep accent (gradients)
val AcLight = Color(0xFFc4b5fd)   // Light accent (text on dark bg)

// Agent brand colors — 还原设计稿值（比旧"提亮版"更柔，符合 Hybrid 克制）
val AgentClaude = Color(0xFFa78bfa)    // Claude 紫
val AgentQwen = Color(0xFF60a5fa)      // Qwen 蓝
val AgentGemini = Color(0xFF34d399)    // Gemini 绿
val AgentKimi = Color(0xFFfbbf24)      // Kimi 金
val AgentOpenCode = Color(0xFFfb923c)  // OpenCode 橙

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
