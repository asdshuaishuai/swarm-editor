# Swarm Editor MVP 修订实现计划

## TL;DR

> **核心目标**：将当前"双进程 HTTP 骨架"迁移为 spec 定义的"单进程嵌入式架构"，同时用官方 ACP SDK 替换手写 JSON-RPC 实现，补齐 MCP/Skills 同步和流式消息输出。
>
> **Deliverables**:
> - 单进程嵌入式架构（desktopApp 直接依赖 backend 模块）
> - 官方 ACP SDK 集成（替换 AcpConnection.kt）
> - MCP/Skills 配置同步到 Agent 原生配置
> - 流式消息输出（ACP 通知驱动）
> - 项目级 Skills 支持
> - 后端测试覆盖
>
> **Estimated Effort**: Large（4 Phase，约 15-20 个 Task）
> **Parallel Execution**: YES - 4 Waves
> **Critical Path**: T1(ACP SDK 调研) → T2(嵌入式迁移) → T5(同步逻辑) → T11(流式输出) → T14(集成验证)

---

## Context

### 原始请求
基于 Spec vs 实现对比分析，修订 MVP 实现计划以弥合 8 项重大偏差。

### 用户决策（已确认）
1. **使用官方 ACP SDK** — 废弃手写 JSON-RPC，迁移到 `com.agentclientprotocol:acp:0.13.1`
2. **先迁移架构，再填充业务逻辑** — Phase 1 完成嵌入式迁移后，再在正确架构上堆功能
3. **UI 重构暂缓** — 用户正在设计新 UI，所有视觉组件改动冻结。但 ViewModel 层需要修改（从 HTTP ApiClient 改为直接调用 Service）

### Metis 审查发现
- ViewModel 不算 UI，需要修改（数据流改造）
- Ktor Server 保留但改为可选启动（便于调试/未来扩展），非默认路径
- ACP SDK 不是简单 drop-in replacement，需先调研 API
- 全局 Service 实例（Main.kt 中的 `val`）需要评估线程安全性
- bidirectional config sync 有数据源一致性风险

---

## Work Objectives

### Core Objective
将代码库从"双进程 HTTP REST 骨架"改造为 spec 定义的"单进程嵌入式直接调用架构"，补齐核心业务逻辑（同步、流式、测试）。

### Concrete Deliverables
- `desktopApp/build.gradle.kts` 添加 `implementation(projects.backend)`
- 新的 ACP SDK 封装层（替换 `AcpConnection.kt` + `AcpConnectionManager.kt`）
- `McpService` / `SkillService` 增加 Agent 同步触发逻辑
- `AgentService` 增加 bidirectional config sync
- `SessionService` 支持流式消息（Flow/Channel）
- ViewModel 层从 ApiClient 迁移到直接 Service 调用
- 后端单元测试和集成测试

### Definition of Done
- `./gradlew :desktopApp:run` 不依赖 `localhost:8080` 即可运行
- `./gradlew :backend:test` 所有测试通过
- MCP/Skills 修改后 Agent 原生配置文件同步更新
- 消息发送后有流式输出（非阻塞等待完整响应）

### Must Have
- 嵌入式架构迁移完成
- 官方 ACP SDK 集成
- MCP → Agent 同步
- Skills → Agent 同步
- 流式消息输出
- 项目级 Skills 支持
- 后端测试覆盖

### Must NOT Have (Guardrails)
- ❌ 不修改任何 UI Composable 函数（视觉组件冻结）
- ❌ 不添加新的 UI 面板或页面
- ❌ 不改主题、颜色、字体
- ❌ 不引入新的前端依赖（Jetpack Compose 相关保持现状）
- ❌ 不实现 spec 中"不包含"的功能（蜂群调度、编辑器、A2A、LSP）
- ❌ 不做 UI 测试（等 UI 设计确定后再做）
- ❌ 不升级 Kotlin/Ktor/Compose 版本

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES（Gradle test 已配置，测试依赖已声明）
- **Automated tests**: Tests-after（先实现，后补测试）
- **Framework**: kotlin-test + kotlinx-coroutines-test + ktor-server-test-host + mockk
- **If TDD**: 不适用，因为架构迁移需要先调研再实现

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - can start immediately):
├── T1: 官方 ACP SDK 调研与接口映射 [deep]
├── T2: 嵌入式架构迁移（模块依赖 + Service 注入） [unspecified-high]
├── T3: Ktor Server 可选化（保留但非默认） [quick]
└── T4: 全局 Service 实例线程安全评估与修复 [quick]

Wave 2 (After Wave 1 - Core SDK + Sync):
├── T5: MCP → Agent 同步（Service 层触发） [unspecified-high]
├── T6: Skills → Agent 同步（符号链接或配置写入） [unspecified-high]
├── T7: Agent 配置双向同步（native config ↔ agents.json） [unspecified-high]
├── T8: ACP SDK 封装层实现（替换 AcpConnection） [deep]
└── T9: 项目级 Skills 支持（{project}/.swarm-editor/skills.json） [unspecified-high]

Wave 3 (After Wave 2 - Streaming + ViewModel):
├── T10: SessionService 流式消息支持（Flow/Channel） [deep]
├── T11: ViewModel 层从 ApiClient 迁移到 Service 直调 [unspecified-high]
├── T12: 流式输出驱动 UI 刷新（StateFlow 增量更新） [quick]
└── T13: 错误处理与重试机制（连接失败、超时） [unspecified-high]

Wave 4 (After Wave 3 - Testing + Cleanup):
├── T14: AgentService 单元测试 [quick]
├── T15: SessionService + Store 单元测试 [quick]
├── T16: MCP/Skills 同步集成测试 [quick]
├── T17: 端到端集成验证（单机运行流） [unspecified-high]
└── T18: 废弃 HTTP 层清理（ApiClient 标记 deprecated） [quick]

