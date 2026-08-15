# JetBrains 开源资产深挖增量报告（2026-08-15）

> 目标：在 `2026-08-14-jetbrains-open-source-deep-dive.md` 的广度盘点之上，继续从 JetBrains 官方组织仓库的当前公开页面和源码目录抽取可验证的架构模式，并映射到 Swarm Editor。
>
> 研究边界：本报告研究公开仓库、README、公开目录和公开工作流，不把 fork 的上游实现、私有 CLI 或内部服务推断成 JetBrains 内部事实。

## 1. 当前组织地图

截至 2026-08-15，JetBrains 官方组织仓库页显示 852 个公开仓库。当前页面前列已经形成一条比“AI Agent 仓库”更完整的产品链：

```text
Agent runtime / product
  hermes-agent · junie · koog
        ↓
Context / skill / tool capability
  context · skills · mcp-steroid
        ↓
IDE / project host
  intellij-community · JetBrainsRuntime · compose-hot-reload
        ↓
Delivery / quality / automation
  junie-live · junie-github-action · qodana-cli · TeamCity assets
```

这个地图的关键不是仓库数量，而是职责边界：Agent 的推理循环、上下文获取、IDE 语义动作、发布入口、CI 触发和质量门禁被拆成可独立演进的资产。Swarm Editor 目前已经有 Pi runtime、ProjectSpec、Tool Broker、Skill trust、Review、Workspace 和 Swarm execution；下一步应继续补“能力边界”和“交付证据”，而不是引入第二个 Agent runtime。

## 2. 新增深挖一：Hermes fork 是“持续学习 + 多入口 + 多环境”参考系

### 2.1 公开结构

`JetBrains/hermes-agent` 当前公开仓库明确标记为 fork，并公开了以下结构：

- `acp_adapter/`：ACP 入口、认证、权限、事件、session、工具和 provenance。
- `gateway/`、`tui_gateway/`、`ui-tui/`：不同交互入口共享 Agent 能力。
- `providers/`、`optional-mcps/`、`skills/`、`tools/`：provider、MCP、skills 和工具作为可替换能力层。
- `agent/`、`tests/`、`tests-js/`：核心 Agent 与多层验证。
- `hermes_state_*`、`mcp-research-data/`：状态 schema、可移植状态、搜索和研究数据相关组件。

README 进一步把能力描述为：跨会话 FTS5 搜索、LLM 摘要记忆、复杂任务后的 skill 创建/改进、cron 调度、并行子代理，以及 local/Docker/SSH/Singularity/Modal/Daytona/Vercel Sandbox 等终端后端。

### 2.2 可迁移模式

Hermes 的价值不是让 Swarm Editor 改用 Python Agent，而是提示我们把“长期记忆”和“运行环境”从聊天消息中分离出来：

1. **Session history ≠ memory**：会话原文、压缩摘要、用户偏好、可复用 skill、任务结果应有不同保留策略。
2. **Terminal backend 是 capability**：local、container、remote 和 serverless 环境应该表现为受审计的执行能力，而不是散落在 prompt 里的字符串。
3. **ACP 是产品入口之一，不是 runtime 本体**：不同入口共享同一个 durable state 和 permission model。
4. **跨入口连续性需要 provenance**：从 Telegram/CLI/IDE/CI 触发的任务必须能回指来源、身份、权限和交付结果。

### 2.3 Swarm Editor 映射

| Hermes 模式 | Swarm 当前位置 | 应补的最小能力 |
| --- | --- | --- |
| 持久状态与搜索 | `SessionStore`、Pi branch reconcile、`ActivityStore` | 增加 episode/summary 索引，不把所有历史拼进 prompt |
| 多执行后端 | `SwarmTaskWorkspace`、Bubblewrap、WASM broker | 统一 `ExecutionCapability` 元数据、权限和产物来源 |
| ACP/多入口 | Pi JSONL RPC、桌面 in-process service | 保持 Pi-only；为事件建立入口/请求来源字段 |
| skill 自改善 | `SkillService`、project skill trust | 将生成/修改 skill 视为待审计变更，禁止隐式自安装 |

