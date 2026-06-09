# 架构修复与测试计划

## TL;DR

> **快速摘要**: 修复三个已知架构限制（AcpConnection 优雅关闭、Skills 同步架构、类型定义），并为关键路径添加测试覆盖。
> 
> **交付物**:
> - AcpConnection 优雅关闭修复
> - Skills 同步从 Adapter 提升到 Service 层
> - AgentDetectResult / ConfigFieldMeta 类型定义
> - AcpConnection 和 SkillService 的单元测试
> 
> **预估工作量**: Medium
> **并行执行**: YES - 2 waves
> **关键路径**: Task 1 → Task 4 → Task 6

---

## Context

### Original Request
用户要求根据调研报告的结论，修复三个已知限制：
1. AcpConnection close() 未优雅关闭 stderr reader（高优先级）
2. Skills 同步方法未在 AgentAdapter 接口中声明（中优先级）
3. AgentNativeConfig / AgentDetectResult 类型未定义（低优先级）

### Interview Summary
**关键讨论**:
- 三个问题全部修复
- 暂不适配其他 Agent（Qwen/Gemini/Kimi/OpenCode）
- 关键路径测试（AcpConnection、SkillService）

**研究发现**:
- cc-switch 使用 SSOT 模式管理 Skills 同步
- cc-switch 使用 SyncMethod 枚举（Auto/Symlink/Copy）
- 当前 SkillService 只有 18 行，需要大幅扩展
- AcpConnection close() 在第 303-318 行，没有 stderr Job 管理

### Metis Review
**识别的差距**（已解决）:
- Skills sync methods 范围：确认是 ClaudeCode 特有实现，但应统一到 Service 层
- SSOT 模式适合：因为 Skills 需要在多个 Agent 之间共享
- 测试策略：使用 mockk 进行单元测试，不需要集成测试
- 外部 AgentAdapter：只有 5 个内置适配器，无外部实现

---

## Work Objectives

### 核心目标
修复三个架构限制，提升代码质量和可维护性。

### 具体交付物
1. `AcpConnection.kt` - 优雅关闭实现
2. `AgentDetectResult.kt` - 检测结果类型
3. `ConfigFieldMeta.kt` - 配置字段元数据类型
4. `SkillService.kt` - 增强的 Skills 同步功能
5. `SyncMethod.kt` - 同步策略枚举
6. `AcpConnectionTest.kt` - 单元测试
7. `SkillServiceTest.kt` - 单元测试

### 完成定义
- [ ] `./gradlew build` 通过
- [ ] `./gradlew test` 通过
- [ ] 所有新类型定义完整
- [ ] SkillService 支持 Skills 同步
- [ ] AcpConnection close() 优雅关闭

### 必须有
- AcpConnection 使用 SupervisorJob 管理协程
- AcpConnection close() 先 destroy() 再 waitFor(2s)
- SkillService 支持 SyncMethod 枚举
- AgentDetectResult 包含版本、路径、兼容状态
- 测试覆盖关键路径

### 必须没有（护栏）
- ❌ 不添加重连逻辑到 AcpConnection
- ❌ 不修改 ACP JSON-RPC 2.0 协议格式
- ❌ 不添加新的外部依赖
- ❌ 不修改 Ktor 服务器配置
- ❌ 不重构状态机
- ❌ 不为未明确列出的服务添加测试

---

## Verification Strategy

### 测试决策
- **基础设施存在**: YES
- **自动化测试**: YES (Tests-after)
- **框架**: kotlin-test + mockk + kotlinx-coroutines-test

### QA 策略
每个任务必须包含代理执行的 QA 场景。
证据保存到 `.omo/evidence/task-{N}-{scenario-slug}.{ext}`。

- **后端/模块**: 使用 Bash (bun/node REPL) - 导入，调用函数，比较输出

---

## Execution Strategy

### 并行执行波次