Wave FINAL (After ALL tasks - 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T2 → T8 → T10 → T11 → T17 → F1-F4 → user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| T1 (SDK 调研) | - | T8 |
| T2 (嵌入式迁移) | - | T11, T17 |
| T3 (Ktor 可选化) | - | T17 |
| T4 (线程安全) | - | T11 |
| T5 (MCP 同步) | T2 | T16 |
| T6 (Skills 同步) | T2 | T16 |
| T7 (双向配置) | T2 | - |
| T8 (SDK 封装) | T1, T4 | T10 |
| T9 (项目级 Skills) | T2 | - |
| T10 (流式消息) | T8 | T12, T17 |
| T11 (ViewModel 迁移) | T2, T4 | T12, T17 |
| T12 (UI 增量刷新) | T10, T11 | - |
| T13 (错误处理) | T8 | - |
| T14-16 (测试) | T5, T6, T8, T10 | T17 |
| T17 (集成验证) | T2, T3, T10, T11, T14-16 | - |
| T18 (HTTP 清理) | T11 | - |

---

## TODOs

- [ ] T1. **官方 ACP SDK 调研与接口映射**

  **What to do**:
  - 调研 `com.agentclientprotocol:acp:0.13.1` 官方 SDK 的 API
  - 查找 SDK 中的连接管理类、消息类型、流式支持
  - 对比当前手写 AcpConnection.kt (307 行) 的功能，列出 SDK 替代映射表
  - 确定 SDK 是否支持 `session/update` 通知（流式输出关键）
  - 输出调研报告：SDK 关键类、方法签名、与当前实现的功能对照表

  **Must NOT do**:
  - 不修改任何现有代码（纯调研）
  - 不引入新的依赖版本

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Reason**: 需要深入阅读外部库文档和源码，做技术决策
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T8
  - **Blocked By**: None

  **References**:
  - `backend/build.gradle.kts:32` — ACP SDK 依赖声明
  - `backend/src/main/kotlin/.../acp/AcpConnection.kt` — 当前手写实现（需映射的功能清单）
  - `backend/src/main/kotlin/.../acp/AcpConnectionManager.kt` — 当前连接管理
  - Context7: `com.agentclientprotocol:acp` 官方文档（如可用）

  **Acceptance Criteria**:
  - [ ] 调研文档保存到 `docs/acp-sdk-mapping.md`
  - [ ] 列出 SDK 中可替代 AcpConnection 的类/方法
  - [ ] 明确 SDK 是否支持流式通知（session/update）
  - [ ] 列出 SDK 不支持、需保留自定义实现的场景

  **QA Scenarios**:
  ```
  Scenario: SDK 调研完成
    Tool: Bash
    Preconditions: 无
    Steps:
      1. cat docs/acp-sdk-mapping.md | head -50
      2. grep -c "session/update\|streaming\|flow" docs/acp-sdk-mapping.md
    Expected Result: 文档存在且包含流式相关分析
    Evidence: .sisyphus/evidence/t1-sdk-research.md
  ```

  **Evidence to Capture**:
  - [ ] docs/acp-sdk-mapping.md

  **Commit**: NO（调研阶段，不提交）

---

- [ ] T2. **嵌入式架构迁移（模块依赖 + Service 注入）**

  **What to do**:
  - `desktopApp/build.gradle.kts` 添加 `implementation(projects.backend)`
  - 在 desktopApp 中创建 ServiceProvider/ServiceLocator，暴露 backend 的 Service 实例
  - Main.kt (desktop) 初始化 Service 层（参考 backend/Main.kt 的 runBlocking init 逻辑）
  - 确保 Service 实例在 desktopApp 进程中可用，供 ViewModel 注入

  **Must NOT do**:
  - 不删除 backend 模块（保留独立运行能力）
  - 不改 Ktor Route 和 REST API（T3 处理）
  - 不改 ViewModel（T11 处理）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: Gradle 模块依赖调整 + 跨模块 Service 注入，需要理解 Gradle 和 Kotlin DI 模式
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T5, T6, T7, T9, T11, T17
  - **Blocked By**: None

  **References**:
  - `desktopApp/build.gradle.kts` — 当前依赖配置
  - `backend/build.gradle.kts` — backend 模块配置
  - `settings.gradle.kts` — TYPESAFE_PROJECT_ACCESSORS 已启用
  - `backend/src/main/kotlin/.../backend/Main.kt:34-44` — Service 实例初始化逻辑（需复制到 desktopApp）

  **Acceptance Criteria**:
  - [ ] `./gradlew :desktopApp:build` BUILD SUCCESSFUL（添加 backend 依赖后编译通过）
  - [ ] desktopApp 能 import backend 的 Service 类
  - [ ] ServiceProvider 单例在 desktopApp Main 中初始化

  **QA Scenarios**:
  ```
  Scenario: 模块依赖编译通过
    Tool: Bash
    Preconditions: 无
    Steps:
      1. ./gradlew :desktopApp:build
    Expected Result: BUILD SUCCESSFUL
    Evidence: .sisyphus/evidence/t2-build-pass.log

  Scenario: Service 可注入
    Tool: Bash
    Preconditions: build 成功
    Steps:
      1. grep -r "import com.swarmeditor.backend.service" desktopApp/src/main/kotlin/
      2. grep -r "AgentService\|SessionService" desktopApp/src/main/kotlin/ | head -10
    Expected Result: desktopApp 源码中出现 backend Service 的 import
    Evidence: .sisyphus/evidence/t2-service-import.log
  ```

  **Evidence to Capture**:
  - [ ] build 日志
  - [ ] ServiceProvider 代码截图

  **Commit**: YES
  - Message: `chore(architecture): add backend module dependency to desktopApp`
  - Files: `desktopApp/build.gradle.kts`, `desktopApp/src/main/kotlin/.../service/ServiceProvider.kt`

---

- [ ] T3. **Ktor Server 可选化（保留但非默认）**

  **What to do**:
  - backend/Main.kt 添加启动模式判断：默认不启动 Ktor Server
  - 保留 `embeddedServer` 启动逻辑，但只在显式启用时运行（如环境变量或启动参数）
  - 确保 Service 初始化（runBlocking init）无论是否启动 Server 都执行
  - desktopApp 默认不走 HTTP，backend:run 可选择性启动 Server（调试用）

  **Must NOT do**:
  - 不删除 Ktor Route 文件
  - 不改 Route 绑定逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: 条件判断 + 启动逻辑调整，范围小
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T17
  - **Blocked By**: None

  **References**:
  - `backend/src/main/kotlin/.../backend/Main.kt:46-55` — main() 启动逻辑
  - `backend/src/main/kotlin/.../backend/Main.kt:57-71` — Application.module() 路由绑定

  **Acceptance Criteria**:
  - [ ] `./gradlew :desktopApp:run` 不启动 `localhost:8080`
  - [ ] `./gradlew :backend:run --args="--server"` 或类似方式可启动 Ktor Server
  - [ ] `lsof -i :8080` 在 desktopApp 运行时无监听

  **QA Scenarios**:
  ```
  Scenario: desktopApp 不启动 Server
    Tool: Bash
    Preconditions: 无
    Steps:
      1. timeout 10 ./gradlew :desktopApp:run &
      2. sleep 8
      3. lsof -i :8080 || echo "Port 8080 not in use"
      4. kill %1
    Expected Result: "Port 8080 not in use"
    Evidence: .sisyphus/evidence/t3-no-server.log

  Scenario: backend 可选启动 Server
    Tool: Bash
    Preconditions: 无
    Steps:
      1. timeout 10 ./gradlew :backend:run --args="--server" &
      2. sleep 8
      3. lsof -i :8080 | grep LISTEN
      4. kill %1
    Expected Result: lsof 显示 8080 被监听
    Evidence: .sisyphus/evidence/t3-server-mode.log
  ```

  **Evidence to Capture**:
  - [ ] lsof 输出日志

  **Commit**: YES (groups with T2)
  - Message: `chore(architecture): make Ktor server optional`
  - Files: `backend/src/main/kotlin/.../backend/Main.kt`

---

- [ ] T4. **全局 Service 实例线程安全评估与修复**

  **What to do**:
  - 审计 backend/Main.kt 中所有全局 `val` Service 实例的线程安全性
  - `AgentRegistry`：内部有 mutableMap，但只在 init 时写入，运行时读取？需要确认
  - `AcpConnectionManager`：已有 `Mutex`，安全
  - `SessionStore` / `McpStore` / `SkillStore`：已有 `Mutex`，安全
  - 如果 Service 需要被 desktopApp UI 线程直接调用，确认 `suspend` 函数在 UI 线程的调用方式
  - 修复发现的线程安全问题

  **Must NOT do**:
  - 不改 Service 的公共 API 签名（除非线程安全需要）
  - 不改存储逻辑（只加同步机制）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: 代码审计 + 小范围修复
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T11
  - **Blocked By**: None

  **References**:
  - `backend/src/main/kotlin/.../backend/Main.kt:34-44` — 全局 Service 实例声明
  - `backend/src/main/kotlin/.../agent/AgentRegistry.kt` — 检查 mutableMap 的线程安全
  - `backend/src/main/kotlin/.../acp/AcpConnectionManager.kt` — 参考 Mutex 模式
  - `backend/src/main/kotlin/.../session/SessionStore.kt` — 参考 Mutex 模式

  **Acceptance Criteria**:
  - [ ] 审计报告：每个 Service 实例的线程安全状态（SAFE / NEEDS_FIX）
  - [ ] 所有 NEEDS_FIX 的实例已修复
  - [ ] `./gradlew build` 编译通过

  **QA Scenarios**:
  ```
  Scenario: 线程安全审计完成
    Tool: Bash
    Steps:
      1. grep -n "mutableMap\|mutableList\|var " backend/src/main/kotlin/com/swarmeditor/backend/service/*.kt
      2. grep -n "Mutex\|withLock" backend/src/main/kotlin/com/swarmeditor/backend/**/*.kt
    Expected Result: 所有可变状态都有 Mutex 保护或文档说明线程安全
    Evidence: .sisyphus/evidence/t4-thread-safety-audit.log
  ```

  **Evidence to Capture**:
  - [ ] 审计日志

  **Commit**: YES (groups with T2-T3)
  - Message: `fix(threading): audit and fix global service thread safety`

---

- [ ] T5. **MCP → Agent 同步（Service 层触发）**

  **What to do**:
  - `McpService.upsert(config)` 在保存到 `~/.swarm-editor/mcp-servers.json` 后，遍历 `enabledAgents` 中 enabled=true 的 Agent，调用对应 `AgentAdapter.writeMcpConfig()`
  - `McpService.delete(id)` 同样触发同步（从 Agent 配置中移除）
  - 添加 `McpService.syncToAgent(agentId)` 单独同步方法
  - 处理格式差异：Claude（`~/.claude.json`，标准格式）vs Qwen（`~/.qwen/settings.json`，无 type 字段，HTTP 用 httpUrl）

  **Must NOT do**:
  - 不改 McpStore 的存储逻辑（只加同步触发）
  - 不改 UI（T11 ViewModel 迁移时可能改调用方式）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: 需要理解多个 Agent 的 MCP 配置格式差异，做格式转换
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T6, T7, T9 并行）
  - **Parallel Group**: Wave 2
  - **Blocks**: T16
  - **Blocked By**: T2

  **References**:
  - `backend/src/main/kotlin/.../service/McpService.kt` — 当前 upsert/delete 逻辑
  - `backend/src/main/kotlin/.../agent/AgentAdapter.kt:35-39` — writeMcpConfig 接口
  - `backend/src/main/kotlin/.../agent/adapter/ClaudeCodeAdapter.kt` — Claude MCP 格式
  - `backend/src/main/kotlin/.../agent/adapter/QwenCodeAdapter.kt` — Qwen MCP 格式差异
  - Spec 第 6 章 — MCP 同步到 Agent 原生格式

  **Acceptance Criteria**:
  - [ ] `McpService.upsert()` 后，已启用 Agent 的 MCP 配置文件同步更新
  - [ ] `McpService.delete()` 后，Agent MCP 配置中对应 server 被移除
  - [ ] Claude 格式：`~/.claude.json` → `{ "mcpServers": { "name": { "type", "command", "args" } } }`
  - [ ] Qwen 格式：`~/.qwen/settings.json` → `{ "mcpServers": { "name": { "command", "args", "httpUrl" } } }`（无 type）

  **QA Scenarios**:
  ```
  Scenario: MCP 同步到 Claude
    Tool: Bash
    Preconditions: T2 完成，backend Service 可独立运行
    Steps:
      1. 创建测试 MCP 配置（mock McpService.upsert）
      2. cat ~/.claude.json | grep -c "test-server"
    Expected Result: 输出 1（test-server 存在于 Claude MCP 配置）
    Evidence: .sisyphus/evidence/t5-mcp-sync-claude.json

  Scenario: MCP 删除同步
    Tool: Bash
    Preconditions: 上一步 test-server 已添加
    Steps:
      1. mock McpService.delete("test-server")
      2. cat ~/.claude.json | grep -c "test-server"
    Expected Result: 输出 0（test-server 已移除）
    Evidence: .sisyphus/evidence/t5-mcp-delete-claude.json
  ```

  **Evidence to Capture**:
  - [ ] ~/.claude.json 同步前后对比
  - [ ] ~/.qwen/settings.json 同步前后对比

  **Commit**: YES
  - Message: `feat(sync): MCP configuration sync to agent native configs`
  - Files: `backend/src/main/kotlin/.../service/McpService.kt`

---

- [ ] T6. **Skills → Agent 同步（符号链接或配置写入）**

  **What to do**:
  - 确定同步方式：符号链接（spec 要求）vs 配置写入（Adapter 接口已有 writeNativeConfig）
  - 方案 A（推荐）：`SkillService.toggleAgent()` 后，在 Agent 的 skillsDirectory 创建/删除符号链接指向 `~/.swarm-editor/skills/{name}/`
  - 方案 B（备选）：调用 AgentAdapter.writeNativeConfig 修改 skills 配置（如果 Agent 支持）
  - 实现全局 Skills 仓库初始化：`~/.swarm-editor/skills/{name}/SKILL.md`（如不存在则创建）
  - SkillScanner 增加扫描 `~/.swarm-editor/skills/`（当前只扫描 Agent 目录，需要修正）

  **Must NOT do**:
  - 不改 UI（T11 处理 ViewModel 调用）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: 文件系统操作（符号链接）+ 跨平台兼容性（Windows 不支持 Unix 符号链接，需要 fallback）
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T5, T7, T9 并行）
  - **Parallel Group**: Wave 2
  - **Blocks**: T16
  - **Blocked By**: T2

  **References**:
  - `backend/src/main/kotlin/.../service/SkillService.kt` — 当前 toggleAgent 逻辑
  - `backend/src/main/kotlin/.../skill/SkillScanner.kt` — 扫描路径列表
  - `backend/src/main/kotlin/.../agent/AgentAdapter.kt:21` — skillsDirectory 接口
  - Spec 第 4 章 — Skills 三层模型 + 符号链接同步

  **Acceptance Criteria**:
  - [ ] `SkillService.toggleAgent(id, agentId, true)` 后，`~/.claude/skills/{skillName}` 符号链接存在
  - [ ] `SkillService.toggleAgent(id, agentId, false)` 后，符号链接被删除
  - [ ] Windows 平台有 fallback（复制文件或 junction）
  - [ ] SkillScanner 扫描 `~/.swarm-editor/skills/`

  **QA Scenarios**:
  ```
  Scenario: Skills 符号链接创建
    Tool: Bash
    Preconditions: T2 完成
    Steps:
      1. 创建测试 Skill：mkdir -p ~/.swarm-editor/skills/test-skill && echo "# Test" > ~/.swarm-editor/skills/test-skill/SKILL.md
      2. mock SkillService.toggleAgent("test-skill", "claude-code", true)
      3. ls -la ~/.claude/skills/ | grep test-skill
    Expected Result: 显示 test-skill -> ~/.swarm-editor/skills/test-skill 符号链接
    Evidence: .sisyphus/evidence/t6-skill-symlink.log

  Scenario: Skills 符号链接删除
    Tool: Bash
    Preconditions: 上一步链接已创建
    Steps:
      1. mock SkillService.toggleAgent("test-skill", "claude-code", false)
      2. ls ~/.claude/skills/ | grep -c test-skill
    Expected Result: 输出 0
    Evidence: .sisyphus/evidence/t6-skill-remove.log
  ```

  **Evidence to Capture**:
  - [ ] 符号链接 ls -la 输出

  **Commit**: YES
  - Message: `feat(sync): Skills sync to agent via symlink`
  - Files: `backend/src/main/kotlin/.../service/SkillService.kt`, `backend/src/main/kotlin/.../skill/SkillScanner.kt`

---

- [ ] T7. **Agent 配置双向同步（native config ↔ agents.json）**

  **What to do**:
  - 修正当前单向同步问题：
    - 读取时：`AgentRegistry.scan()` 调用 `adapter.readNativeConfigFields()` 合并到 `AgentConfig`
    - 写入时：`AgentAdapter.writeNativeConfigField()` 后，同步更新内存中的 `AgentConfig` 和 `agents.json`
  - 添加 `AgentService.saveConfig(agentId, fields)` 方法，统一处理双向更新
  - 确保 `agents.json` 始终是权威数据源，native config 是派生视图

  **Must NOT do**:
  - 不改 UI
  - 不改 Adapter 的公共接口（除非需要新增方法）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: 状态一致性逻辑复杂，涉及两个数据源的读写顺序
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T5, T6, T9 并行）
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: T2

  **References**:
  - `backend/src/main/kotlin/.../agent/AgentRegistry.kt:51-67` — scan() 逻辑（当前未读 native config）
  - `backend/src/main/kotlin/.../route/AgentRoutes.kt:37-45` — PUT config 路由
  - `backend/src/main/kotlin/.../agent/AgentAdapter.kt:26-33` — read/write native config 接口

  **Acceptance Criteria**:
  - [ ] `AgentRegistry.scan()` 后，agents.json 包含 native config 中的 env/args 等字段
  - [ ] `AgentService.saveConfig()` 后，native config 和 agents.json 一致
  - [ ] 手动修改 `~/.claude/settings.json` 后重新 scan，agents.json 反映最新值

  **QA Scenarios**:
  ```
  Scenario: 双向同步一致性
    Tool: Bash
    Preconditions: T2 完成
    Steps:
      1. echo '{"env":{"TEST_KEY":"test_value"}}' > ~/.claude/settings.json
      2. mock AgentRegistry.scan()
      3. grep -c "TEST_KEY" ~/.swarm-editor/agents.json
    Expected Result: 输出 >= 1
    Evidence: .sisyphus/evidence/t7-bidirectional-sync.json
  ```

  **Evidence to Capture**:
  - [ ] agents.json 同步前后对比
  - [ ] native config 文件对比

  **Commit**: YES
  - Message: `feat(sync): bidirectional agent config synchronization`
  - Files: `backend/src/main/kotlin/.../agent/AgentRegistry.kt`, `backend/src/main/kotlin/.../service/AgentService.kt`

---

- [ ] T8. **ACP SDK 封装层实现（替换 AcpConnection）**

  **What to do**:
  - 基于 T1 调研结果，用官方 SDK 重写 ACP 通信层
  - 创建 `AcpSdkConnection` 类，封装 SDK 的连接、请求、通知 API
  - 保留 `AcpConnectionManager` 的公共接口（或适配），减少对 Service 层的影响
  - 确保 SDK 封装层支持：connect、disconnect、sendPrompt、onNotification、closeSession
  - 如果 SDK 不支持流式，保留自定义通知处理机制

  **Must NOT do**:
  - 不删除旧的 AcpConnection.kt（先保留，T18 清理）
  - 不改 AcpConnectionManager 的公共 API（内部实现可换）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Reason**: 外部 SDK 集成，需要理解 SDK 的异步模型和生命周期管理
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖 T1 调研结果）
  - **Parallel Group**: Wave 2
  - **Blocks**: T10, T13
  - **Blocked By**: T1, T4

  **References**:
  - T1 输出：`docs/acp-sdk-mapping.md`
  - `backend/src/main/kotlin/.../acp/AcpConnection.kt` — 当前实现（功能对照）
  - `backend/src/main/kotlin/.../acp/AcpConnectionManager.kt` — 需保持接口兼容

  **Acceptance Criteria**:
  - [ ] `./gradlew build` 编译通过（SDK 依赖正确引用）
  - [ ] `AcpConnectionManager.connect()` 使用新的 SDK 封装层
  - [ ] 现有 Route 测试（POST /api/agents/{id}/connect）仍能通过

  **QA Scenarios**:
  ```
  Scenario: SDK 封装层编译通过
    Tool: Bash
    Steps:
      1. ./gradlew :backend:build
    Expected Result: BUILD SUCCESSFUL
    Evidence: .sisyphus/evidence/t8-sdk-build.log

  Scenario: SDK 封装层功能对照
    Tool: Bash
    Steps:
      1. grep -n "class AcpSdkConnection" backend/src/main/kotlin/.../acp/*.kt
      2. grep -n "connect\|sendPrompt\|onNotification" backend/src/main/kotlin/.../acp/AcpSdkConnection.kt
    Expected Result: 新类存在且包含核心方法
    Evidence: .sisyphus/evidence/t8-sdk-methods.log
  ```

  **Evidence to Capture**:
  - [ ] 编译日志
  - [ ] 新类代码片段

  **Commit**: YES
  - Message: `feat(acp): integrate official ACP SDK`
  - Files: `backend/src/main/kotlin/.../acp/AcpSdkConnection.kt`, `backend/src/main/kotlin/.../acp/AcpConnectionManager.kt`

---

- [ ] T9. **项目级 Skills 支持（{project}/.swarm-editor/skills.json）**

  **What to do**:
  - `SkillScanner` 增加 `scanProject(projectDir: File)` 方法
  - 读取 `{project}/.swarm-editor/skills.json`，解析引用的 Skills ID 列表
  - `SkillService` 增加项目级 Skills 查询：`getProjectSkills(projectDir)`
  - 项目级 Skills 引用全局仓库中的 Skill，不复制文件
  - UI 不改动，但 ViewModel 层（T11）需要支持传入项目路径参数

  **Must NOT do**:
  - 不改 UI（项目选择器等 UI 冻结）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: 文件系统扫描 + 配置解析
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T5-T8 并行）
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: T2

  **References**:
  - `backend/src/main/kotlin/.../skill/SkillScanner.kt` — 当前 scanGlobal()
  - `backend/src/main/kotlin/.../service/SkillService.kt`
  - Spec 第 4 章 — 项目引用 `{project}/.swarm-editor/skills.json`

  **Acceptance Criteria**:
  - [ ] `SkillScanner.scanProject()` 能读取项目级 skills.json
  - [ ] 项目级 Skills 引用全局仓库中的 Skill（通过 ID）
  - [ ] `./gradlew build` 编译通过

  **QA Scenarios**:
  ```
  Scenario: 项目级 Skills 扫描
    Tool: Bash
    Preconditions: T2 完成
    Steps:
      1. mkdir -p /tmp/test-project/.swarm-editor
      2. echo '{"skills":["test-skill"]}' > /tmp/test-project/.swarm-editor/skills.json
      3. 单元测试验证 SkillScanner.scanProject(File("/tmp/test-project"))
    Expected Result: 返回包含 test-skill 的列表
    Evidence: .sisyphus/evidence/t9-project-skills.log
  ```

  **Evidence to Capture**:
  - [ ] 扫描结果日志

  **Commit**: YES
  - Message: `feat(skills): add project-level skills support`
  - Files: `backend/src/main/kotlin/.../skill/SkillScanner.kt`, `backend/src/main/kotlin/.../service/SkillService.kt`

---

- [ ] T10. **SessionService 流式消息支持（Flow/Channel）**

  **What to do**:
  - 基于 T8 的 SDK 封装层，确认 SDK 是否支持流式通知（session/update）
  - 如果 SDK 支持：使用 SDK 的 Flow/Channel API 接收增量消息块
  - 如果 SDK 不支持：在 AcpSdkConnection 中扩展自定义通知处理，将 session/update 通知转换为 Flow<String>
  - `SessionService.sendMessage()` 返回 `Flow<String>` 或暴露 `StateFlow<String>` 用于流式输出
  - 消息持久化：流式过程中不立即保存每条增量，只在流结束时保存完整消息

  **Must NOT do**:
  - 不改 UI（T12 处理 UI 增量刷新）
  - 不改 ViewModel（T11 处理）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Reason**: 异步流处理（Flow/Channel/StateFlow），需要深入理解 Kotlin Coroutines 流式模型
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖 T8 SDK 封装层）
  - **Parallel Group**: Wave 3
  - **Blocks**: T12, T17
  - **Blocked By**: T8

  **References**:
  - T1 输出：`docs/acp-sdk-mapping.md`（SDK 流式支持分析）
  - T8 输出：`AcpSdkConnection.kt`
  - `backend/src/main/kotlin/.../service/SessionService.kt` — 当前 sendMessage 等效逻辑（通过 Route 调用）
  - `backend/src/main/kotlin/.../session/SessionStore.kt` — 消息持久化

  **Acceptance Criteria**:
  - [ ] `SessionService.sendMessage(sessionId, text)` 返回 Flow<String>（或等效流式接口）
  - [ ] 流结束时完整消息保存到 SessionStore
  - [ ] 如果 Agent 未连接，返回错误 Flow（非阻塞）

  **QA Scenarios**:
  ```
  Scenario: 流式消息接口验证
    Tool: Bash
    Steps:
      1. grep -n "Flow\|Channel" backend/src/main/kotlin/.../service/SessionService.kt
      2. ./gradlew :backend:test --tests "*SessionServiceTest*" 2>/dev/null || echo "Tests not yet created"
    Expected Result: SessionService 中出现 Flow/Channel 类型
    Evidence: .sisyphus/evidence/t10-flow-interface.log
  ```

  **Evidence to Capture**:
  - [ ] Service 接口代码片段

  **Commit**: YES
  - Message: `feat(streaming): add Flow-based streaming message support`
  - Files: `backend/src/main/kotlin/.../service/SessionService.kt`

---

- [ ] T11. **ViewModel 层从 ApiClient 迁移到 Service 直调**

  **What to do**:
  - 修改所有 ViewModel，从 `ApiClient.xxx()` HTTP 调用改为直接调用 Service 实例
  - `AgentViewModel`：注入 `AgentService`，订阅 `agentService.agents` StateFlow
  - `SessionViewModel`：注入 `SessionService`，调用流式 sendMessage
  - `McpViewModel` / `SkillViewModel` / `SettingsViewModel`：同理迁移
  - `App.kt`：通过 ServiceProvider 获取 Service 实例，注入到 ViewModel
  - 保留 ApiClient 但标记为 `@Deprecated`（T18 清理）

  **Must NOT do**:
  - 不改 UI Composable（AgentBar/ChatArea/SessionPanel 等）
  - 不改主题、颜色、字体
  - 不改数据类结构（如 AgentInfo、UiMessage 等）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: 跨模块调用链改造，涉及多个 ViewModel 和依赖注入调整
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖 T2 嵌入式迁移 + T4 线程安全）
  - **Parallel Group**: Wave 3
  - **Blocks**: T12, T17
  - **Blocked By**: T2, T4

  **References**:
  - `desktopApp/src/main/kotlin/.../viewmodel/AgentViewModel.kt` — 当前 ApiClient 调用
  - `desktopApp/src/main/kotlin/.../viewmodel/SessionViewModel.kt` — 当前 ApiClient 调用
  - `desktopApp/src/main/kotlin/.../viewmodel/McpViewModel.kt`
  - `desktopApp/src/main/kotlin/.../viewmodel/SkillViewModel.kt`
  - `desktopApp/src/main/kotlin/.../viewmodel/SettingsViewModel.kt`
  - `desktopApp/src/main/kotlin/.../App.kt` — ViewModel 创建位置

  **Acceptance Criteria**:
  - [ ] 所有 ViewModel 不再 import `ApiClient`
  - [ ] `App.kt` 通过 ServiceProvider 注入 Service
  - [ ] `./gradlew :desktopApp:build` 编译通过
  - [ ] `./gradlew build` 全项目编译通过

  **QA Scenarios**:
  ```
  Scenario: ViewModel 迁移完成
    Tool: Bash
    Steps:
      1. grep -r "import.*ApiClient" desktopApp/src/main/kotlin/.../viewmodel/ | wc -l
      2. grep -r "AgentService\|SessionService\|McpService\|SkillService" desktopApp/src/main/kotlin/.../viewmodel/ | head -20
    Expected Result: ApiClient import 数量为 0，Service import 数量 > 0
    Evidence: .sisyphus/evidence/t11-vm-migration.log
  ```

  **Evidence to Capture**:
  - [ ] grep 结果日志

  **Commit**: YES
  - Message: `refactor(viewmodel): migrate from ApiClient to direct Service calls`
  - Files: `desktopApp/src/main/kotlin/.../viewmodel/*.kt`, `desktopApp/src/main/kotlin/.../App.kt`

---

- [ ] T12. **流式输出驱动 UI 刷新（StateFlow 增量更新）**

  **What to do**:
  - `SessionViewModel.sendMessage()` 收集 `SessionService.sendMessage()` 返回的 Flow
  - 增量更新 `_messages.value`：追加到当前消息的文本内容，而非替换整个列表
  - `ChatArea` 无需修改（Composable 冻结），但确保 `messages: List<UiMessage>` 的引用不变时文本内容变化能触发重组
  - 如果 Compose 不检测内容变化，使用 `mutableStateOf` 包装文本或使用 `key`

  **Must NOT do**:
  - 不改 ChatArea.kt 的 Composable 函数签名和布局
  - 不改主题、颜色

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: StateFlow 增量更新模式，范围小
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖 T10 + T11）
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T10, T11

  **References**:
  - `desktopApp/src/main/kotlin/.../viewmodel/SessionViewModel.kt` — 当前 sendMessage 逻辑
  - `desktopApp/src/main/kotlin/.../ui/session/ChatArea.kt` — 消息渲染方式
  - Compose 文档：State 变化触发重组的规则

  **Acceptance Criteria**:
  - [ ] SessionViewModel 使用 `.collect { }` 消费 Flow
  - [ ] `_messages` 列表中当前消息的文本增量更新
  - [ ] `./gradlew :desktopApp:build` 编译通过

  **QA Scenarios**:
  ```
  Scenario: 流式更新逻辑存在
    Tool: Bash
    Steps:
      1. grep -n "collect\|Flow" desktopApp/src/main/kotlin/.../viewmodel/SessionViewModel.kt
      2. grep -n "copy(text =\|text +=" desktopApp/src/main/kotlin/.../viewmodel/SessionViewModel.kt
    Expected Result: 出现 Flow collect 和文本增量更新逻辑
    Evidence: .sisyphus/evidence/t12-streaming-vm.log
  ```

  **Evidence to Capture**:
  - [ ] ViewModel 流式消费代码片段

  **Commit**: YES (groups with T11)
  - Message: `feat(streaming): incremental message update in ViewModel`
  - Files: `desktopApp/src/main/kotlin/.../viewmodel/SessionViewModel.kt`

---

- [ ] T13. **错误处理与重试机制（连接失败、超时）**

  **What to do**:
  - `AcpConnectionManager.connect()`：连接失败时指数退避重试（最多 3 次）
  - `SessionService.sendMessage()`：Agent 未连接时返回明确错误，不静默失败
  - `AgentService.connect()`：失败后更新状态为 ERROR 并记录错误信息
  - ViewModel 层：捕获 Service 异常，更新 UI 状态（如显示错误提示）
  - 敏感命令检测：保留现有 19 条 regex 规则，确保不触发危险命令

  **Must NOT do**:
  - 不改 UI 错误提示样式（只改 ViewModel 错误状态）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: 错误处理策略设计，涉及多个层级的异常传播
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T10-T12 并行）
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T8

  **References**:
  - `backend/src/main/kotlin/.../acp/AcpConnectionManager.kt:23-44` — connect() 逻辑
  - `backend/src/main/kotlin/.../service/AgentService.kt:23-29` — connect() 包装
  - `backend/src/main/kotlin/.../acp/AcpConnection.kt:62-98` — 当前错误处理

  **Acceptance Criteria**:
  - [ ] `AcpConnectionManager.connect()` 有重试逻辑
  - [ ] 连接失败时 Agent 状态变为 ERROR（非 DISCONNECTED）
  - [ ] `SessionService.sendMessage()` 在 Agent 未连接时抛出明确异常

  **QA Scenarios**:
  ```
  Scenario: 连接失败重试
    Tool: Bash
    Steps:
      1. grep -n "retry\|delay\|attempt" backend/src/main/kotlin/.../acp/AcpConnectionManager.kt
    Expected Result: 出现重试相关逻辑
    Evidence: .sisyphus/evidence/t13-retry-logic.log
  ```

  **Evidence to Capture**:
  - [ ] 重试逻辑代码片段

  **Commit**: YES
  - Message: `feat(error-handling): add retry and error propagation`
  - Files: `backend/src/main/kotlin/.../acp/AcpConnectionManager.kt`, `backend/src/main/kotlin/.../service/AgentService.kt`

---

- [ ] T14. **AgentService 单元测试**

  **What to do**:
  - 使用 mockk 创建 `AgentRegistry` 和 `AcpConnectionManager` 的 mock
  - 测试 `AgentService.init()`：验证 registry.load() 被调用
  - 测试 `AgentService.scan()`：验证 registry.scan() 和 save() 被调用
  - 测试 `AgentService.connect()`：成功/失败两种场景
  - 测试 `AgentService.disconnect()`：验证 connectionManager.disconnect() 被调用

  **Must NOT do**:
  - 不测试 ACP SDK 本身（假设 SDK 已测试）
  - 不测试 UI

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: 标准单元测试，范围明确
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T15-T18 并行）
  - **Parallel Group**: Wave 4
  - **Blocks**: T17
  - **Blocked By**: T2, T8

  **References**:
  - `backend/src/main/kotlin/.../service/AgentService.kt`
  - `backend/build.gradle.kts:45-48` — test dependencies (kotlin-test, coroutines-test, mockk)
  - MockK 文档：mockk()、coEvery、coVerify

  **Acceptance Criteria**:
  - [ ] `backend/src/test/kotlin/.../service/AgentServiceTest.kt` 存在
  - [ ] `./gradlew :backend:test --tests "AgentServiceTest"` PASS
  - [ ] 覆盖率 >= 60%（AgentService 公共方法）

  **QA Scenarios**:
  ```
  Scenario: AgentService 测试通过
    Tool: Bash
    Steps:
      1. ./gradlew :backend:test --tests "*AgentServiceTest*"
    Expected Result: BUILD SUCCESSFUL, 所有测试 PASS
    Evidence: .sisyphus/evidence/t14-agent-service-test.log
  ```

  **Evidence to Capture**:
  - [ ] 测试运行日志

  **Commit**: YES
  - Message: `test(backend): add AgentService unit tests`
  - Files: `backend/src/test/kotlin/.../service/AgentServiceTest.kt`

---

- [ ] T15. **SessionService + Store 单元测试**

  **What to do**:
  - `SessionStoreTest`：测试 load/create/get/addMessage/close，使用临时目录
  - `McpStoreTest`：测试 load/upsert/delete/getAll
  - `SkillStoreTest`：测试 load/upsert/delete/toggleAgent
  - 使用 `@TempDir` 或临时文件创建测试数据
  - 验证 JSON 序列化/反序列化正确性

  **Must NOT do**:
  - 不测试文件系统边缘情况（权限不足等）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: 标准单元测试
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T14, T16-T18 并行）
  - **Parallel Group**: Wave 4
  - **Blocks**: T17
  - **Blocked By**: T2

  **References**:
  - `backend/src/main/kotlin/.../session/SessionStore.kt`
  - `backend/src/main/kotlin/.../mcp/McpStore.kt`
  - `backend/src/main/kotlin/.../skill/SkillStore.kt`

  **Acceptance Criteria**:
  - [ ] 3 个 Test 文件存在
  - [ ] `./gradlew :backend:test` 全部 PASS

  **QA Scenarios**:
  ```
  Scenario: Store 测试通过
    Tool: Bash
    Steps:
      1. ./gradlew :backend:test --tests "*StoreTest*"
    Expected Result: BUILD SUCCESSFUL, 所有测试 PASS
    Evidence: .sisyphus/evidence/t15-store-tests.log
  ```

  **Evidence to Capture**:
  - [ ] 测试运行日志

  **Commit**: YES (groups with T14)
  - Message: `test(backend): add Store unit tests`
  - Files: `backend/src/test/kotlin/.../session/SessionStoreTest.kt`, `backend/src/test/kotlin/.../mcp/McpStoreTest.kt`, `backend/src/test/kotlin/.../skill/SkillStoreTest.kt`

---

- [ ] T16. **MCP/Skills 同步集成测试**

  **What to do**:
  - 测试 `McpService.upsert()` 后 Agent 原生配置文件是否更新
  - 测试 `SkillService.toggleAgent()` 后符号链接是否创建/删除
  - 使用临时目录模拟 `~/.swarm-editor/` 和 `~/.claude/`
  - 验证格式转换正确（Claude vs Qwen 格式差异）

  **Must NOT do**:
  - 不测试真实 Agent CLI（使用 mock Adapter）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: 集成测试，验证跨组件协作
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T14-T15, T17-T18 并行）
  - **Parallel Group**: Wave 4
  - **Blocks**: T17
  - **Blocked By**: T5, T6

  **References**:
  - T5 输出：McpService 同步逻辑
  - T6 输出：SkillService 同步逻辑

  **Acceptance Criteria**:
  - [ ] `McpSyncTest`：upsert 后验证 mock Agent 目录中的 JSON 内容
  - [ ] `SkillSyncTest`：toggleAgent 后验证符号链接存在/不存在
  - [ ] `./gradlew :backend:test` PASS

  **QA Scenarios**:
  ```
  Scenario: 同步集成测试通过
    Tool: Bash
    Steps:
      1. ./gradlew :backend:test --tests "*SyncTest*"
    Expected Result: BUILD SUCCESSFUL
    Evidence: .sisyphus/evidence/t16-sync-integration-test.log
  ```

  **Evidence to Capture**:
  - [ ] 测试运行日志

  **Commit**: YES (groups with T14-T15)
  - Message: `test(backend): add MCP/Skills sync integration tests`
  - Files: `backend/src/test/kotlin/.../service/*SyncTest.kt`

---

- [ ] T17. **端到端集成验证（单机运行流）**

  **What to do**:
  - `./gradlew :desktopApp:run` 启动后不依赖 `localhost:8080`
  - 模拟完整流程：扫描 Agent → 连接 → 创建会话 → 发送消息 → 流式回复
  - 验证 MCP 修改同步到 Agent 配置
  - 验证 Skills 修改同步到 Agent 配置
  - 验证项目级 Skills 扫描
  - 收集运行日志和截图

  **Must NOT do**:
  - 不测试真实 Agent CLI（需要安装 claude/qwen 等，环境不可控）
  - 不改 UI

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: 端到端验证，涉及多个模块协作
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖 T2, T3, T10, T11, T14-T16）
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: T2, T3, T10, T11, T14, T15, T16

  **Acceptance Criteria**:
  - [ ] `lsof -i :8080` 在 desktopApp 运行时无输出
  - [ ] `./gradlew build` BUILD SUCCESSFUL
  - [ ] `./gradlew :backend:test` 全部 PASS

  **QA Scenarios**:
  ```
  Scenario: 单机运行无 8080 监听
    Tool: Bash
    Steps:
      1. timeout 15 ./gradlew :desktopApp:run &
      2. sleep 10
      3. lsof -i :8080 || echo "No server on 8080"
      4. kill %1
    Expected Result: "No server on 8080"
    Evidence: .sisyphus/evidence/t17-no-port-8080.log

  Scenario: 全量构建通过
    Tool: Bash
    Steps:
      1. ./gradlew build
    Expected Result: BUILD SUCCESSFUL
    Evidence: .sisyphus/evidence/t17-build.log

  Scenario: 全量测试通过
    Tool: Bash
    Steps:
      1. ./gradlew :backend:test
    Expected Result: 所有测试 PASS
    Evidence: .sisyphus/evidence/t17-tests.log
  ```

  **Evidence to Capture**:
  - [ ] lsof 输出
  - [ ] build 日志
  - [ ] test 日志

  **Commit**: NO（验证阶段，不单独提交）

---

- [ ] T18. **废弃 HTTP 层清理（ApiClient 标记 deprecated）**

  **What to do**:
  - `ApiClient` 添加 `@Deprecated` 注解，说明替代方案（Service 直调）
  - 保留 ApiClient 实现（不删除），便于回滚或调试
  - 保留 Ktor Route 实现（不删除），`backend:run --server` 模式下仍可用
  - 在 `desktopApp/api/ApiClient.kt` 添加文档注释说明废弃原因

  **Must NOT do**:
  - 不删除 ApiClient.kt
  - 不删除 Route 文件

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: 添加注解和文档
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T14-T17 并行）
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: T11

  **References**:
  - `desktopApp/src/main/kotlin/.../api/ApiClient.kt`

  **Acceptance Criteria**:
  - [ ] `@Deprecated` 注解存在于 ApiClient 类和主要方法上
  - [ ] `./gradlew build` 编译通过（忽略 deprecation warnings）

  **QA Scenarios**:
  ```
  Scenario: ApiClient 已标记废弃
    Tool: Bash
    Steps:
      1. grep -n "@Deprecated" desktopApp/src/main/kotlin/.../api/ApiClient.kt | head -5
    Expected Result: 出现 @Deprecated 注解
    Evidence: .sisyphus/evidence/t18-deprecated.log
  ```

  **Evidence to Capture**:
  - [ ] deprecation 注解截图

  **Commit**: YES (groups with T14-T16)
  - Message: `chore(cleanup): mark ApiClient as deprecated`
  - Files: `desktopApp/src/main/kotlin/.../api/ApiClient.kt`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `./gradlew build` + `./gradlew test`. Review all changed files for `as any`, empty catches, unused imports, AI slop patterns.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. `./gradlew :desktopApp:run` without backend server. Verify: agent scan → connect → send message → MCP sync → Skills sync all work.
  Output: `Scenarios [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Read "What to do" for each task, read actual diff. Verify 1:1 compliance. Check "Must NOT do" guardrails. Flag cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **T1-T4**: `chore(architecture): migrate to embedded + ACP SDK` (foundation wave)
- **T5-T9**: `feat(sync): MCP/Skills/agent config synchronization` (sync wave)
- **T10-T13**: `feat(streaming): ACP streaming + ViewModel migration` (streaming wave)
- **T14-T18**: `test(coverage): backend tests + integration verification` (test wave)

---

## Success Criteria

### Verification Commands
```bash
# 1. 嵌入式运行（无需后端服务）
./gradlew :desktopApp:run
# Expected: 桌面应用启动，不报错，能连接 Agent

# 2. 构建通过
./gradlew build
# Expected: BUILD SUCCESSFUL

# 3. 测试通过
./gradlew :backend:test
# Expected: 所有测试 PASS

# 4. 单机验证（模拟完整流程）
# 扫描 Agent → 连接 Claude → 创建会话 → 发送消息 → 看到流式回复
# 添加 MCP Server → 验证 ~/.claude.json 同步更新
# 启用 Skill → 验证 ~/.claude/skills/ 符号链接存在
```

### Final Checklist
- [ ] `./gradlew :desktopApp:run` 不依赖 localhost:8080
- [ ] `./gradlew build` BUILD SUCCESSFUL
- [ ] `./gradlew :backend:test` 全部通过
- [ ] MCP 修改同步到 Agent 原生配置（验证文件系统）
- [ ] Skills 修改同步到 Agent 原生配置（验证文件系统）
- [ ] 消息发送后有流式输出（非完整响应一次性出现）
- [ ] 零 UI Composable 文件被修改（视觉组件冻结验证）
