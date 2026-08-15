# JetBrains 交付链与 Agent Bridge 深挖（2026-08-15）

> 本轮继续从 JetBrains 官方组织仓库页和公开仓库 README/目录提取可验证的边界。研究重点从“有哪些 Agent/Context 仓库”推进到“一个 Agent 任务如何被触发、准入、执行、过滤、验证和交付”。不把公开仓库的 fork、预编译私有 CLI 或外部服务实现推断成 JetBrains 内部事实。

## 1. 当前组织页新增信号

2026-08-15 的 JetBrains 官方组织仓库页显示 852 个公开仓库。当前列表前段同时出现 `qodana-kotlin-cli`、`junie`、`JetBrainsRuntime`、`intellij-community`、`teamcity-cli` 和 `teamcity-mcp`，这说明公开资产不只是 Agent runtime，而是覆盖 IDE host、质量门禁、CI 控制面和 Agent 入口的交付链。

这条链可抽象为：

```text
触发 / 身份 / 准入
  Junie GitHub Action · Context skills · TeamCity CLI
        ↓
上下文 / IDE 语义能力
  Context search/research · MCP Steroid · LSP/IDE bridge
        ↓
Agent 执行 / 输出治理
  Junie CLI · MCP tools · output filter · redaction
        ↓
验证 / 交付 / 反馈
  Qodana · TeamCity builds/logs · branch/commit/PR · review feedback
```

对 Swarm Editor 的直接启示是：`SwarmRun`、Pi session、Review package 和验证证据不能永远作为互相独立的记录；它们需要一个只保存引用和治理元数据的 delivery envelope。

## 2. Junie GitHub Action：交付不是一次 CLI 调用

公开 README 把 Action 的流程拆成明确阶段：trigger detection、permission/human validation、branch management、task preparation、attachment processing、MCP setup、Junie execution 和结果处理。它还把 `silent_mode` 作为只准备数据和输出、不评论/建分支/提交的只读模式。

### 可迁移模式

1. **Trigger 是持久字段**：mention、label、assignment、PR review、CI failure、scheduled/workflow 不是 prompt 字符串的注释，而是可审计来源。
2. **Admission 先于执行**：actor 权限、是否 bot、token scope、是否允许写分支/PR 都要在 Agent 启动前判定。
3. **Branch/workspace 是交付上下文**：base branch、working branch、work directory 和产物 branch 需要绑定同一任务记录。
4. **输入清洗和输出清洗是两道边界**：README 明确提到隐藏 HTML comment、不可见字符、alt text、link title 和混淆实体的 prompt injection 清洗，以及 GitHub token 和 trigger phrase redaction。
5. **MCP 不是隐式全开**：checks server、inline comment server 等能力按场景启用，权限表区分 read-only 和 write 模式。

### Swarm 映射

当前 Swarm 已经分别拥有 task attempt、tool audit、workspace delta、sandbox preflight、verification、artifact integration 和 Review comment，但缺少一个可以回答“这次交付由谁/什么触发、经过哪次准入、在哪个 workspace、用了哪些 attempt、产生了什么交付结果”的 envelope。

## 3. MCP Steroid：IDE bridge 的价值在 host boundary

`mcp-steroid` 的公开目录同时包含 `mcp-core`、`mcp-http`、`mcp-stdio`、`mcp-steroid-server`、`ij-plugin`、`execution-storage`、`agent-output-filter` 和 `ai-agents`。README 进一步说明 devrig 将 Agent 接到运行中的 IntelliJ IDE，暴露 PSI、inspection、typed refactoring、debugger、test run、视觉理解和 Kotlin scripting 等 IDE 语义动作。

这里真正值得吸收的不是复制 HTTP 服务，而是三个边界：

- **Host boundary**：IDE 语义动作由 host 提供，Agent 只拿到 capability，不直接持有 IDE 内部对象。
- **Execution storage**：动作执行和运行结果有独立的存储/生命周期，不把所有输出塞进聊天历史。
- **Output filter**：Agent 输出在离开执行边界前经过过滤，避免工具结果、token 或内部控制文本直接成为后续 prompt/反馈。

Swarm 仍保持 Pi in-process + JSONL RPC，不引入正常应用通信的 HTTP/WebSocket；但应为 PiToolBroker、LSP、WASM 和未来 IDE bridge 使用统一 capability/admission/evidence contract。