```
Wave 1 (立即开始 - 类型定义 + 核心修复):
├── Task 1: AcpConnection 优雅关闭修复 [unspecified-high]
├── Task 2: AgentDetectResult 类型定义 [quick]
├── Task 3: ConfigFieldMeta 类型定义 [quick]
└── Task 4: SyncMethod 枚举定义 [quick]

Wave 2 (Wave 1 之后 - Skills 同步 + 测试):
├── Task 5: SkillService 增强 [unspecified-high] (depends: 4)
├── Task 6: 从 Adapter 删除 skills 方法 [quick] (depends: 5)
├── Task 7: AcpConnection 测试 [unspecified-high] (depends: 1)
└── Task 8: SkillService 测试 [unspecified-high] (depends: 5)

Wave FINAL (所有任务之后 - 4 个并行审查):
├── Task F1: 计划合规审计 (oracle)
├── Task F2: 代码质量审查 (unspecified-high)
├── Task F3: 实际 QA 验证 (unspecified-high)
└── Task F4: 范围忠实度检查 (deep)
-> 呈现结果 -> 获取用户明确确认

关键路径: Task 1 → Task 5 → Task 7 → F1-F4 → 用户确认
并行加速: 约 60% 快于顺序执行
最大并发: 4 (Wave 1 & 2)
```

### 依赖矩阵

- **1**: - 7, 1
- **2**: - - 1
- **3**: - - 1
- **4**: - 5, 1
- **5**: 4 6, 8, 2
- **6**: 5 - 2
- **7**: 1 - 2
- **8**: 5 - 2

### Agent 调度摘要

- **Wave 1**: 4 个任务 - T1 → `unspecified-high`, T2-T4 → `quick`
- **Wave 2**: 4 个任务 - T5 → `unspecified-high`, T6 → `quick`, T7-T8 → `unspecified-high`
- **FINAL**: 4 个任务 - F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. AcpConnection 优雅关闭修复

  **What to do**:
  - 保存 stderr reader 协程的 Job 引用到 `stderrJob: Job?` 字段
  - 用 `SupervisorJob() + Dispatchers.IO` 创建专用 `connectionScope`
  - 所有子协程（readLoop、stderrLoop）挂在 connectionScope 下
  - close() 中：
    - 取消 connectionJob（一键取消所有子协程）
    - 先 `process.destroy()` + `waitFor(2s)`
    - 超时再 `process.destroyForcibly()`
    - 清理 notificationHandlers
    - 处理 close() 被多次调用的情况（幂等性）

  **Must NOT do**:
  - 不添加重连逻辑
  - 不修改 ACP JSON-RPC 2.0 协议格式
  - 不改变现有的公开方法签名

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 涉及协程管理和进程生命周期，需要 careful 处理
  - **Skills**: []
    - 无需特殊技能

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - `backend/src/main/kotlin/com/swarmeditor/backend/acp/AcpConnection.kt:303-318` - 当前 close() 实现
  - `backend/src/main/kotlin/com/swarmeditor/backend/acp/AcpConnection.kt:50-53` - 当前 process/writer/scope 定义
  - `docs/research/three-known-limitations-report.md:270-310` - 调研报告中的建议方案

  **Acceptance Criteria**:
  - [ ] AcpConnection 实现 Closeable 接口
  - [ ] close() 使用 SupervisorJob 管理协程
  - [ ] close() 先 destroy() 再 waitFor(2s)
  - [ ] close() 幂等（多次调用不抛异常）
  - [ ] `./gradlew build` 通过

  **QA Scenarios**:
  ```
  Scenario: 正常关闭
    Tool: Bash
    Preconditions: AcpConnection 实例已连接
    Steps:
      1. 创建 AcpConnection 实例
      2. 调用 connect()
      3. 调用 close()
      4. 验证 status == DISCONNECTED
      5. 验证 process == null
    Expected Result: 状态正确转换，资源正确释放
    Evidence: .omo/evidence/task-1-normal-close.txt

  Scenario: 重复关闭
    Tool: Bash
    Preconditions: AcpConnection 实例已关闭
    Steps:
      1. 创建 AcpConnection 实例
      2. 调用 connect()
      3. 调用 close()
      4. 再次调用 close()
      5. 验证无异常抛出
    Expected Result: 第二次 close() 是幂等的
    Evidence: .omo/evidence/task-1-idempotent-close.txt
  ```

  **Commit**: YES
  - Message: `fix(acp): graceful shutdown with SupervisorJob`
  - Files: `backend/src/main/kotlin/com/swarmeditor/backend/acp/AcpConnection.kt`
  - Pre-commit: `./gradlew build`

