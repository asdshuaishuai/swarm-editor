# JetBrains 开源资产深挖增量报告

> 调研日期：2026-08-14
> 目标：在 2026-08-13 初版研究之上，按 JetBrains 官方组织仓库页重新盘点公开资产，并深挖 Agent、上下文、IDE 宿主、协议、质量和交付链路。

## 1. 范围与方法

GitHub 官方组织仓库页在本轮返回 **852 个公开仓库**。本报告没有把仓库数量误读成 852 个同质产品，而是先按名称、描述、语言、fork/archived 状态和最近更新时间筛出高相关候选，再固定默认分支 commit 做源码阅读。

按仓库名称与 description 的可复现关键词粗分（类别可以重叠）得到：155 个 archived、179 个 fork、187 个 Agent/Context/Skill/MCP/AI 相关候选、275 个 IDE/UI/Runtime/语言工具候选、224 个 CI/质量/交付候选、33 个数据库/图/存储候选。这个统计用于发现入口，不把关键词命中当作架构结论；架构结论只来自下面固定 commit 的文件证据。

重点源码快照：

| 仓库 | 本轮固定 commit | 研究价值 |
| --- | --- | --- |
| `JetBrains/thinkrail` | `eed0492a97a83be509b1953b68c6b68879f077f0` | Pi 宿主、Worktree IDE、Review、Specs、三环边界 |
| `JetBrains/ytdb-slate` | `3813981498ee132eca8e8cb7b7ca2ac0455a0268` | thread weaving、episode、handoff、预算、failover、review gate |
| `JetBrains/context` | `e055ce57ad6d883f1379f9e35a3108acc35e8232` | 公开集成层、semantic bootstrap、hooks、blast radius |
| `JetBrains/junie` | `50039d1278c82ba8c7f4f6d4f004e55bd0b8938e` | LLM-agnostic Agent 的终端/IDE/CI 交付入口 |
| `JetBrains/koog` | `10bba89b67929bab3617047a6a7c8d8cf3ff9185` | Kotlin Agent 抽象、工具、MCP、记忆和容错设计参照 |
| `JetBrains/skills` | `e0f258b5cfed145015cb3e48da9a97947f7c4ed7` | Skill 目录、来源和免责声明 |

这是一份架构研究，不把公开 README 推断成 JetBrains 内部实现。`context` 明确说明 `jbcontext` CLI 本体是私有仓库发布的预编译二进制；本报告只把公开的 integrations、skills、agents、hooks 和 MCP 配置当作证据。

## 2. 组织资产分层

### 2.1 Agent 产品与编排

- `thinkrail`：Pi-only 的轻量 IDE 宿主，项目 → worktree → tabs/session → files/changes/specs/review。
- `ytdb-slate`：Pi extension，不是第二个 Agent runtime；把长任务拆成带类型的 threads 和可持久化 episodes，用 handoff、预算和审查 gate 织回主线程。
- `junie`：面向终端、IDE 和 CI/CD 的 LLM-agnostic coding agent；它更像产品分发和认证/BYOK 参考，不应替换本项目 Pi runtime。
- `junie-github-action`：把 Agent 入口推向 issue、PR 和 CI 失败事件，是自动化触发边界的参考。
- `rider-skills`、`datalore-skills`、`skills`：按产品/技术域提供 Skill 集合；Skill 是可组合能力包，不等于默认可信的仓库指令。

### 2.2 上下文与宿主协议

- `context`：公开的 `jbcontext` 集成层，提供 `context-search`、`context-research`、`org-search`、`dependency-search`、`blast-radius` 和只读 explorer agent。
- `agent-client-protocol` 及其 Kotlin SDK 生态：把编辑器与 Agent 的连接抽象为协议；可用于比较 wire contract，但不改变 Swarm Editor 的 in-process backend 约束。
- `mcp-server-plugin`：把 MCP Server 能力放入 IntelliJ 插件宿主；强调宿主生命周期和 IDE 权限，而不是独立 Node 代理。
- `mcp-jetbrains`：README 已标记 Deprecated，并要求迁移到 IntelliJ 2025.2+ 内置 MCP Server；这是“能力回收到宿主”的强信号。
- `mcp-steroid`：实验性/社区方向的 MCP 插件项目页，适合观察扩展生态，不适合作为核心架构依据。

### 2.3 IDE、UI 和运行时底座

- `intellij-community`：Actions、工具窗口、编辑器、VCS、Speed Search 和生命周期管理的系统级参考。
- `compose-multiplatform`、`skiko`、`JetBrainsRuntime`：Compose 桌面渲染、Skia 绑定和 JBR 交付组合。
- `compose-hot-reload`：JBR 上的快速 UI 反馈和无重启热更新，适合作为桌面开发体验参考，而非运行时 Agent 能力。
- `kotlin`、`kotlin-toolchain`、`kotlin-compiler-server`：语言服务、工具链和代码智能生态。

### 2.4 质量、CI 和分发

