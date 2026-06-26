# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🧭 工程铁律（多年血泪总结，每次任务前默念）

这些原则**高于一切技术决策**，所有代码必须以此为准绳：

1. **代码是负债** — 每行新代码都是维护成本。删掉一行比写一行更值得骄傲，少即是多。
2. **追问真需求** — 用户给的是方案而非问题。多问一层"为什么"，找到本质需求往往有更优解。
3. **简单即美** — 控制复杂度是编程总则。好方案 = 满足需求的最简方案。
4. **不过度设计** — 只解决当下确实存在的问题，扩展性留在接口层就够了。
5. **为故障设计** — 别幻想消灭故障，为故障准备对策：限流、熔断、降级、fallback。
6. **追查根因** — 不治表面症状，多问几层为什么。追查过程才是成长最快的时候。
7. **观察用户** — 别猜用户想要什么，直接看操作轨迹。一条反馈背后是上千沉默用户。
8. **设计两次** — 第一方案几乎不会最优。多做备选对比，设计多两小时省实现两周。
9. **命名即文档** — 好命名胜过注释。精确一致词达意，长度与作用域成正比。
10. **注释写为什么** — 不写显而易见的，只揭示代码无法表达的意图。
11. **早部署常交付** — 别堆到最后梭哈，越早暴露问题修复成本越低。
12. **勇于重构** — 系统病了就治。测试保驾护航，重构投入会在生命周期中数倍回报。
13. **DRY** — 一切重复都是膨胀的种子，消除重复代码，将重复流程自动化。
14. **学会提问** — 带上下文、带日志、用对方能懂的词。别问浪费彼此时间的问题。
15. **保持节奏** — 编程是马拉松不是冲刺，留出时间学习和休息。
16. **数据为王** — 系统核心是数据。代码可以将就，数据结构必须清晰合理。
17. **ROI 思维** — 先 MVP 后迭代，投入与收益匹配。
18. **软素质决定评价** — 做问题终结者，事事有回应，及时同步风险，把事做完。
19. **先怀疑自己** — 出 bug 先查自己代码，广泛使用的框架几乎不会错。
20. **测试改善设计** — 不好测 = 结构不好。单测不只防回归，更倒逼更好的架构。
21. **接受腐化** — 没有完美架构，让腐化慢些，做好隔离留有余地就够了。
22. **持续学习** — 读源码、找导师、多分享。学能改变行为的东西，别在舒适区重复。
23. **接口服务使用者** — 好用比好实现重要，复杂性封装内部，对外暴露最简接口。
24. **善用 AI 但别依赖** — AI 能写代码不代表你可以不懂代码。把 AI 当加速器，审查输出比写 prompt 更重要。
25. **像负责一辈子那样写代码** — 如果每行代码都会公开到朋友圈，你一定写得更好。

## 🔧 索引工具

每次开始工作前先跑：`codegraph init -i`（已初始化则 `codegraph index` 重新索引）。CodeGraph 是本项目的代码知识图谱索引，458 文件 / 符号 / 调用边。用 `codegraph_explore` 等 MCP 工具可快速查询符号定义、调用关系、影响分析。索引会随文件变化自动同步（约 1s 延迟）。

---

## ⚡ 提示词增强专业化元规则（Prompt Enhancement Meta-Rule）

**适用范围：所有 AGENT 任务**

**规则说明**：所有用户任务在正式执行前，必须经过提示词增强流程。未经增强和审批的原始提示词禁止直接执行。

### 执行流程（四步闭环）

```
用户原始提示词
      ↓
[Step 1] 触发提示词增强 Sub-agent（delegate_task → deep 分析型任务）
      ↓
[Step 2] Sub-agent 执行上下文感知分析
      ↓
[Step 3] 返回增强后提示词给主 Agent
      ↓
[Step 4] 主 Agent 向用户展示增强结果，等待审批
      ↓
用户审批通过 → 正式执行
用户审批驳回 → 返回 Step 1 重新增强
```

### Step 2 - Sub-agent 分析清单（必须完成）

当接收到用户提示词后，Sub-agent 必须并行执行以下检测：

| 检测维度 | 分析内容 | 输出要求 |
|---------|---------|---------|
| **上下文检测** | 当前对话历史、已完成的任务状态、待办事项、未被撤回的决策 | 列出相关上下文摘要 |
| **项目内容分析** | 读取项目根目录结构、识别涉及的组件/页面/模块/服务 | 标记受影响的文件路径 |
| **设计文档对齐** | 检查项目中的设计文档目录（如 `docs/` 等），读取与当前任务相关的规范 | 提取相关设计规范段落 |
| **智能体指引文件** | 重新读取项目级 `CLAUDE.md`（本文件）、其他智能体配置（如 `AGENTS.md`、`copilot-instructions.md` 等） | 提取适用的核心规则与约束 |
| **技术栈匹配** | 根据项目文件（`build.gradle.kts`、`settings.gradle.kts` 等）识别实际使用的语言、框架、库与构建工具 | 列出关键技术与版本约束 |