- [x] 2. AgentDetectResult 类型定义

  **What to do**:
  - 在 `common/src/main/kotlin/com/swarmeditor/common/model/` 下创建 `AgentDetectResult.kt`
  - 定义 data class：
    ```kotlin
    data class AgentDetectResult(
        val version: String,
        val executablePath: String?,
        val isCompatible: Boolean,
        val errorMessage: String?
    )
    ```
  - 添加 companion object 工厂方法：
    - `fun found(version: String, path: String): AgentDetectResult`
    - `fun foundButFailed(version: String, error: String): AgentDetectResult`
    - `fun notFound(error: String): AgentDetectResult`

  **Must NOT do**:
  - 不修改现有的 detect() 方法签名
  - 不添加验证逻辑到类型定义中

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的 data class 定义
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `backend/src/main/kotlin/com/swarmeditor/backend/agent/AgentAdapter.kt:24` - 当前 detect() 返回 String?
  - `docs/research/three-known-limitations-report.md:84-100` - 调研报告中的建议

  **Acceptance Criteria**:
  - [ ] AgentDetectResult data class 定义完整
  - [ ] 包含 companion object 工厂方法
  - [ ] `./gradlew build` 通过

  **QA Scenarios**:
  ```
  Scenario: 类型定义正确
    Tool: Bash
    Preconditions: AgentDetectResult.kt 已创建
    Steps:
      1. 编译项目：./gradlew build
      2. 验证无编译错误
    Expected Result: BUILD SUCCESSFUL
    Evidence: .omo/evidence/task-2-type-definition.txt
  ```

  **Commit**: YES
  - Message: `feat(types): add AgentDetectResult`
  - Files: `common/src/main/kotlin/com/swarmeditor/common/model/AgentDetectResult.kt`
  - Pre-commit: `./gradlew build`

- [x] 3. ConfigFieldMeta 类型定义

  **What to do**:
  - 在 `common/src/main/kotlin/com/swarmeditor/common/model/` 下创建 `ConfigFieldMeta.kt`
  - 定义 data class：
    ```kotlin
    data class ConfigFieldMeta(
        val id: String,
        val label: String,
        val type: ConfigFieldType,
        val options: List<String> = emptyList(),
        val isSensitive: Boolean = false,
        val envVarName: String? = null
    )
    ```
  - 定义 ConfigFieldType 枚举：
    ```kotlin
    enum class ConfigFieldType {
        Text, Password, Select, Number
    }
    ```

  **Must NOT do**:
  - 不构建 UI 表单框架
  - 不添加验证逻辑到类型定义中

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的 data class 和 enum 定义
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `docs/research/three-known-limitations-report.md:130-150` - 调研报告中的建议

  **Acceptance Criteria**:
  - [ ] ConfigFieldMeta data class 定义完整
  - [ ] ConfigFieldType 枚举定义完整
  - [ ] `./gradlew build` 通过

  **QA Scenarios**:
  ```
  Scenario: 类型定义正确
    Tool: Bash
    Preconditions: ConfigFieldMeta.kt 已创建
    Steps:
      1. 编译项目：./gradlew build
      2. 验证无编译错误
    Expected Result: BUILD SUCCESSFUL
    Evidence: .omo/evidence/task-3-type-definition.txt
  ```

  **Commit**: YES
  - Message: `feat(types): add ConfigFieldMeta`
  - Files: `common/src/main/kotlin/com/swarmeditor/common/model/ConfigFieldMeta.kt`
  - Pre-commit: `./gradlew build`