- `qodana-cli`、`qodana-action`、`qodana-profiles`：把检查器、CLI、CI action、profile 和报告输出拆成可复用边界。
- `teamcity-cli`：把构建、日志、Agent、队列和 terminal 暴露给终端或 AI；适合研究工具契约和长任务反馈。
- `artifacts-caching-proxy`、`marketplace-zip-signer`、`JetBrainsRuntime`：分别对应可复现交付、签名和运行时可信发布。

## 3. 深读结论

### 3.1 ThinkRail：宿主负责工作区，Pi 负责 Agent 真相

`thinkrail/README.md` 与 `goal-and-requirements.md` 给出非常清晰的 ownership：Pi 拥有 model、system prompt、skills、compaction、cost 和 session state；宿主拥有 workspace、editor 和 wire。V1 的工作区是 Git worktree，每个 worktree 有自己的 branch 和 cwd；Review 是工作区本地对象，评论先收集、再按文件作为结构化上下文发送给 Pi。

`thinkrail/architecture.md` 进一步规定：

- UI 只能依赖 typed contracts，不能 value-import server 或 Pi；
- host 读取 Pi state 并转发 delta，不重新计算 Pi 的真相；
- session 的存活和删除是不同的 domain action；
- 依赖精确 pin，并在 CI 中检查 catalog 漂移；
- shell 绑定 `(workspaceId, tabKey)`，由 host 维护独占映射，不把 tmux 当持久化层。

对 Swarm Editor 的直接启示是：已有 in-process boundary 是正确方向，但当前 `ProjectService` 仍以单一 `projectDir` 为中心，缺少 ThinkRail 的显式 Project/Workspace/Worktree domain；下一步不应把 worktree 继续藏在 Swarm task 临时目录里。

### 3.2 YTDB-Slate：episode 是跨上下文的事实边界

`ytdb-slate/docs/design-principles.md` 把长任务问题归结为 working memory、context rot 和 strategy/tactics 分离。它没有用“更长 prompt”解决，而是引入：

- typed thread：`researcher`、`reviewer`、`adversarial`、`implementer`、`general`；
- episode：每次 worker action 的可引用交付记录；
- handoff：把整体目标、thread 状态、episode ids 和下一步动作写成可恢复上下文；
- bounded observations：review 结果和建议有确定大小、来源和 fallback；
- restart lineage：fresh context 只从显式 episode 进入 successor，失败/取消有 commit point。

`extension/state.ts` 的持久化模型更值得借鉴：每次状态变更向 Pi session append 一个完整的 `slate-state` custom entry；恢复时只读取当前 branch 上最后一个快照，同时对旧快照采用 additive tolerance 和 allowlist sanitizer。这样状态跟随 Pi session tree，而不是再造一个与 Pi 分叉语义脱节的数据库。

`docs/track-workflow.md` 还把 reviewer 与 implementer 分离：review thread 不改文件，发现通过 compact finding index 路由到 implementation thread；修复后必须由新的 gate thread 复核。这个约束比“Agent 自己 review 自己修”更适合 Swarm 的证据审计。

### 3.3 YTDB-Slate：成本和 failover 必须保守地 abstain

`model-router.ts`、`failover.ts` 和 `docs/thread-cache-cost.md` 的共同模式是：模型选择不能只看 nominal model；必须区分 base、last、live failover、effort capability、cache warm/cold 和 retention evidence。证据缺失时 router abstain 或采用保守估计，不把未知当成便宜，也不为了 cache savings 降低任务所需 capability。

Swarm Editor 已有 `TokenUsage`、模型池和动态分配，但还没有持久化的 route decision / cost evidence / failover lineage。将来补成本聚合时，应先记录决策和数据质量，再显示金额，避免 UI 给出无法复现的“估算成本”。

### 3.4 Context：语义搜索必须成为受限 bootstrap，而非无限搜索按钮

`context/README.md` 把功能拆成 `context-search`、`context-research`、`org-search`、`dependency-search` 和 `blast-radius`，并提供只读 explorer agent。其 hooks 比 skill 文档更有价值：

1. 未知文件/子系统时只允许一次 broad semantic bootstrap；
2. 至少读取一个结果后，才允许本地 `rg`/`grep`/`find`；
3. 第二次语义查询必须带 path filter，只允许一次 narrowed retry；
4. 初始 discovery 阶段禁止直接用 git history；
5. hook 状态按 session 隔离，并使用 `umask 077` 保护临时状态。

这不是为了强迫某个 CLI，而是把“先建立语义地图，再近邻读取，再限制重试”编码成可审计的 agent workflow。Swarm Editor 当前有 `ProjectService.search`、LSP symbols、repository localization 和 Graph Context Envelope，但还没有统一的 context request/result/evidence contract，也没有 semantic-search budget。

### 3.5 MCP：外部代理层正在被宿主能力取代

`mcp-jetbrains` 的 Deprecated 迁移说明与 `mcp-server-plugin` 的存在共同说明：MCP 的 tool schema 可以标准化，但 IDE 权限、生命周期、项目范围和审计必须在宿主内收口。Swarm Editor 已有 Pi Tool Broker、Bubblewrap/WASM boundary 和逐请求 audit，因此不应重新引入 Node proxy 或 HTTP/WS 控制平面。

