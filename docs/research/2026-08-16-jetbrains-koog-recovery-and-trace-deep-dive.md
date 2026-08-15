# JetBrains Koog 恢复、重试与 Trace 深挖（2026-08-16）

> 本文只依据 `JetBrains/koog` 公开源码。Koog 是设计参考，不是 Swarm 的第二 Agent runtime；Swarm 保持 Pi JSONL 子进程和 Kotlin 进程内服务边界。

## 1. 固定来源

- 组织页：<https://github.com/orgs/JetBrains/repositories>
- Koog 固定提交：`10bba89b67929bab3617047a6a7c8d8cf3ff9185`
- 状态：<https://github.com/JetBrains/koog/blob/10bba89b67929bab3617047a6a7c8d8cf3ff9185/agents/agents-core/src/commonMain/kotlin/ai/koog/agents/core/agent/AIAgentState.kt>
- 重试子图：<https://github.com/JetBrains/koog/blob/10bba89b67929bab3617047a6a7c8d8cf3ff9185/agents/agents-core/src/commonMain/kotlin/ai/koog/agents/ext/agent/SubgraphWithRetry.kt>
- Tool trace：<https://github.com/JetBrains/koog/blob/10bba89b67929bab3617047a6a7c8d8cf3ff9185/agents/agents-features/agents-features-opentelemetry/src/commonMain/kotlin/ai/koog/agents/features/opentelemetry/span/executeToolSpan.kt>
- Node trace：<https://github.com/JetBrains/koog/blob/10bba89b67929bab3617047a6a7c8d8cf3ff9185/agents/agents-features/agents-features-opentelemetry/src/commonMain/kotlin/ai/koog/agents/features/opentelemetry/span/nodeExecuteSpan.kt>

## 2. 源码结论

### 2.1 运行状态与持久恢复不同

Koog 的 `AIAgentState` 是内存生命周期状态：`NotStarted`、`Starting`、持有 root context 的 `Running`、带结果的 `Finished` 和带异常的 `Failed`。它支持复制状态对象，但这里没有承诺将运行中的 context 序列化到磁盘。因此不能把“有状态 Agent”误解为“可在进程崩溃后恢复同一 LLM/tool 调用”。

### 2.2 Retry 是回到受控边界的新执行

`subgraphWithRetry` 在首次运行保存初始输入和 fork 后的初始 context。每次条件拒绝后，它返回初始 context 与初始输入，再运行 action subgraph；可选反馈会写入下一轮 prompt。重试次数、成功标志和最后输出被显式包装为 `RetrySubgraphResult`，达到上限后可由 strict 变体失败。

关键语义：重试不是把中间工具调用“接着跑”，而是从已知边界用可记录的反馈启动新一轮动作。

### 2.3 Trace 分层且显式标识输入输出

Koog 的 node span 关联 conversation/run、node ID、event ID、可选输入与输出和错误。tool span 关联 tool 名、调用 ID、参数、结果、错误；MCP tool 还可记录 session、协议与 transport。它通过 parent span 保留层级关系，而非把全部事件平铺成日志。

## 3. 当前 Swarm 核对

Swarm 已具备：

- `SwarmTaskAttemptRecord` 的 attempt、模型选择、开始/结束、handoff、tool audit、workspace delta、verification 和错误分类。
- 每个 task attempt 的独立 workspace、Git revision/delta 和验证 evidence。
- 调度器启动时将异常遗留的 `RUNNING` task 关闭为失败 attempt（`RecoveredBeforeScheduling`），不会错误假装恢复已失去的 Pi 进程。
- `DeliveryRecord` 关联 attempt、session、tool audit 和 verification evidence。

这与 Koog 的“重试必须有明确边界”一致，但尚未形成一个独立、持久化、可查询的 checkpoint 记录。

## 4. 建议的下一阶段

仅当需要在应用重启后恢复 Swarm run 时，引入最小 checkpoint，而不是序列化 Pi 内存：

```text
SwarmAttemptCheckpoint
  runId / taskId / attempt / sequence
  phase: prepared | pi_started | pi_finished | verified | terminal
  workspaceId / baseRevision / workspace-delta evidence
  sessionId / tool-audit references
  handoff digest / checkpoint reason / createdAt
```

恢复规则：

1. 只允许从 `prepared`、`pi_finished`、`verified` 等持久证据明确的边界继续。
2. 遗留 `pi_started` 只能终止为已中断 attempt，随后按 retry policy 创建新 attempt；不可复用旧 Pi session 或假设工具调用幂等。
3. 每次重试保留原 attempt 的证据和失败原因，并把结构化 feedback 注入新 attempt 的 prompt。
4. checkpoint 只保存 ID、摘要和哈希；工具原始参数、输出和 secret 仍受审计与脱敏边界控制。

Trace 也应先保持本地、低基数：以 run/task/attempt/audit ID 串联 scheduler、Pi session、tool 和 verification 事件。没有明确的 OTLP 导出需求前，不添加网络遥测依赖或采集 prompt/tool 原文。

## 5. 不采纳

- 不引入 Koog runtime、DSL 或 MCP transport 以实现上述模型。
- 不将 `Running` Pi session 当作崩溃可恢复对象。
- 不持久化完整 prompt、tool 参数、tool 结果或 trace payload 来换取“可观测性”。
- 不在没有恢复产品需求前创建无消费者的 checkpoint 文件格式。