- [x] 4. SyncMethod 枚举定义

  **What to do**:
  - 在 `backend/src/main/kotlin/com/swarmeditor/backend/skill/` 下创建 `SyncMethod.kt`
  - 定义枚举：
    ```kotlin
    enum class SyncMethod {
        Auto,     // 优先 symlink，失败 fallback 到 copy
        Symlink,  // 符号链接（推荐，实时更新）
        Copy      // 物理拷贝（兼容性好）
    }
    ```
  - 添加说明文档

  **Must NOT do**:
  - 不添加复杂的同步逻辑
  - 不修改现有的 SkillStore

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的 enum 定义
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:
  - `docs/research/three-known-limitations-report.md:46-57` - cc-switch 的 SyncMethod 枚举

  **Acceptance Criteria**:
  - [ ] SyncMethod 枚举定义完整
  - [ ] 包含 Auto/Symlink/Copy 三个值
  - [ ] `./gradlew build` 通过

  **QA Scenarios**:
  ```
  Scenario: 枚举定义正确
    Tool: Bash
    Preconditions: SyncMethod.kt 已创建
    Steps:
      1. 编译项目：./gradlew build
      2. 验证无编译错误
    Expected Result: BUILD SUCCESSFUL
    Evidence: .omo/evidence/task-4-enum-definition.txt
  ```

  **Commit**: YES
  - Message: `feat(skill): add SyncMethod enum`
  - Files: `backend/src/main/kotlin/com/swarmeditor/backend/skill/SyncMethod.kt`
  - Pre-commit: `./gradlew build`

- [x] 5. SkillService 增强 - Skills 同步功能

  **What to do**:
  - 增强 `SkillService.kt`，添加以下方法：
    - `syncSkillsToAgent(agentType: AgentType, skillNames: List<String>, method: SyncMethod = SyncMethod.Auto)`
    - `scanAgentSkills(agentType: AgentType): List<String>`
    - `applyProviderPreset(agentType: AgentType, presetName: String)`
  - 实现同步逻辑：
    - 读取全局 skills 目录（~/.swarm-editor/skills/）
    - 根据 agentType 获取目标目录（通过 AgentAdapter.skillsDirectory）
    - 根据 SyncMethod 执行同步（symlink 或 copy）
  - 添加错误处理和日志记录

  **Must NOT do**:
  - 不修改现有的 SkillStore
  - 不添加 MCP 服务器同步
  - 不添加多 Agent 技能冲突解决

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 涉及文件系统操作和跨服务协调
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8)
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References**:
  - `backend/src/main/kotlin/com/swarmeditor/backend/service/SkillService.kt` - 当前实现（18行）
  - `backend/src/main/kotlin/com/swarmeditor/backend/agent/adapter/ClaudeCodeAdapter.kt:155-183` - 现有 skills 方法实现
  - `docs/research/three-known-limitations-report.md:20-57` - cc-switch 的 SSOT 模式

  **Acceptance Criteria**:
  - [ ] SkillService 包含 syncSkillsToAgent 方法
  - [ ] SkillService 包含 scanAgentSkills 方法
  - [ ] SkillService 包含 applyProviderPreset 方法
  - [ ] 支持 SyncMethod 枚举
  - [ ] `./gradlew build` 通过

  **QA Scenarios**:
  ```
  Scenario: Skills 同步成功
    Tool: Bash
    Preconditions: 全局 skills 目录存在，AgentAdapter 已配置
    Steps:
      1. 创建测试 skill 目录和文件
      2. 调用 syncSkillsToAgent(AgentType.CLAUDE_CODE, ["test-skill"])
      3. 验证目标目录中存在 symlink 或文件
    Expected Result: Skills 正确同步到目标目录
    Evidence: .omo/evidence/task-5-sync-success.txt

  Scenario: Skills 目录不存在
    Tool: Bash
    Preconditions: 全局 skills 目录不存在
    Steps:
      1. 调用 syncSkillsToAgent(AgentType.CLAUDE_CODE, ["test-skill"])
      2. 验证返回空列表或适当错误
    Expected Result: 优雅处理目录不存在的情况
    Evidence: .omo/evidence/task-5-missing-directory.txt
  ```

  **Commit**: YES
  - Message: `feat(skill): enhance SkillService with sync`
  - Files: `backend/src/main/kotlin/com/swarmeditor/backend/service/SkillService.kt`
  - Pre-commit: `./gradlew build`