### 3.6 Qodana/TeamCity：质量结果是结构化交付，不是终端文本

`qodana-cli`/`qodana-action` 展示了检查器、运行入口、profile、CI 触发和报告的拆分方式；`teamcity-cli` 则把 build、log、agent、queue 和 terminal 视为可组合操作。对 Swarm 的启示是：验证结果应进入 Outcome/Evidence/Verification/Residual Risk/Handoff 这样的结构化交付，而不是只把命令 stdout 拼进 prompt。

## 4. 对 Swarm Editor 的逐项审计

| 能力 | 当前证据 | 结论 |
| --- | --- | --- |
| Pi-only runtime / in-process backend | `backend/.../pi/`、`ConversationService`、`PiRuntimeManager` | 已对齐 ThinkRail，继续保持 |
| Git task worktree / sandbox | `SwarmTaskWorkspace`、Bubblewrap、WASM | 执行隔离已强，但尚未成为用户可见 Workspace domain |
| Project/Workspace/Worktree lifecycle | `ProjectService(projectDir)`、固定 `projectRoot` | 明显缺口，优先补 domain/service，不应继续只靠临时 task worktree |
| Specs graph | `ProjectSpecGraphScanner`、Specs tool window、Pi metadata context | V1 只读能力已对齐；主动监听、原始内容语义注入仍缺 |
| Review | `ReviewPackageStore`、`ReviewService`、revision stale、Activity | 后端最小闭环已具备；Diff UI、显式发送、Pi resolve 未完成 |
| Context exploration | 搜索、LSP、repository localization、graph evidence | 能力分散；缺统一 evidence-labeled request/result 和重试预算 |
| Episode/handoff | Session messages、remote branch reconcile、Swarm handoff | 有消息和任务交付，但缺跨上下文 episode snapshot 与 lineage protocol |
| Cost/routing | `TokenUsage`、ModelService、模型池 | 有原始 usage 和 allocation；缺可复现 route/cost/failover evidence |
| Trust/admission | Project Skill Trust、Pi Tool Broker、沙箱审计 | 已是强项，继续避免默认信任仓库输入 |
| Delivery quality | Gradle tests/build、Pi runtime build、原子持久化 | 基线可靠；可吸收 exact pin、dependency drift、报告 artifact 规则 |

## 5. 下一轮落地顺序

### P0：用户可见 Project Workspace / Worktree domain

新增显式 `ProjectWorkspace` 模型和后端 service：列出默认 workspace、创建/附加/删除 worktree，持久化 canonical path、branch、cwd 和 ownership；所有 ProjectService/GitService/Session 创建都从 active workspace 取 cwd。必须保留当前 Swarm task worktree 的临时隔离语义，不把两者混用。

### P1：Review 进入真实工作流

为 `ReviewService` 增加“按文件发送”的结构化 context builder 和 Activity 事件；ConversationService 接收显式 review payload，而不是默认把所有评论自动塞入每轮 prompt。Diff UI 只负责 draft/anchor/resolve，revision 不一致时必须保持 `STALE`，不能移动行号。

### P1：Episode/Handoff 交付协议

把现有 Swarm task outcome 和 Pi session branch 统一成可引用的 episode record：固定六段交付、bounded text、source IDs、verification、residual risk 和 downstream handoff；恢复时优先读 durable record，再读取原始输出。

### P2：Context request/result/evidence contract

把 Project search、LSP symbol、repository evidence 和 spec graph metadata 统一为只读 `ContextEvidence`：来源、path、line range、summary、confidence、query fingerprint、truncated、createdAt。增加一次 broad + 一次 path-filtered retry 的预算，并把注入 Pi 的文本强制包在 evidence label 中。

### P2：Route/cost/failover evidence

在现有 TokenUsage 和 ModelService 上记录 nominal route、actual route、effort validation、cache assumption、failover lineage、price source 和 abstain reason；先做后端聚合，再做 UI 金额展示。

## 6. 明确不采纳

- 不引入 Koog 作为第二个 Agent runtime；只吸收其 tool/memory/flow/fault-tolerance 抽象。
- 不把 `mcp-jetbrains` Deprecated Node proxy 作为基础设施。
- 不把 `context` 的私有 CLI 当作依赖；只借鉴公开 integration/hook/evidence 规则。
- 不把 ThinkRail 的 Bun HTTP/WS wire 复制到本项目；Swarm Editor 继续使用桌面到 backend 的 in-process service。
- 不把 YTDB-Slate 的 exact provider price、实验数据或其未公开研究语料当作本项目事实；只采纳可验证的状态/预算/证据模式。
- 不把用户仓库的 committed skills、MCP 配置或 prompt 文件默认当作可信输入。

## 7. 研究边界

本轮深入了与 Swarm Editor 直接相关的公开仓库和源码快照，不宣称已经逐行审计 852 个仓库。下一轮若继续扩大范围，应按 `Agent/IDE/Build/Runtime/Language/Cloud/Domain` 分类抽样，并为每个新结论固定仓库 commit、文件路径和行为测试，而不是只增加 README 链接数量。