## 4. Context：探索能力被组织成可复用、只读、带引用的入口

公开 `context` 仓库把 `context-search`、`context-research`、`org-search`、`dependency-search` 和 `blast-radius` 作为独立 skills，并提供只读的 context explorer subagents，返回 `file:line` 引用和代码片段。

对 Swarm 的要求：

- 查询必须有 fingerprint、路径范围、结果上限和 retry budget。
- 结果必须携带 source、path、line、confidence、truncated 和 untrusted-data 标签。
- Explorer 可以并行或分层运行，但返回的是证据集合，不是第二个 Agent runtime。
- 当前新增的 `ContextEvidence` 已覆盖 ProjectService text search、LSP workspace symbol 和 ProjectSpecGraph，并在首条 Pi prompt 中安全格式化。

## 5. TeamCity CLI/MCP：CI 是 capability，不是 Swarm runtime

`teamcity-cli` 的公开定位是从终端或 AI 读取/操作 builds、logs、agents、agent terminals 和 queues，并将 agent-skills 作为公开主题。`teamcity-mcp` 则把 TeamCity server 暴露为 MCP server，区分 safe（只读和精选写入）与 brave（完整读写、DELETE 和任意 POST）模式，并支持 bearer token、pipeline、build log 和 REST API 能力。

Swarm 可以吸收：

- CI trigger、build、log、queue 和 agent terminal 都是带 scope 的 `Capability`。
- safe/brave 是 capability policy，而不是 prompt 中的自然语言约定。
- CI 结果必须回写到同一个 delivery record，和 workspace delta、verification、review feedback 关联。

不吸收：

- 不把 TeamCity HTTP/MCP 当作 Swarm Editor 的正常内部通信。
- 不默认启用 destructive CI action。
- 不把远程 CI 输出当作可信指令；它只能作为带来源和截断标志的外部证据。

## 6. Qodana 与 Koog：质量门禁和可靠性是外围层

`qodana-kotlin-cli` 代表质量/静态分析入口，适合作为 verification capability 和 evidence source，而不是 Pi session 的一部分。Koog README 公开强调 retry/state restore、history adaptation、LLM switching、OpenTelemetry、MCP/ACP 等能力；Swarm 只吸收 checkpoint、failover lineage 和 tracing 语义，不引入第二 Agent runtime。

## 7. Swarm 下一步：DeliveryRecord

建议新增的最小 envelope：

```text
DeliveryRecord
  id / schemaVersion / status / projectPath
  trigger(kind, sourceId, actor, promptFingerprint)
  admission(allowed, policyId, policyVersion, reason)
  workspace(workspaceId, worktreeId, baseRevision, path)
  attempts(taskAttemptIds, sessionIds, toolAuditIds)
  evidence(contextIds, workspaceDeltaId, sandboxPreflightId, verificationIds)
  review(reviewPackageId, commentIds)
  artifact(commitHash, patchSha256, artifactRevision)
  redaction(redactionPolicyVersion, redactedOutputIds)
  residualRisk / createdAt / updatedAt
```

它不替代已有 `SwarmTaskAttemptRecord`、`SwarmVerificationEvidence` 或 `ReviewPackage`，而是用稳定 ID 将它们关联起来。恢复、Review stale、CI feedback 和未来外部 adapter 都先读取 envelope，再按需读取原始记录。

## 8. 明确不采纳

- 不引入 Hermes/Koog 第二 Agent runtime。
- 不复制 MCP Steroid 的 HTTP 服务作为桌面内部总线。
- 不默认允许远程 skill、CI brave mode 或任意 IDE scripting。
- 不把未过滤的 Agent/CI/IDE 输出直接注入 prompt。
- 不把 JBR/Compose Hot Reload 变成生产 Agent/session 必需依赖。

## 官方来源

- `https://github.com/orgs/JetBrains/repositories`
- `https://github.com/JetBrains/junie-github-action`
- `https://github.com/JetBrains/mcp-steroid`
- `https://github.com/JetBrains/context`
- `https://github.com/JetBrains/teamcity-cli`
- `https://github.com/JetBrains/teamcity-mcp`
- `https://github.com/JetBrains/qodana-kotlin-cli`
- `https://github.com/JetBrains/koog`