- [x] 6. 从 Adapter 删除 skills 方法

  **What to do**:
  - 从 `ClaudeCodeAdapter.kt` 中删除以下方法：
    - `scanSkills()`
    - `syncSkills()`
    - `applyProviderPreset()`
  - 确保这些功能已迁移到 SkillService
  - 更新任何调用这些方法的代码（如果有）

  **Must NOT do**:
  - 不删除其他必要方法
  - 不修改 AgentAdapter 接口

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的代码删除
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7, 8)
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:
  - `backend/src/main/kotlin/com/swarmeditor/backend/agent/adapter/ClaudeCodeAdapter.kt:155-191` - 要删除的方法

  **Acceptance Criteria**:
  - [ ] ClaudeCodeAdapter 不再包含 scanSkills/syncSkills/applyProviderPreset
  - [ ] `./gradlew build` 通过
  - [ ] 无编译错误

  **QA Scenarios**:
  ```
  Scenario: 方法删除成功
    Tool: Bash
    Preconditions: ClaudeCodeAdapter.kt 已修改
    Steps:
      1. 编译项目：./gradlew build
      2. 验证无编译错误
    Expected Result: BUILD SUCCESSFUL
    Evidence: .omo/evidence/task-6-method-deletion.txt
  ```

  **Commit**: YES
  - Message: `refactor(adapter): remove skills methods`
  - Files: `backend/src/main/kotlin/com/swarmeditor/backend/agent/adapter/ClaudeCodeAdapter.kt`
  - Pre-commit: `./gradlew build`

- [x] 7. AcpConnection 单元测试

  **What to do**:
  - 在 `backend/src/test/kotlin/com/swarmeditor/backend/acp/` 下创建 `AcpConnectionTest.kt`
  - 使用 mockk 模拟 Process 和 BufferedReader
  - 测试场景：
    - 正常关闭
    - 重复关闭（幂等性）
    - 进程已死亡时关闭
    - stderr 输出时关闭

  **Must NOT do**:
  - 不启动真实的子进程
  - 不测试 ACP 协议逻辑

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解协程和 mockk 测试模式
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8)
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:
  - `backend/build.gradle.kts:45-48` - 测试依赖配置
  - `backend/src/main/kotlin/com/swarmeditor/backend/acp/AcpConnection.kt` - 被测试的类

  **Acceptance Criteria**:
  - [ ] AcpConnectionTest.kt 创建
  - [ ] 包含正常关闭测试
  - [ ] 包含重复关闭测试
  - [ ] 所有测试通过
  - [ ] `./gradlew test` 通过

  **QA Scenarios**:
  ```
  Scenario: 测试套件通过
    Tool: Bash
    Preconditions: AcpConnectionTest.kt 已创建
    Steps:
      1. 运行测试：./gradlew :backend:test
      2. 验证所有测试通过
    Expected Result: All tests passed
    Evidence: .omo/evidence/task-7-test-results.txt
  ```

  **Commit**: YES
  - Message: `test(acp): add AcpConnection tests`
  - Files: `backend/src/test/kotlin/com/swarmeditor/backend/acp/AcpConnectionTest.kt`
  - Pre-commit: `./gradlew test`

