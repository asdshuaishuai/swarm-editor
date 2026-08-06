# Swarm Editor

基于内置 `pi-0.83.0` 的 Kotlin/JVM Compose Desktop Agent 工作台。

## Architecture

- `desktopApp` 通过进程内 Kotlin service 与后端交互，不使用 HTTP/WebSocket。
- `backend` 管理 Agent Profile、会话、Skills、项目与 Git 数据。
- `PiRuntimeManager` 为每个 Swarm 会话按需启动 pi RPC/JSONL 子进程。
- Pi 与 Kotlin 之间使用 nonce 绑定、限长、可取消且要求审计 ID 的 stdio 工具代理协议；Linux 使用 Bubblewrap 在无镜像、无守护进程的禁网沙箱中运行原生命令，可移植能力插件由独立 Wasmtime 沙箱执行。
- 仓库定位会构建源码依赖图并使用 Tarjan SCC 折叠循环依赖簇；定位证据与关键路径调度分别持久化，避免把 SCC 误当作任务 DAG 执行器。
- 主 Agent 是系统默认协调者，只配置主模型；它按任务角色、重试、写入/验证范围、任务图位置与仓库 SCC 风险动态创建子 Agent，再从独立模型池租用最匹配且有容量的模型，并把需求评分、选择原因与实际 provider/model 写入任务尝试证据。
- Pi 规划与执行使用有预算的图上下文协议：任务只接收匹配其所有权的仓库证据、持久化调度依据、修订契约和截断后的上游交付；返回结果会解析并持久化为 Outcome/Evidence/Changes/Verification/Residual Risk/Downstream Handoff 六段交付对象，原始输出仍保留用于审计。
- Kotlin 源码智能可按需安装 JetBrains Kotlin LSP `262.9593.0`；安装器验证官方归档 SHA-256，安全提取并固定使用 JSON-RPC stdio，设置中心显示运行时完整性与真实连接状态。
- 在 JetBrains Runtime 可用时，桌面端优先使用 JBR 原生目录选择；代码区域优先使用 JetBrains Mono，普通 JVM 会安全回退。
- Pi-only 沙箱、动态图调度、LSP 代码智能与可验证自进化的 GitHub/arXiv 深度研究见 `docs/research/2026-07-28-pi-agent-runtime-orchestration-deep-dive.md`。
- Pi 图上下文与提示协议见 `docs/architecture/pi-graph-context-protocol.md`。
- 轻量跨平台沙箱、Sandlock 准入门槛、独立 Git worktree 与可重放验证证据链见 `docs/research/2026-07-28-lightweight-sandbox-verification-deep-dive.md`。
- 完成的兵团运行会由 Pi 反思器提炼为可追溯经验，并在后续规划和任务执行时按目标与角色检索复用；设计依据见 `docs/research/2026-07-27-pi-swarm-self-evolution.md`。
- 经验注入经过效用感知门控：重复负效用或同环境跨任务回归会触发 abstain；选择、拒绝、评分与查询指纹会写入运行轨迹。
- 运行轨迹会生成确定性的反事实挑战队列，优先验证受控回归、观测伤害、重复失败与尚未验证的收益。
- 高优先级挑战可进一步固定为同一 Git 快照上的 LOO 评估用例规格，记录来源运行/任务、Agent Profile、控制与处理经验集合、验证命令和缺失溯源阻塞项；在隔离 Pi 工具代理完成前不会伪造 control/treatment 补丁。
- 经验只有通过匹配环境的对照/处理评估后才能生成禁用的候选 Pi Skill；候选不会自动同步或激活。
- Linux 上会自动探测 Bubblewrap，在禁网、只读根文件系统的轻量沙箱中对同一 Git commit 的 control/treatment 补丁执行反事实验证。
- `agents.json` 只保存主模型 ID；主 Agent 身份与策略由系统提供，子 Agent 按职责和模型能力即时生成且不持久化。Provider、thinking、凭据、职责标签和模型并发容量由独立模型池管理。
- pi 配置、Skills 和会话隔离在 `~/.swarm-editor/`。
- Pi `0.83.0` 的标准化与 provider 原始停止原因会进入 Agent 活动证据；模型目录固定在仓库内并离线构建，能力审计见 `docs/research/2026-08-02-pi-0.83-core-capabilities.md`。
- 对话运行期间可直接向 Pi 发送实时引导，或把后续任务排入本轮完成后的队列；两类消息均沿用活动会话、图片附件、持久化与审计链路。
- Pi 检查面板读取当前模型真实支持的 thinking levels，并可控制自动压缩、自动重试、重试取消以及 steer/follow-up 的逐条或批量处理策略。

