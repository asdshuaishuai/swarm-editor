# JetBrains 质量门禁与 CI Capability 深挖（2026-08-16）

> 本文只记录可从 JetBrains 公开仓库源码验证的行为。它补充此前对 Junie、Context、MCP Steroid、Koog 和 TeamCity MCP 的产品级调研；不将公开仓库推断为 JetBrains 未公开服务的实现细节。

## 1. 范围与固定来源

本轮先从组织仓库列表中选择两个与 Swarm 交付链直接相关、且此前未做源码级验证的仓库：

| 仓库 | 固定提交 | 本轮查看的公开源码 |
| --- | --- | --- |
| `JetBrains/qodana-cli` | `13c7d0cd74407f9b5475c81cc99b205f32179335` | `internal/platform/effectiveconfig/config.go`、`internal/platform/baseline.go` |
| `JetBrains/teamcity-mcp` | `9d8a0050494b14d490f117533f99f943aa7d8f6d` | `McpToolExecutionContext.kt`、`McpSessionManager.kt`、`RestPostTool.kt`、`RestPostBraveTool.kt` 及公开测试树 |

组织页：<https://github.com/orgs/JetBrains/repositories>

## 2. Qodana CLI：验证前先冻结有效配置

### 2.1 源码证据

`CreateEffectiveConfigFiles` 不直接相信局部配置：它要求全局配置目录和全局配置 ID 成对存在，调用独立的 `config-loader-cli` 生成 `effective.qodana.yaml`、局部 `qodana.yaml` 和 `qodana-config.json`。缺少应成对出现的文件会失败。

生成后，`verifyEffectiveQodanaYamlIdeAndLinterMatchLocal` 还会校验由 imports 引入的有效配置没有暗中改变根 `qodana.yaml` 声明的 `ide` 或 `linter`。这使“本次分析究竟按什么规则运行”成为可检查的构建产物，而不是日志中的隐含条件。

`computeBaselinePrintResults` 则以 SARIF 输出为输入，附带显式阈值、可选 baseline 和 `include absent` 语义运行 `baseline-cli`。它区分参数错误和实际质量门禁结果，避免将旧问题、规则变化和当前回归混为同一种失败。

固定源码链接：

- <https://github.com/JetBrains/qodana-cli/blob/13c7d0cd74407f9b5475c81cc99b205f32179335/internal/platform/effectiveconfig/config.go>
- <https://github.com/JetBrains/qodana-cli/blob/13c7d0cd74407f9b5475c81cc99b205f32179335/internal/platform/baseline.go>

### 2.2 对 Swarm 的结论

Swarm 当前的 `SwarmVerificationEvidence` 已保存 `policyId`、`policyVersion`、`commandSha256`、sandbox preflight、环境指纹、输出摘要哈希，并由 `DeliveryRecord.verificationEvidenceIds` 关联。这已经满足“运行验证时冻结策略和命令集”的最低要求，不能为模仿 Qodana 而重复创建平行记录。

未来增加 Qodana 或任意外部静态分析器时，缺少的是一个专用的 **外部质量适配器**，而非新的 Agent runtime：

```text
Verified quality adapter
  effective configuration digest + source references
  analyzer version + invocation arguments digest
  report/SARIF artifact digest
  baseline digest + comparison mode
  threshold outcome + residual findings summary
  -> SwarmVerificationEvidence / DeliveryRecord evidence reference
```

适配器必须将配置、baseline、报告当作不可信外部文件并限制读取大小；不得让报告文本直接成为 Agent 指令。

## 3. TeamCity MCP：同名动作由安全模式决定语义

### 3.1 源码证据

TeamCity MCP 的安全和 Brave POST 工具都暴露 `teamcity_rest_post`。配置器选择其中一个实现，因此 Agent 看到相同工具名，但宿主保留不同的实际行为：

- 安全实现默认只允许 build queue 路径，将请求体的 `personal` 强制为 `true`，并在缺失时注入 MCP 触发说明。
- Brave 实现可由配置放宽到全部 REST POST 路径，保留请求体原样；它显式警告这种构建是团队可见的真实构建。
- 两个实现都要求 JSON object、检查路径、建议显式 `branchName`，并把默认分支回退作为响应注记而不是静默副作用。