### Step 3 - 能力映射（MCP/Skills/Tools 指引）

Sub-agent 必须根据任务类型，推荐适用的能力。以下为通用分类，需结合项目实际情况选择。

#### 1. MCP 工具推荐
```yaml
代码质量:
  - LSP 工具链: lsp_diagnostics, lsp_rename, lsp_find_references
  - AST 工具: ast_grep_search, ast_grep_replace

外部集成:
  - GitHub CLI: gh (PR、Issue、Release 操作)
  - Context7: 查询第三方库文档
```

#### 2. Skills 技能推荐
```yaml
版本控制:
  - git-master: 所有涉及仓库操作的必须加载

项目通用:
  - review-work: 完成实现后的代码审查
  - ai-slop-remover: 清理 AI 生成代码异味
```

#### 3. Tools 工具推荐
```yaml
文件操作:
  - read: 读取文件内容
  - edit: 精确修改文件内容
  - write: 创建新文件
  - glob: 文件模式搜索
  - grep: 内容搜索

代码智能:
  - lsp_symbols: 代码符号分析与导航
  - lsp_diagnostics: 诊断错误与警告
  - ast_grep_search: 基于 AST 的模式搜索与替换

任务管理:
  - todowrite: 创建/更新任务列表
  - task: 委派子任务给专业 Agent
```

### Step 4 - 增强提示词输出格式

Sub-agent 返回的增强提示词必须包含以下结构：

```markdown
## 📋 任务分析摘要
- **任务类型**: [功能开发/缺陷修复/重构/测试/文档/运维/其他]
- **影响范围**: [列出受影响的文件/模块/服务]
- **复杂度评估**: [简单/中等/复杂]

## 🎯 增强后提示词
[基于原始提示词，添加上下文、设计约束与技术规范后的完整任务描述]

## 📚 参考资源
- **设计文档**: [相关设计文档路径或关键段落]
- **代码规范**: [适用的 CLAUDE.md 或 style guide 条款]
- **示例代码**: [项目中可参考的类似实现路径]

## 🛠️ 推荐工具链
- **MCP**: [推荐使用的 MCP 工具]
- **Skills**: [推荐加载的技能]
- **Tools**: [推荐使用的文件操作/代码智能/任务管理工具]

## ⚠️ 注意事项
- [技术约束 1，如语言版本、框架限制]
- [技术约束 2，如不可修改的公共接口]
- [潜在风险点，如破坏性变更、性能瓶颈]

## ✅ 预期输出
[明确任务完成后的可验证交付物，如：通过所有单元测试、生成 3 个 API 端点、更新 2 个页面组件等]
```

### 审批机制（强制性）

**审批流程**：
1. 主 Agent 向用户展示增强后的完整提示词
2. 用户必须明确回复以下之一：
   - **"批准" / "同意" / "可以执行"** → 进入正式执行
   - **"修改：[具体修改意见]"** → 返回 Step 1 重新增强
   - **"驳回" / "不执行"** → 任务终止，记录原因

**禁止行为**：
- 未经用户审批擅自执行增强后的任务
- 简化或跳过提示词增强流程
- 在用户未明确表态前假设审批通过

### Sub-agent 委派规范（通用模板）

```yaml
调用方式:
  task:
    category: "deep"                 # 深度分析型任务
    load_skills:                     # 按需加载分析辅助技能
      - []                           # 根据项目技术栈动态加载
    prompt: |
      TASK: 对用户提示词进行专业化增强

      原始提示词: "{userPrompt}"

      MUST DO:
      1. 读取项目级 CLAUDE.md 及所有相关智能体指引文件
      2. 扫描项目根目录结构，定位设计文档、配置文件
      3. 识别技术栈与版本约束
      4. 分析当前对话上下文及任务依赖关系
      5. 按照《增强提示词输出格式》返回结构化结果

      MUST NOT DO:
      1. 不执行任何实际代码修改或命令
      2. 不假设用户意图，只基于明确信息与项目规则分析
      3. 不推荐与当前技术栈无关的工具或库

      OUTPUT: 返回完整的增强提示词，等待用户审批
    run_in_background: false         # 同步等待结果
```