## User-Level Discovery

- Skills are discovered automatically from `~/.swarm-editor/skills`, `~/.agents/skills`, `~/.pi/agent/skills`, `~/.claude/skills`, `~/.codex/skills`, and `~/.gemini/skills`.
- MCP servers are imported from common Claude, Codex, Gemini, Antigravity, Cursor, and Windsurf user configuration files.
- Duplicate MCP connections are collapsed, manual Swarm entries take precedence, and per-Agent authorization survives rescans.
- pi is started with ambient Skill discovery disabled; only Skills enabled for the active Agent Profile are passed to the runtime.

## Requirements

- JDK 21
- Node.js 22.19+
- npm
- Gradle 9.3.0（使用仓库内 `./gradlew`）

## Commands

```bash
./gradlew :backend:preparePiRuntime  # 安装锁定依赖并构建 vendored pi
./gradlew :desktopApp:run            # 启动桌面应用
./gradlew test                       # Kotlin 测试
./gradlew build                      # 完整构建
./gradlew :desktopApp:installStagedPiRuntime # 生成含生产依赖的打包 runtime
```

桌面安装包任务：`:desktopApp:packageDmg`、`:desktopApp:packageMsi`、`:desktopApp:packageDeb`。

### Fast Local Loop

`scripts/fast-build.sh` 默认只编译桌面端 Kotlin，复用 Gradle daemon、并行执行、构建缓存、文件监听与配置缓存，不会无条件重建 vendored pi：

```bash
./scripts/fast-build.sh                  # 快速编译
./scripts/fast-build.sh compile --watch  # 持续监听源码变化
./scripts/fast-build.sh run              # 增量准备 pi runtime 并启动
./scripts/fast-build.sh verify           # 运行测试与完整构建
./scripts/fast-build.sh pi               # 仅准备 pi runtime
```

平台开发启动脚本提供一致的 `run`、`compile`、`test`、`build` 和 `pi` 模式，并在启动前检查 JDK 与 Node.js 版本：

```bash
./scripts/dev-linux.sh run
./scripts/dev-linux.sh test -- --stacktrace
```

```powershell
.\scripts\dev-windows.ps1 run
.\scripts\dev-windows.ps1 test -- --stacktrace
```

### Project Website

GitHub Pages 静态站位于 `site/`。本地预览使用 `python3 -m http.server 4173 --directory site`，然后访问 `http://127.0.0.1:4173`。`.github/workflows/pages.yml` 会在 `main`、`master` 或 `old_ui` 分支的站点文件变更后部署；首次使用时需要在 GitHub 仓库的 **Settings → Pages** 中将 Source 设为 **GitHub Actions**。

## Isolated Counterfactual Evaluation

Linux 上的反事实评估直接使用 Bubblewrap，不需要镜像或容器守护进程：

```bash
export SWARM_EVAL_SANDBOX=bubblewrap
# 可选：export SWARM_EVAL_BWRAP=/usr/bin/bwrap
```

评估沙箱取消网络与全部可分离 namespace，共享系统根目录只读，仅将单个评估 worktree 以原路径挂载为可写，并使用临时 HOME。环境变量按 `PATH`、`JAVA_HOME` 和 locale 白名单重建，不会继承模型密钥。`SWARM_EVAL_SANDBOX=wasm` 不接受任意 Gradle/npm/Git 命令；WASM 只承载预编译、哈希固定的能力模块。