- [x] 8. SkillService 单元测试

  **What to do**:
  - 在 `backend/src/test/kotlin/com/swarmeditor/backend/service/` 下创建 `SkillServiceTest.kt`
  - 使用 mockk 模拟 SkillStore 和 SkillScanner
  - 测试场景：
    - 同步成功
    - 目录不存在
    - 同步失败

  **Must NOT do**:
  - 不进行真实的文件系统操作
  - 不测试 SkillStore 内部逻辑

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解 mockk 和协程测试
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:
  - `backend/build.gradle.kts:45-48` - 测试依赖配置
  - `backend/src/main/kotlin/com/swarmeditor/backend/service/SkillService.kt` - 被测试的类

  **Acceptance Criteria**:
  - [ ] SkillServiceTest.kt 创建
  - [ ] 包含同步成功测试
  - [ ] 包含目录不存在测试
  - [ ] 所有测试通过
  - [ ] `./gradlew test` 通过

  **QA Scenarios**:
  ```
  Scenario: 测试套件通过
    Tool: Bash
    Preconditions: SkillServiceTest.kt 已创建
    Steps:
      1. 运行测试：./gradlew :backend:test
      2. 验证所有测试通过
    Expected Result: All tests passed
    Evidence: .omo/evidence/task-8-test-results.txt
  ```

  **Commit**: YES
  - Message: `test(skill): add SkillService tests`
  - Files: `backend/src/test/kotlin/com/swarmeditor/backend/service/SkillServiceTest.kt`
  - Pre-commit: `./gradlew test`

---

## Final Verification Wave

> 4 个审查代理并行运行。全部必须通过。将结果呈现给用户并获取明确确认。

- [x] F1. **计划合规审计** — `oracle` [APPROVE]
  读取计划端到端。对于每个"必须有"：验证实现存在（读取文件、curl 端点、运行命令）。对于每个"必须没有"：搜索代码库中的禁止模式——如果找到则拒绝并附带 file:line。检查 .omo/evidence/ 中的证据文件是否存在。将交付物与计划进行比较。
  输出: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **代码质量审查** — `unspecified-high` [APPROVE]
  运行 `./gradlew build` + `./gradlew test`。审查所有更改的文件：`as any`/`@ts-ignore`、空 catch、生产环境中的 console.log、注释掉的代码、未使用的导入。检查 AI slop：过度注释、过度抽象、通用名称（data/result/item/temp）。
  输出: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **实际 QA 验证** — `unspecified-high` [APPROVE]
  从干净状态开始。执行每个任务中的每个 QA 场景——遵循确切步骤，捕获证据。测试跨任务集成（功能协同工作，而不是隔离）。测试边缘情况：空状态、无效输入、快速操作。保存到 `.omo/evidence/final-qa/`。
  输出: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **范围忠实度检查** — `deep` [APPROVE]
  对于每个任务：读取"做什么"，读取实际差异（git log/diff）。验证 1:1——规范中的所有内容都已构建（无遗漏），规范之外的内容未构建（无蔓延）。检查"必须没有"合规性。检测跨任务污染：任务 N 触及任务 M 的文件。标记未accounted的更改。
  输出: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `fix(acp): graceful shutdown with SupervisorJob` - AcpConnection.kt
- **2**: `feat(types): add AgentDetectResult` - AgentDetectResult.kt
- **3**: `feat(types): add ConfigFieldMeta` - ConfigFieldMeta.kt
- **4**: `feat(skill): add SyncMethod enum` - SyncMethod.kt
- **5**: `feat(skill): enhance SkillService with sync` - SkillService.kt
- **6**: `refactor(adapter): remove skills methods` - ClaudeCodeAdapter.kt
- **7**: `test(acp): add AcpConnection tests` - AcpConnectionTest.kt
- **8**: `test(skill): add SkillService tests` - SkillServiceTest.kt

---

## Success Criteria

### 验证命令
```bash
./gradlew build  # Expected: BUILD SUCCESSFUL
./gradlew test   # Expected: All tests passed
```

### 最终检查清单
- [ ] 所有"必须有"存在
- [ ] 所有"必须没有"缺失
- [ ] 所有测试通过
