# JetBrains 开源资产研究地图（截至 2026-08-16）

本索引汇总以 <https://github.com/orgs/JetBrains/repositories> 为入口的已核验资产。每项均链接到同日的源码级或架构级研究；不将未公开服务或仓库 README 之外的行为视为事实。

| 资产 | 已核验的核心边界 | Swarm 采纳状态 | 研究 |
| --- | --- | --- | --- |
| `thinkrail` | Pi 宿主、worktree、Review、spec graph 的组合边界 | 作为 Swarm 任务/证据设计参考 | `2026-08-13/14` deep dive |
| `context` | 只读探索、引用、上下文不可信性 | 已采纳 `ContextEvidence` 与首条 prompt 格式化 | `2026-08-15` incremental/delivery |
| `junie` / `junie-github-action` | 发行入口、trigger/admission/workspace/delivery 链 | 已采纳 `DeliveryRecord` 与 Swarm/Review 关联 | `2026-08-15` incremental/delivery |
| `mcp-steroid` | IDE host capability、execution storage、output filter | 采纳 capability/evidence 边界；不引入 HTTP 内部总线 | `2026-08-15` incremental/delivery |
| `teamcity-mcp` | safe/brave、分支感知、身份传播、会话实例安全 | 仅作为未来 CI adapter 约束；未引入 CI transport | `2026-08-16` quality/CI |
| `qodana-cli` | effective config、baseline、报告与质量门禁分离 | 本地验证 evidence 已覆盖命令/策略；外部质量 adapter 待真实需求 | `2026-08-16` quality/CI |
| `koog` | 生命周期、受控 retry、层级 trace | 采纳新 attempt 重试语义；不引入第二 runtime | `2026-08-16` Koog |
| `skills` | 上游来源、变更扫描、行为扫描/SARIF、免责声明 | 已增加 Skill 内容 SHA-256；远程 catalog 不默认信任 | `2026-08-16` skills |
| `compose-hot-reload` | orchestration state、reload lifecycle、UI error state | 仅规划可选开发 evidence；不进入生产 Agent runtime | `2026-08-16` hot reload |
| `intellij-community` | action availability/execution 分离、BGT/EDT、文档提交 gate | 约束未来 IDE bridge；不引入 IntelliJ SDK | `2026-08-16` IDE action |
| `hermes-agent` | 多入口、长期学习、环境抽象 | 仅作为演化/记忆参考 | `2026-08-15` incremental |

## 已落地提交

- `aaf1319` / `b6be763`：统一并注入 `ContextEvidence`。
- `d5e38a0` / `189ca90` / `b3d5fa4`：Delivery envelope 与 Swarm/Review 同步。
- `0c0fe61` / `a2b83cf`：能力目录和 Pi tool 准入。
- `c88dfaa` / `9cdfd1e`：验证过的 WASM plugin capability 与逐插件执行准入。
- `212da55`：发现到的 Skill 内容版本指纹。

## 一致性约束

1. Pi JSONL runtime 和 Kotlin 进程内服务是唯一正常应用通信路径。
2. 外部 Agent、CI、IDE 或扫描器输出均是有来源、有大小上限的不可信 evidence，不能直接成为 prompt 指令。
3. 任何写入/进程/网络副作用都经 capability admission、工具审计和 Delivery evidence；安全模式必须由宿主执行器实现。
4. 研究结论不等于依赖引入。只有真实产品需求、所有权边界和测试策略明确时才添加 runtime、SDK 或远程 adapter。

## 待研究方向

- `teamcity-cli` 的只读 build/log API 与分页/错误模型，作为未来 CI read-only adapter 的证据。
- `qodana-cli` SARIF/report artifact 的截断与脱敏接口，作为质量 evidence 的输入约束。
- `intellij-community` 的 inspection/refactoring invocation 与写前 revision guard，作为 IDE bridge 的实现前提。

相关专项文档位于本目录下的 `2026-08-13` 至 `2026-08-16` JetBrains deep-dive 文件。