未提交文件通过临时 Git index 捕获为确定性的 `commit-tree` 快照，既不修改用户暂存区，也不依赖 HTTP/WS。快照以 `refs/swarm-editor/evaluation-snapshots/<commit>` 固定，随后可直接作为 control/treatment 的共同 `repositoryRevision`。

## Isolated Pi Tools

Pi 工具沙箱默认关闭。Linux 上推荐使用 Bubblewrap；只需显式授权 Agent Profile，不需要镜像：

```bash
export SWARM_PI_TOOL_BROKER_AGENTS=reviewer,coder
# 可选：export SWARM_PI_TOOL_SANDBOX=bubblewrap
# 可选：export SWARM_BWRAP_EXECUTABLE=/usr/bin/bwrap
# 可选：export SWARM_PI_NODE=/absolute/path/to/node
```

Bubblewrap 运行时关闭网络、隐藏用户主目录，只读挂载系统运行目录，并仅将当前工作区挂载到 `/workspace`。Agent Profile 的 provider 密钥与自定义环境变量不会进入沙箱。逐请求审计写入 `~/.swarm-editor/pi-tool-audit/`，只包含哈希、时序、结果类别和退出元数据，不保存命令、文件内容或工具输出。

检测到可用的 systemd user session 时，Bubblewrap worker 会自动进入轻量 scope，并限制为 2GB 内存、256 个进程和 200% CPU。可通过 `SWARM_BWRAP_SYSTEMD_SCOPE=required` 强制要求资源 scope，或设为 `off` 禁用自动接入。

WASM 通道固定使用 Wasmtime `47.0.2`。插件中心可以安装或修复受管运行时，并显示运行时来源、版本、完整哈希、插件清单错误与测试输出；运行时安装包按官方 SHA-256 校验，安装后的二进制与 `runtime.json` 再次绑定。插件通过模块 SHA-256、执行时限、输入输出上限以及无继承环境、无文件系统预打开的 JSON stdin/stdout 协议运行。插件清单和安全模型见 `docs/architecture/wasm-plugins.md`。

WASM 不会代替 Gradle、npm、Git 或其他原生命令；这些操作继续由 Bubblewrap 通道处理。未启用 Bubblewrap 的 Agent 仍可使用经过审计的 WASM 工具，同时保留 Pi 本地核心工具。OCI/Podman 不属于当前执行或评估架构。

## Managed Kotlin LSP

设置中心的“代码智能”页可以按需安装或修复 JetBrains Kotlin LSP `262.9593.0`。官方独立包约 390MB，因此不会捆绑进桌面安装包。运行时位于 `~/.swarm-editor/runtimes/kotlin-lsp/`，索引缓存与版本、平台隔离；安装器固定六个平台归档的 SHA-256，限制下载和解压规模，拒绝路径穿越，并将归档内安全相对链接实体化后再原子发布。

受管启动命令强制使用 `--stdio`，不会启用 Kotlin LSP 默认的 `127.0.0.1:9999` socket。仍可通过 `SWARM_LSP_KOTLIN` 或 `-Dswarm.lsp.kotlin=...` 显式覆盖，也会回退探测 `PATH` 中的 `kotlin-lsp` 和 `kotlin-language-server`。文件视图仅在真实 JSON-RPC 初始化与 semantic tokens 请求成功后显示服务器名称，否则继续使用 JVM 语法高亮。

维护者可以使用已下载的官方归档执行真实连接烟测：

```bash
SWARM_KOTLIN_LSP_TEST_ARCHIVE=/path/to/kotlin-server-262.9593.0.tar.gz \
  ./gradlew :backend:test --tests 'com.swarmeditor.backend.lsp.KotlinLspOfficialSmokeTest'
```