## 3. 新增深挖二：Junie 把 Agent 交付拆成发行、Action 和权限层

### 3.1 `junie` 与 `junie-live`

`JetBrains/junie` 的公开仓库主要是轻量发布入口：Shell/PowerShell 安装器、版本 registry、更新信息 JSONL 和 EAP/nightly/experimental 通道。它没有把完整 Agent 源码作为这个仓库的核心职责。

`JetBrains/junie-live` 的公开目录更直接地暴露了发布层边界：`install-junie-live.sh`、`install-yana.sh`、`examples/junie-agent`、`junie-live/cli/docs`，README 将其定义为 release artifacts 和 GitHub Actions 的仓库。

**结论：** Agent 产品的发行与 runtime 解耦。版本通道、安装脚本、更新 metadata 和 CI action 可以独立发布，避免把 IDE/runtime 的源码变化直接等同于用户可安装版本。

### 3.2 `junie-github-action`

公开 Action 仓库包含 `src/`、`test/`、`docs/`、`examples/`、`action.yml`、`COOKBOOK.md` 和工作流。README 暴露的能力边界包括：

- issue、PR、review comment、CI failure 等多种触发源。
- issue resolution、PR review、inline suggestions、minor fix、CI failure analysis。
- smart branch management、silent mode、single-comment mode、rich job summaries。
- attachment 下载、MCP 扩展、运行在用户自己的 GitHub runner 上。
- prompt-injection sanitization、token redaction、最小权限提示、default token 的 workflow 触发限制。

### 3.3 Swarm Editor 映射

Swarm 不应复制 GitHub Action 或引入外部 HTTP adapter，但可以吸收它的**交付合同**：

```text
Trigger → Admission → Workspace/branch policy → Execution → Evidence → Delivery
```

建议在 `SwarmService`/`SwarmStore` 上增加一份 durable `DeliveryRecord`，至少包含：

- `trigger`: 用户、会话、命令、review 或 CI 来源。
- `admission`: trust、能力、MCP 和 workspace 检查结果。
- `workspace`: project workspace、task worktree、base revision。
- `execution`: run/attempt、agent、model、工具审计。
- `result`: commit/patch/review/package/verification 状态。
- `redaction`: 已移除的 secret 或 prompt-injection 片段摘要。

这会把目前分散在 Activity、Swarm evidence、Review 和 session branch 中的交付事实连成可恢复记录。

## 4. 新增深挖三：MCP Steroid 是“IDE 语义动作层”，不是普通 MCP server

### 4.1 公开模块图

`JetBrains/mcp-steroid` 当前公开目录包括：

- `mcp-core/`、`mcp-http/`、`mcp-stdio/`：协议和传输分层。
- `mcp-steroid-server/`：服务器侧实现。
- `ij-plugin/`：IntelliJ 插件宿主。
- `execution-storage/`：执行记录/存储层。
- `agent-output-filter/`、`ai-agents/`：输出治理和 Agent 侧集成。
- `test-integration/`、`test-integration-agent-launch/`、`test-experiments/`：集成和实验验证。

README 的核心定位不是“让 Agent 读写文件”，而是通过 IDE 插件暴露 IntelliJ 的真实语义动作：typed refactoring、inspection、debugger、test run、visual awareness 和 IntelliJ API。它把 `devrig` 作为安装/注册入口，把 MCP Steroid 作为 IDE 内的执行面。

### 4.2 对 Swarm 的关键启发

Swarm 当前 `PiToolBroker`、LSP、ProjectService 和 sandbox 已经具备类似的碎片，但缺少一层统一的**语义能力目录**：

```text
Capability
  id / version / host
  input schema / output schema
  required trust
  workspace scope
  side effects
  evidence references
  cancellation / timeout
```

建议把能力分为三档：

1. `READ_ONLY`: tree、search、LSP、spec graph、Git diff。
2. `PROJECT_MUTATION`: refactor、format、test run、apply patch。
3. `SYSTEM_MUTATION`: process、network、install、external service。

