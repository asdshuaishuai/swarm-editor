# JetBrains Compose Hot Reload 开发反馈环深挖（2026-08-16）

## 固定来源

- 组织页：<https://github.com/orgs/JetBrains/repositories>
- `JetBrains/compose-hot-reload`：`21a31c04c94676795170243b795476b0481e22c5`
- 状态存储：<https://github.com/JetBrains/compose-hot-reload/blob/21a31c04c94676795170243b795476b0481e22c5/hot-reload-orchestration/src/main/kotlin/org/jetbrains/compose/reload/orchestration/OrchestrationStateStorage.kt>
- server/client states：<https://github.com/JetBrains/compose-hot-reload/blob/21a31c04c94676795170243b795476b0481e22c5/hot-reload-orchestration/src/main/kotlin/org/jetbrains/compose/reload/orchestration/OrchestrationStates.kt>
- reload UI state：<https://github.com/JetBrains/compose-hot-reload/blob/21a31c04c94676795170243b795476b0481e22c5/hot-reload-devtools/src/main/kotlin/org/jetbrains/compose/devtools/states/ReloadUIState.kt>
- error UI state：<https://github.com/JetBrains/compose-hot-reload/blob/21a31c04c94676795170243b795476b0481e22c5/hot-reload-devtools/src/main/kotlin/org/jetbrains/compose/devtools/states/ErrorUIState.kt>

## 源码结论

Compose Hot Reload 将 orchestration 控制状态和 DevTools 呈现状态分开。`OrchestrationStateStorage` 同时维护编码状态与解码状态，在锁内更新；客户端更新使用预期的旧 binary 值，避免并发客户端静默覆盖。解码失败只记录失败并回退默认状态。

DevTools 将 reload 生命周期明确为 `Ok`、`Reloading` 与 `Failed(reason, details, time)`，并将 UI 异常建模为每个 window 独立的 title、message 和 stacktrace。也就是说，编译/重载控制协议不是把原始日志直接展示或复用为下游指令。

## 对 Swarm 的映射

Swarm 当前有 LSP diagnostics、Spec diagnostics 和 `ActivityStore`，没有开发期 `DevelopmentEvidence`。这不是生产缺陷：热重载是本地开发反馈设施，不应作为 Pi runtime、Swarm attempt 或 DeliveryRecord 的必需状态。

若未来需要让 Agent 利用开发反馈，只增加一个可选、本地、只读的 evidence producer：

```text
DevelopmentEvidence
  source: gradle | hot_reload | ui_runtime
  phase: compiling | reloading | failed | ready
  occurredAt / project fingerprint
  bounded reason / bounded detail digest
  optional path and line
  truncated / redacted
```

规则：

1. 只采集开发工具已结构化给出的状态，不解析无限 stderr 为 prompt。
2. 状态转换必须带 sequence 或 compare-and-set 语义，避免旧失败覆盖新成功。
3. 原始 stacktrace 和构建输出受大小限制与脱敏；Agent 接收的是标注为不可信的 evidence。
4. 不建立与 Compose Hot Reload orchestration 的生产网络耦合，也不把 JBR/hot reload 设为 Swarm 运行前提。

当前无需实现该模型：Swarm 不启动 hot reload 服务，也没有产品需求要求跨进程采集开发反馈。先保持 LSP diagnostics 和验证 evidence 的既有边界。
