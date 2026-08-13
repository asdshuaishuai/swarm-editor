# JetBrains 开源资产深挖与 Swarm Editor 落地报告

> 调研日期：2026-08-13
> 目标：从 JetBrains 开源组织的仓库与源码中提炼可复用的产品、架构、安全和工程模式，并映射到 Swarm Editor。

## 官方来源

本报告以 JetBrains 官方组织仓库页及以下仓库在 2026-08-13 的默认分支内容为依据：

- [`JetBrains/thinkrail`](https://github.com/JetBrains/thinkrail)：Pi 宿主、Worktree IDE、Review、Spec Graph 和三环架构。
- [`JetBrains/koog`](https://github.com/JetBrains/koog)：Kotlin Agent、工具、MCP、记忆/RAG、流式和图工作流。
- [`JetBrains/context`](https://github.com/JetBrains/context)：Context CLI 的公开集成层、skills、agents、hooks 和 MCP 配置。
- [`JetBrains/skills`](https://github.com/JetBrains/skills)：经验证的 Agent Skills 目录和来源清单。
- [`JetBrains/mcp-jetbrains`](https://github.com/JetBrains/mcp-jetbrains)：已弃用的 MCP 代理及迁移说明。
- [`JetBrains/intellij-community`](https://github.com/JetBrains/intellij-community)：当前 IntelliJ Platform、Jewel、工具窗口、Actions 和 VCS 实现。
- [`JetBrains/compose-multiplatform`](https://github.com/JetBrains/compose-multiplatform)、[`JetBrains/skiko`](https://github.com/JetBrains/skiko)、[`JetBrains/JetBrainsRuntime`](https://github.com/JetBrains/JetBrainsRuntime)：桌面 UI、Skia 和运行时交付基础。
- [`JetBrains/junie`](https://github.com/JetBrains/junie)：CLI、IDE、CI 多入口的 Agent 产品交付参考。

仓库列表本身来自 [JetBrains GitHub organization repositories](https://github.com/orgs/JetBrains/repositories)；结论只把公开仓库中的架构、README、SPEC 和源码作为证据，不推断 JetBrains 未公开的内部实现。

## 1. 结论先行

JetBrains 当前与 Swarm Editor 最有价值的资产不是单一 UI 组件，而是一条完整的“AI IDE 产品链”：

1. **IDE 基础设施**：`intellij-community`、`compose-multiplatform`、`skiko`、`JetBrainsRuntime` 提供工具窗口、编辑器、动作系统、键盘优先和桌面交付的底座。
2. **Pi 宿主产品**：`thinkrail` 将 `pi` 作为唯一 Agent 引擎，围绕 Git Worktree、多个会话、Changes/Diff、Review、Spec Graph 和移动端壳构建产品闭环。
3. **Agent 框架思想**：`koog` 把 Agent 拆为工具、记忆/RAG、流式输出、MCP、可组合图工作流和容错运行时；它更适合作为设计参照，不应替换项目既有的 Pi runtime。
4. **上下文治理**：`context` 将语义搜索、历史研究、组织级搜索、依赖搜索和 blast radius 做成 Agent 可调用的探索工具；`skills` 则把技能分发、来源和组合能力产品化。
5. **安全边界**：`mcp-jetbrains` 已明确标注 Deprecated，核心能力已进入 IntelliJ 2025.2+；这证明外部代理层不应继续做薄代理，而应把权限、生命周期和审计收回宿主。

对 Swarm Editor 的判断：当前已实现 JetBrains 风格导航/VCS/LSP、Pi 原生运行、图感知 Swarm、隔离 worktree、证据审计和 MCP/Skill 管理；下一阶段最有价值的缺口是 **项目上下文治理和可读规格图**，其次是 **Review 包、会话级成本/流式活动聚合、Context 风格语义探索**。

## 2. 仓库分层与证据

| 层 | 代表仓库 | 观察 | 对 Swarm 的含义 |
| --- | --- | --- | --- |
| IDE 平台 | `intellij-community` | 工具窗口、树、Actions、VCS、Speed Search、DialogWrapper 是系统能力，不是孤立页面 | 继续复用本地 `JetBrainsUi`；避免引入 IntelliJ Platform |
| Compose 桌面 | `compose-multiplatform`, `skiko`, `JetBrainsRuntime` | 桌面 UI、Skia 渲染、JBR 运行时形成稳定交付组合 | 当前 Kotlin/JVM Compose 方向正确，继续加强 JBR 集成和打包检查 |
| Pi IDE | `thinkrail` | Pi in-process；项目→Worktree→会话/文件/终端；中心 Tab；右侧 All Files/Changes/Specs；Review 是工作区本地对象 | 直接复用产品结构，但适配 Swarm 的 in-process Kotlin 边界，不引入 HTTP/WS |
| Agent 框架 | `koog` | MCP、RAG/记忆、流式和图工作流，强调 fault tolerance | 采纳概念与评估指标；Pi 仍是唯一运行时 |
| Context | `context` | 公开集成层，CLI 私有；提供 context-search、context-research、org-search、dependency-search、blast-radius | 建立项目上下文索引/引用/影响分析服务，优先保证证据可追溯 |
| Skills | `skills` | 技能按来源维护，包含 Kotlin/Compose/Gradle/调试等专门能力 | 统一 Skill 来源、项目级准入、信任和审计；不要盲目复制技能正文 |
| MCP | `mcp-jetbrains` | 旧 Node 代理已弃用，能力已并入 IDE | MCP 应由宿主统一管理，Pi 只获得显式授权的工具能力 |
| Agent 产品 | `junie` | CLI/IDE/CI 多入口，强调可替换 LLM | 可借鉴入口与发布策略；不改变 Swarm 的 Pi-only runtime 决策 |

## 3. ThinkRail 源码级拆解

### 3.1 三环架构

ThinkRail 把产品拆为 Engine Host、typed Wire、UI Client。UI 只能依赖 contracts，Host 持有 Pi、持久化和会话。

Swarm Editor 的约束是桌面 UI 与后端直接同 JVM 调用，因此不复制网络协议；应复制的是边界思想：

- `common` 只承载稳定 DTO、路径和序列化模型；
- `backend` 承载 Pi、权限、持久化、审计和调度；
- `desktopApp` 只依赖服务/DTO，不直接拼装运行时细节；
- UI 状态与领域状态分离，避免把 Pi 的原始事件直接变成页面状态。

### 3.2 Worktree-first

ThinkRail V1 的核心单位是 `project → workspace/worktree → chats/files/terminals`，还明确区分默认工作区、用户已有 worktree 和应用创建的 worktree。

Swarm 已经对 Swarm 任务提供 detached Git worktree 和证据，但交互式用户工作区仍以单一 `projectRoot` 为中心。可落地设计：

- 增加显式 `ProjectWorkspace` 模型：`DEFAULT`、`MANAGED_WORKTREE`、`EXTERNAL_WORKTREE`；
- 会话、编辑器标签、LSP root、Git Changes 和 Skill admission 都绑定 workspace；
- 保留当前默认项目目录作为用户可见锚点，不强制迁移已有项目；
- Swarm 任务 worktree 与交互式工作区继续分离，避免审计工作区污染用户编辑器。

### 3.3 Review package

ThinkRail 的 Review 是工作区本地的、先收集后发送的结构化对象：用户在 Diff 上挂评论，之后按文件发送到 Pi 会话，并保存“已发送”记录；不是直接集成 GitHub PR。

Swarm 已有证据优先的 Diff、artifact、verification 和审查抽屉，但缺少用户主动评论到 Agent 的稳定数据结构。应新增：

- `ReviewComment`：文件、行范围、正文、基线 revision、状态；
- `ReviewPackage`：workspace、revision、评论列表、选定 Diff、发送状态；
- 发送时将评论作为结构化上下文注入现有 Pi 对话；
- Agent 只能通过明确的 resolve 操作关闭评论；
- 基线漂移时标记为 stale，不静默移动行号。

### 3.4 Spec Graph

ThinkRail 将 `pi-spec-graph` 分成 Pi 侧工具/技能和 Host 侧只读 read model，V1 只展示以 `parent` 为关系的规格树，不做图画布和漂移检测。

Swarm 现有 Swarm DAG 是执行图，服务于调度和 handoff，不等价于项目规格图。应保持两者分离：

- `SwarmGraph`：运行时任务图，短生命周期、可执行、必须 DAG；
- `ProjectSpecGraph`：仓库中的 Markdown/YAML/JSON 规格节点，用户可读、可持久化、只读起步；
- 规格节点打开后进入普通编辑器 Tab；
- 右侧增加 Specs tool window，与 All Files/Changes 并列；
- 后续再加 drift detection 和 pre-build approval，不在第一版混入执行调度。

## 4. Skills 与 Context 的关键差异

当前 `SkillScanner` 扫描用户级目录，`SkillStore` 持久化元数据，`SkillService` 按 Agent 同步到 Pi；它解决了“技能能不能被发现和同步”，还没有完全解决“项目仓库技能是否可信”。

ThinkRail 明确规定：

- personal/bundled skills 可直接加载；
- 仓库 committed skills 只有在项目显式 trust 后才加载；
- clone 下来的项目内容视为攻击者可控；
- 每个项目有独立 trust 状态。

因此 Skill admission 应成为 Pi 启动前的显式决策：

```text
Skill source
  ├─ USER / BUNDLED      -> allowed by default
  └─ PROJECT_COMMITTED   -> requires project trust

project trust key = canonical project root + repository HEAD/skill fingerprint
```

建议的最小模型：

```kotlin
@Serializable
data class ProjectSkillTrust(
    val projectPath: String,
    val granted: Boolean = false,
    val grantedAtEpochMillis: Long? = null,
    val skillFingerprint: String = "",
)
```

准入规则：

1. 发现 `.agents/skills`、`.claude/skills`、`.pi/agent/skills` 等项目内技能时，标记 `PROJECT_COMMITTED`；
2. 未授权时只展示元数据，不复制到 Pi runtime；
3. 授权时记录 canonical path、HEAD、技能文件 fingerprint；
4. 文件或 HEAD 变化后重新提示，不静默继续信任；
5. 日志和 Activity 记录“加载/拒绝/撤销”原因；
6. 保持 cancellation 传播和原子同步，不改变现有 SkillService 的同步事务。

Context 仓库则提示另一个切入点：不要让 Agent 只看到巨大文本，而是提供可引用的探索结果：查询、命中、路径、行号、摘要、时间和影响范围。当前项目已有 LSP symbols、Find in Files、导航历史、Repository Localization 和 Graph Context Envelope，可统一成 `ProjectContextService` 的内部接口，先不引入外部网络。

## 5. Koog 的可采纳部分

Koog 的可迁移价值在抽象，而不是执行引擎：

- **Tool contract**：工具 schema、授权、结果和错误应独立于模型；Swarm 已有 Pi Tool Broker 与审计，可继续统一结果边界。
- **Streaming**：把 Pi 原始事件转为稳定的 session activity reducer，UI 订阅聚合状态而不是直接消费每类事件。
- **Graph workflows**：Swarm 已有 DAG；可借鉴节点状态、重试、超时、人工确认和 checkpoint 的统一语义。
- **Memory/RAG**：Swarm 已有 Experience Store；下一步应把经验命中变成带来源/置信度/适用范围的 Evidence，而不是无标注 prompt 拼接。
- **Fault tolerance**：连接失败、工具拒绝、验证失败和取消必须拥有可恢复状态，并在 NonCancellable 清理中释放资源；项目现有实现已遵循这一方向。

明确不做：引入 Koog 作为第二个 agent runtime、把 Pi task graph 改造成 Koog graph、或增加 HTTP/WS 控制平面。

## 6. 代码落地优先级

### P0：项目 Skill Trust / Admission

理由：这是 ThinkRail 对攻击面最明确、且当前实现存在真实缺口的部分；会影响 Pi 启动前的安全边界。

验收：未信任项目技能不进入 `PiRuntimePaths.agentDirectory(...)/skills`；信任、撤销、fingerprint 变化都有测试；用户级技能行为不回归。Activity 已记录信任、撤销和拒绝同步事件。

### P1：Project Spec Graph 只读查看器

理由：补齐 ThinkRail 的 Specs rail，同时复用当前 Markdown parser 和 editor navigation；不会侵入 Swarm 执行图。

验收：从项目目录发现规格节点、按 `parent` 渲染树、打开节点到编辑器、非法引用被忽略并有诊断。

### P1：Review Package / Anchored comments

理由：把已有证据和 Diff 从“展示”提升为“可操作反馈”。

验收：评论绑定 revision 与行范围；漂移标 stale；发送上下文后保留审计；Agent resolve 有显式事件。

### P2：Context-style semantic exploration

理由：已有搜索/LSP/图上下文，统一入口后能减少 Agent 重复扫描和上下文膨胀。

验收：结果带来源、文件和行范围；查询可取消；结果可复现；所有注入 Agent 的内容都有 evidence label。

### P2：Session cost/activity reducer

理由：ThinkRail 和 Koog 都强调流式反馈与模型成本；当前数据模型已有 TokenUsage，可补充会话/工作区聚合视图。

## 7. 不应照搬的内容

- 不引入 ThinkRail 的 Bun HTTP/WS 传输；本项目明确要求桌面/backend in-process。
- 不引入 Koog 作为 Pi 的替代运行时。
- 不直接复制 IntelliJ Platform/Jewel 大型依赖；保持本地 Compose design layer。
- 不使用已 Deprecated 的 `mcp-jetbrains` Node proxy 作为产品基础。
- 不把用户仓库中的 Skills、MCP 配置或 prompt 文件当作默认可信输入。
- 不把 Swarm 执行 DAG 与用户规格图混为一谈。

## 8. 当前状态审计

已具备：Pi-native runtime、in-process backend、动态图感知 Swarm、Git-isolated task execution、LSP with fallback、Markdown/HTML/JSON rendering、evidence-first review、Bubblewrap conditional isolation、JetBrains 风格 Search Everywhere/Recent Files/Recent Locations/VCS/Workspace Symbols，以及只读 `ProjectSpecGraphScanner` 核心、`ProjectService.getSpecGraph()`、桌面 DTO/ViewModel、Specs 右侧工具窗口和行为测试。项目 Skill Trust 已完成项目内技能扫描、SHA-256 fingerprint 绑定的原子 trust ledger、Pi admission gate 和后端行为测试。

缺失或未验证：交互式 Project Workspace 管理、Project Spec Graph 增量缓存/Pi context 接入、Review package 评论生命周期、Context-style 统一语义探索、session/workspace cost aggregation。

本轮实现的 Spec Graph 切片见 `docs/architecture/project-spec-graph.md` 与 `backend/.../spec/ProjectSpecGraph.kt`。它刻意只实现文件扫描、frontmatter 子集、图关系校验和诊断；尚未宣称完成 ThinkRail 的增量缓存、Pi 工具、Specs tool window 或规格编辑能力。

这份报告建议后续实现顺序为 P0 → P1 → P1 → P2；每一步都要延续现有的 Kotlin serialization、Mutex、Dispatchers.IO、原子持久化和行为句子测试约定。