**元规则生效条件**：本规则适用于所有任务型对话，无需每次引用。主 Agent 在收到任何新的用户任务时，应自动进入本流程。

---

## 项目概述

Swarm Editor 是一款**多 Agent 协调桌面客户端**，正在进行 Kotlin/JVM 全栈重构。当前处于 MVP 阶段，聚焦可交互客户端核心能力，去掉了蜂群调度、多 Agent 协调和编辑器功能。

### 技术栈（Kotlin/JVM 全栈）

| 层 | 技术 | 版本 |
|---|------|------|
| 构建 | Gradle (Kotlin DSL) | 8.x |
| 后端 | Ktor Server | 3.1.x |
| 前端 | Compose Desktop | 1.7.x |
| 序列化 | kotlinx.serialization | 1.7.x |
| 协程 | kotlinx.coroutines | 1.9.x |
| 测试 | JUnit 5 + coroutines-test | - |
| JDK | OpenJDK | 21+ |

### MVP 核心功能

1. **ACP 协议**：JSON-RPC 2.0 over stdio，连接外部 CLI Agent
2. **Agent 管理**：5 个 Agent 统一管理与配置（Claude Code、Gemini CLI、Kimi Code、QwenCode、OpenCode），每个 Agent 独立适配器
3. **MCP 配置管理**：统一 MCP Server 配置、per-Agent 同步、工具浏览与调用
4. **Skills 配置管理**：文件系统扫描、统一存储、per-Agent 开关
5. **会话历史**：消息持久化、会话生命周期管理

### 不包含的功能（MVP 阶段）

- ❌ 蜂群调度与多 Agent 协调
- ❌ 编辑器能力（CodeMirror/Monaco）
- ❌ ShadowBuffer 与自动 lint 验证
- ❌ A2A Agent 间通信
- ❌ LSP 桥接
- ❌ 代码库索引与 @Files 语法

## 构建与测试命令

```bash
# 构建全部模块
./gradlew build

# 运行全部测试
./gradlew test

# 运行单模块测试
./gradlew :common:test
./gradlew :backend:test
./gradlew :desktop:test

# 运行单个测试类
./gradlew :backend:test --tests "com.swarmeditor.backend.acp.AcpClientTest"

# 启动后端服务
./gradlew :backend:run

# 启动桌面客户端
./gradlew :desktop:run

# 代码检查
./gradlew detekt

# 清理构建产物
./gradlew clean
```

## 项目结构

```
swarm-editor/
├── build.gradle.kts              # 根构建文件（插件声明）
├── settings.gradle.kts           # 模块声明（common, backend, desktop）
├── gradle.properties             # JVM 参数、Gradle 配置
├── common/                       # 共享数据模型与协议定义
│   └── src/main/kotlin/com/swarmeditor/common/
│       ├── model/                # AgentConfig, McpServerConfig, SkillConfig, Session, Message
│       ├── protocol/             # JSON-RPC 2.0 消息类型
│       └── config/               # 配置常量与路径
├── backend/                      # Ktor 后端服务
│   └── src/main/kotlin/com/swarmeditor/backend/
│       ├── Application.kt        # Ktor 入口
│       ├── acp/                  # ACP 协议（Transport, Client, Connection）
│       ├── agent/                # Agent 管理（Registry, Scanner）
│       │   └── adapter/          # 5 个 Agent 适配器
│       ├── mcp/                  # MCP 管理（Client, Store, AgentSync）
│       ├── skill/                # Skills 管理（Scanner, Store）
│       ├── session/              # 会话管理（Store, Manager）
│       └── route/                # Ktor API 路由
└── desktop/                      # Compose Desktop 前端
    └── src/main/kotlin/com/swarmeditor/desktop/
        ├── Main.kt               # 桌面入口
        ├── App.kt                # 根组件
        ├── theme/                # 主题与样式
        ├── navigation/           # 导航状态
        ├── viewmodel/            # ViewModel 层
        └── ui/                   # UI 组件（agent/, mcp/, skill/, session/, common/）
```

## 核心模块

### common — 共享模型与协议
- `model/AgentConfig`：Agent 配置数据类（id, name, command, args, env, agentType）
- `model/McpServerConfig`：MCP 服务器配置（type, command, url, enabledAgents）
- `model/SkillConfig`：技能配置（source, scope, path, enabledAgents）
- `model/Session`、`Message`、`ContentBlock`：会话与消息模型
- `protocol/`：JSON-RPC 2.0 消息定义（Request, Response, Notification, Error）

### backend/acp — ACP 协议实现
- `AcpTransport`：StdioTransport 接口，stdin/stdout JSON 行读写
- `AcpClient`：initialize 握手、session/new、session/prompt、session/close
- `AcpConnection`：进程管理、状态机（disconnected → connecting → connected → error）
- 敏感命令检测（19 条正则规则）