`McpToolExecutionContext` 将用户、Spring SecurityContext 和请求属性跨协程传播后再恢复线程上下文。`McpSessionManager.removeSession(session)` 采用键和值实例匹配删除，防止旧连接关闭时误删同 ID 的新会话。公开树还包含受限 token、删除 pipeline、协议错误、生命周期、压力和多个 Agent 的端到端测试。

固定源码链接：

- <https://github.com/JetBrains/teamcity-mcp/blob/9d8a0050494b14d490f117533f99f943aa7d8f6d/src/main/kotlin/jetbrains/buildServer/ai/mcp/tools/rest/RestPostTool.kt>
- <https://github.com/JetBrains/teamcity-mcp/blob/9d8a0050494b14d490f117533f99f943aa7d8f6d/src/main/kotlin/jetbrains/buildServer/ai/mcp/tools/rest/RestPostBraveTool.kt>
- <https://github.com/JetBrains/teamcity-mcp/blob/9d8a0050494b14d490f117533f99f943aa7d8f6d/src/main/kotlin/jetbrains/buildServer/ai/mcp/tools/rest/impl/McpToolExecutionContext.kt>
- <https://github.com/JetBrains/teamcity-mcp/blob/9d8a0050494b14d490f117533f99f943aa7d8f6d/src/main/kotlin/jetbrains/buildServer/ai/mcp/McpSessionManager.kt>

### 3.2 对 Swarm 的结论

`CapabilityRegistry` 的 permission 集合适合作为底线，但未来 CI capability 还必须声明操作模式和副作用收敛规则。安全模式不是提示词，而是宿主执行器对输入做的确定性变换和路径约束。

在 Swarm 中，任何未来 CI 集成都应是独立 adapter，并满足：

1. 默认只读或隔离执行；写入/队列/删除动作必须使用不同 capability 或显式提升模式。
2. 构建触发必须记录目标分支、actor/admission、请求摘要和返回的远端标识到 `DeliveryRecord`。
3. 外部 token、CI 日志和返回体经过大小限制与脱敏后才可作为 evidence；它们不能绕过 `ContextEvidence` 的不可信数据边界。
4. 会话清理需要比较会话实例，而不只依赖可复用 ID。

当前 Swarm 不应提前添加 TeamCity HTTP/MCP 传输或 Brave 按钮：项目的既定边界是桌面 UI 到 Kotlin 服务的进程内调用。只有真实引入 CI adapter 的产品需求出现时，才实现该模型并按受限凭据、真实副作用和重连竞态补齐测试。

## 4. 与当前实现的核对

| JetBrains 模式 | 当前 Swarm 证据 | 结论 |
| --- | --- | --- |
| 有效验证配置/命令不可隐式变化 | `SwarmVerificationEvidence.commandSha256`、policy/version、environment fingerprint | 已覆盖本地命令验证；外部分析器尚未引入 |
| baseline 和当前回归分离 | 无外部 SARIF/质量 adapter | 等具体质量工具需求，不能伪造 baseline |
| safe/brave 由宿主执行而非 prompt 决定 | `CapabilityRegistry`、`AuditedPiToolBroker`、插件级 WASM capability | 本地工具已开始按 capability 准入；无 CI adapter 时不扩大权限面 |
| 会话实例安全移除 | Pi runtime/session 生命周期已有独立管理 | 引入远程 transport 时重新逐项验证，不假设可直接复用 |
| 多层测试矩阵 | Kotlin 单元测试覆盖 Store、Broker、Verifier、Service | 外部 CI 连接尚无功能，故没有虚假的 e2e 测试 |

## 5. 后续优先级

1. 继续研究公开 `koog` 的 checkpoint/retry 与 trace 数据模型，核对 Swarm run 是否缺失可恢复 attempt boundary。
2. 当产品需要真实质量门禁时，先设计只读 Qodana/SARIF adapter，产出有 hash 的 evidence，再考虑 Agent 可调用能力。
3. 当产品需要 CI 交互时，先引入只读 build/log capability，再单独评审隔离触发和 Brave 写操作；不引入常规 HTTP/WebSocket 内部总线。