每个 Pi tool、WASM capability、LSP action 和未来 IDE bridge 都必须声明档位和证据产物；而不是只返回一段 `output`。这与现有 Tool Broker audit store、Project Skill Trust 和 Swarm evidence 可以直接对接。

## 5. 新增深挖四：Context 把“语义探索”做成公开集成层

`JetBrains/context` README 明确声明：仓库不是 `jbcontext` CLI 源码，CLI 在私有仓库中开发，以预编译二进制发布；公开仓库提供 integrations、skills、subagents、hooks、MCP 配置和 `AGENTS.md`。

公开 skill 目录给出一组非常清晰的探索动作：

- `context-search`：语义代码搜索。
- `context-research`：搜索和历史探索。
- `context-install`：安装 CLI。
- `org-search`：组织范围语义搜索。
- `dependency-search`：组织范围依赖研究。
- `blast-radius`：组织范围影响/消费者分析。

同时公开了只读 `context-explorer` subagent。这个设计把**探索请求**和**执行 Agent**分开，并把 file/line 引用当作结果的一部分。

### Swarm 落地

当前 ProjectService、LSP、spec graph、repository localization 和 evidence store 应统一到一个只读 contract：

```kotlin
data class ContextEvidence(
    val id: String,
    val kind: ContextEvidenceKind,
    val source: String,
    val path: String?,
    val startLine: Int?,
    val endLine: Int?,
    val summary: String,
    val confidence: Double?,
    val queryFingerprint: String,
    val truncated: Boolean,
    val createdAt: Instant,
)
```

最先落地的四个请求类型：`SEARCH_TEXT`、`SEARCH_SYMBOL`、`SPEC_GRAPH`、`REPOSITORY_EVIDENCE`。每个请求最多一次 broad 查询和一次 path-filtered retry，避免 Agent 在上下文不足时无限搜索。

## 6. 新增深挖五：JetBrains Skills 是 capability catalog，不只是 prompt 文件夹

`JetBrains/skills` 当前公开仓库是一个经过 JetBrains 验证的 curated collection，目录同时包含技能、CI 工作流和生成/维护脚本。与 Swarm 最相关的技能类别包括：

- 代码审计：`codebase-audit`、`security-threat-model`、`error-model-validation-architect`。
- 上下文摄取：`project-context-ingestion`、`dependency-conflict-resolver`、`blast-radius` 类能力。
- 交付：`implement-feature`、`gh-address-comments`、`gh-fix-ci`、`ci-cd-containerization-advisor`。
- MCP/Agent：`mcp-builder`、`skill-creator`、`skill-installer`。
- Compose/桌面：`compose-ui-test-server`、`composition-patterns`。

### 对 Swarm 的安全要求

Skill 不能只保存 `id/name/description/path`。至少需要：

- provenance：来源仓库、版本/commit、作者或验证组织。
- admission：global/project/session scope、trust 状态、允许的 Agent。
- capability claims：只读、项目写入、系统写入、网络、secret access。
- lifecycle：发现、审核、启用、禁用、升级、回滚。
- evidence：skill 执行是否产生测试、diff、审计和 residual risk。

这与 Swarm 已有 `ProjectSkillTrustStore`、Skill scanner 和 Pi Tool Audit 的边界一致；不要把远程 skill 直接复制到 Pi 配置目录后默认启用。

## 7. 新增深挖六：Koog 提供的是状态机/可靠性参考，不是第二 runtime

当前 Koog README 将以下能力作为同一框架的核心：Kotlin Multiplatform、retry 和 state restore、history compression、LLM switching、OpenTelemetry、MCP、ACP、RAG、streaming、parallel tool calls、modular features 和 graph workflows。

对 Swarm 最有价值的是三个抽象：

1. **可恢复 agent state**：Pi session 之外，Swarm run 也应有 durable checkpoint 和 attempt boundary。
2. **LLM switching with history adaptation**：ModelService 切换模型时保存 route/failover lineage，而不是只修改当前 profile。
3. **graph workflow + observability**：把 planner、executor、verifier、reviewer 的状态迁移记录为结构化 trace。