### backend/agent — Agent 管理
- `AgentRegistry`：Agent CRUD、启停、健康检查
- `AgentScanner`：PATH 扫描、`--version` 检测
- `adapter/`：5 个独立适配器
  - `ClaudeCodeAdapter`：`claude acp`，配置 `~/.claude/settings.json`
  - `GeminiCliAdapter`：`gemini --acp`，配置 `~/.gemini/settings.json`
  - `KimiCodeAdapter`：`kimi acp`，配置 `~/.kimi/config.toml`（TOML 格式）
  - `QwenCodeAdapter`：`qwen --acp`，配置 `~/.qwen/settings.json`
  - `OpenCodeAdapter`：`opencode acp`，配置 `~/.config/opencode/opencode.json`

### backend/mcp — MCP 配置管理
- `McpClient`：MCP JSON-RPC 2.0 over stdio（initialize、tools/list、tools/call）
- `McpStore`：统一存储 `~/.swarm-editor/mcp-servers.json`
- `McpAgentSync`：各 Agent 配置格式同步（Claude/Kimi/OpenCode/Qwen/Gemini 各自格式）

### backend/skill — Skills 管理
- `SkillScanner`：文件系统扫描（SKILL.md 清单 + 独立脚本）
- `SkillStore`：统一存储 `~/.swarm-editor/skills.json`

### backend/session — 会话历史
- `SessionStore`：JSON 文件持久化，原子写入（temp + rename）
- `SessionManager`：会话生命周期（active → closed → archived）

### desktop — Compose Desktop 前端
- 4 个核心面板：Agent 管理、MCP 配置、Skills 管理、会话历史
- ViewModel 模式：每个面板对应 ViewModel，通过 Ktor HTTP 与后端通信
- 导航：侧边栏导航 + 面板切换

## Agent 适配器差异

| 特性 | Claude Code | Gemini CLI | Kimi Code | QwenCode | OpenCode |
|------|------------|------------|-----------|----------|----------|
| ACP 命令 | `claude acp` | `gemini --acp` | `kimi acp` | `qwen --acp` | `opencode acp` |
| 配置格式 | JSON | JSON | TOML | JSON | JSON |
| 配置路径 | `~/.claude/settings.json` | `~/.gemini/settings.json` | `~/.kimi/config.toml` | `~/.qwen/settings.json` | `~/.config/opencode/opencode.json` |
| MCP 同步 | `~/.claude.json` | 待确认 | `~/.kimi/mcp.json` | `~/.qwen/settings.json` | `~/.config/opencode/opencode.json` |
| 类型映射 | stdio/http | 待确认 | stdio | httpUrl | local/remote |

## UI 设计稿

- 设计稿：`docs/superpowers/specs/mvp-design-mockup.html`
- 设计文档：`docs/superpowers/specs/2026-06-08-mvp-design.md`
- 风格：极客等宽 + 深色主题 + 发光强调色 + 扫描线
- 布局：左 Agent 图标栏 + 左侧栏（会话/项目） + 中间对话区 + 右侧面板（MCP/Skills/Diff + 活动日志） + 右上角设置模态框（Agent 配置/MCP 管理/Skills 管理）

## 开发阶段

| Phase | 目标 | 状态 |
|-------|------|------|
| Phase 1 | 项目骨架 + Gradle 构建系统 | ✅ 完成 |
| Phase 2 | ACP 协议层（官方 SDK 封装 + ConnectionManager） | 📋 待开始 |
| Phase 3 | Agent 管理（AgentAdapter 抽象 + Claude/Qwen 适配器 + Scanner + Registry） | 📋 待开始 |
| Phase 4 | MCP 配置管理（McpStore + AgentSync） | 📋 待开始 |
| Phase 5 | Skills 配置管理（SkillScanner + SkillStore + Agent 同步） | 📋 待开始 |
| Phase 6 | 会话历史（SessionStore + 消息持久化） | 📋 待开始 |
| Phase 7 | UI 面板（Composable Desktop 严格按设计稿实现） | 📋 待开始 |

## 配置路径

| 配置 | 路径 | 格式 |
|------|------|------|
| Agent 配置 | `~/.swarm-editor/agents.json` | JSON |
| MCP 统一存储 | `~/.swarm-editor/mcp-servers.json` | JSON |
| Skills 统一存储 | `~/.swarm-editor/skills.json` | JSON |
| 会话数据 | `~/.swarm-editor/sessions/{id}.json` | JSON |