不采纳 Koog 作为第二个执行 runtime：Swarm 的 Pi JSONL runtime、in-process Kotlin service 和当前工具审计边界已经确定；这里只吸收状态、重试、恢复和 tracing 语义。

## 8. 新增深挖七：Compose Hot Reload 是反馈环基础设施

`JetBrains/compose-hot-reload` 的公开模块拆分包括 hot-reload agent、analysis、annotations、core、devtools、Gradle plugin、IDE 集成、MCP、orchestration、runtime API/JVM 和 tests。README 明确要求 JVM target、JBR，并通过 Gradle file watching/continuous build 支持 explicit 与 auto 两种 reload 模式。

对 Swarm Editor 的结论：热重载应作为开发反馈环，不应成为生产 Pi runtime 的依赖。可以在开发脚本中增加可选的 Compose Hot Reload/JBR 检测，并把 UI reload、compile error、runtime exception 汇总为本地 `DevelopmentEvidence`，供 Agent 读取；不能把 hot reload 的运行状态混入 session 或 workspace 持久模型。

## 9. 汇总：JetBrains 的公开资产模式

从这轮新增仓库可以得到一条更具体的 JetBrains 开源产品方法：

```text
1. Agent core stays replaceable.
2. Context and skills are explicit capability surfaces.
3. IDE semantic actions live behind a host boundary.
4. Distribution and CI integrations are separate products.
5. State, permissions, evidence and delivery are durable.
6. Development feedback (JBR/hot reload) stays outside production runtime.
```

对应 Swarm Editor 的目标架构：

```text
PiRuntimeManager
  → CapabilityRegistry / PiToolBroker / LSP / WASM
  → ContextEvidence + ProjectSpecGraph + ReviewEvidence
  → Workspace + TaskWorkspace + SessionEpisode
  → SwarmRun + Verification + DeliveryRecord
  → Desktop UI / future CI adapter
```

## 10. 下一轮实现顺序

### P0：ContextEvidence 统一只读探索

- 保留现有 ProjectService/LSP/spec graph API，先加统一 DTO 和来源字段。
- 为 Pi prompt 注入使用 evidence label、path/line 引用和 truncated 标志。
- 增加 broad/retry 上限与 query fingerprint，避免重复搜索。

### P1：DeliveryRecord 与 Review/Swarm 合流

- 把 trigger、admission、workspace、attempt、verification、commit/patch、redaction 统一持久化。
- Review stale、Swarm evidence、Pi branch reconcile 都引用同一个 record id。
- 恢复任务时先读 durable record，再按需读取原始 session。

### P1：CapabilityRegistry

- 从 PiToolBroker、WASM plugin、LSP action 和 ProjectService 读取能力声明。
- 对每个能力执行 trust/scope/side-effect 检查。
- UI 展示“Agent 为什么能调用这个动作”和“动作产生了哪些证据”。

### P2：Episode/Memory

- Session 原文、压缩摘要、任务 episode、用户偏好、skill 经验分开保存。
- 先做本地 bounded search，不引入外部向量数据库。
- 所有 memory 命中必须携带 provenance 和可撤销来源。

### P2：开发反馈环

- 可选 JBR/Compose Hot Reload 检测。
- 收集编译、reload、运行时异常为 development evidence。
- 与生产 workspace/session 状态隔离。

## 11. 不应采纳的东西

- 不把 `hermes-agent` fork 当作第二个 runtime；它是跨入口、持久记忆和执行后端的参考实现。
- 不把 `jbcontext` 私有 CLI 当作 Swarm 运行时依赖；只采纳公开 integration/skill/evidence 形态。
- 不把 MCP Steroid 的 IDE API 直接复制为 HTTP 服务；Swarm 继续 in-process，未来只增加受控 capability boundary。
- 不把 Junie GitHub Action 的 token/branch 语义直接照搬到桌面；只抽取 delivery/admission/redaction 规则。
- 不把远程 Skills 当作可信 prompt；必须经过 provenance、trust、scope 和 rollback。
- 不把 Compose Hot Reload/JBR 作为生产 Agent 或 session 的必要条件。
