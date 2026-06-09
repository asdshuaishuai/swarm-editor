# 代码审查修复计划

## TL;DR

> **快速摘要**: 修复代码审查发现的 3 个关键问题 + 3 个中等问题。
> 
> **交付物**:
> - AcpConnection 线程安全 + 异常日志
> - SkillService 非破坏性目录清理 + ConfigPaths 路径统一
> - SkillServiceTest 测试隔离
> - 死代码 TODO 标记
> 
> **预估工作量**: Quick
> **并行执行**: YES - 1 wave
> **关键路径**: Task 1 → Task 4

---

## Context

### Original Request
代码审查发现 commit `cf8c8c2` 中的 7 个问题，需要修复。

### 审查发现

| # | 问题 | 严重性 |
|---|------|--------|
| 1 | `AcpConnection.closed` 缺少 `@Volatile`，多线程并发 close() 可能双重关闭 | 关键 |
| 2 | `syncSkillsToAgent()` 删除非 symlink 目录（破坏性变更） | 关键 |
| 3 | `SkillServiceTest` 修改全局 `System.setProperty("user.home")` | 关键 |
| 4 | `SkillService` 硬编码 `~/.swarm-editor/skills` 路径 | 中等 |
| 5 | `gracefulShutdown()` 静默吞掉异常 | 中等 |
| 6 | `AgentDetectResult`/`ConfigFieldMeta`/`ConfigFieldType` 是死代码 | 中等 |
| 7 | `AcpConnectionTest` 大量使用反射（脆弱性） | 轻微 |

---

## Work Objectives

### 核心目标
修复 7 个代码审查问题，提升代码质量和安全性。

### Must Have
- `closed` 字段添加 `@Volatile`
- `syncSkillsToAgent()` 只清理 symlink，不删除普通目录
- `SkillServiceTest` 不修改全局 JVM 状态
- `gracefulShutdown()` 记录异常日志
- `SkillService` 使用 `ConfigPaths` 获取路径

### Must NOT Have
- 不改变任何公开 API 签名
- 不添加新依赖
- 不修改 AgentAdapter 接口

---

## Verification Strategy

- **自动化测试**: YES (Tests-after)
- **框架**: kotlin-test + mockk
- **QA**: `./gradlew build` + `./gradlew test` 通过

---

## Execution Strategy

### 并行执行

```
Wave 1 (立即开始 - 所有修复并行):
├── Task 1: AcpConnection 修复 (#1 volatile + #5 日志) [quick]
├── Task 2: SkillService 修复 (#2 非破坏性清理 + #4 ConfigPaths) [quick]
├── Task 3: SkillServiceTest 修复 (#3 测试隔离) [quick]
└── Task 4: 死代码 TODO 标记 (#6) [quick]

Wave FINAL:
└── Task F1: 构建验证 + 测试通过 [quick]
```

### 依赖矩阵

- **1**: - F1
- **2**: - F1
- **3**: - F1
- **4**: - F1
- **F1**: 1,2,3,4 -

---

## TODOs

- [x] 1. AcpConnection 修复 — volatile + 异常日志

  **What to do**:
  - 第 58 行：`private var closed = false` → `@Volatile private var closed = false`
  - 第 346 行：`catch (_: Exception) {}` → `catch (e: Exception) { log.warn(e) { "[$agentId] gracefulShutdown failed" } }`

  **Must NOT do**:
  - 不改变 close() 的整体逻辑
  - 不改变 gracefulShutdown 的签名

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task F1
  - **Blocked By**: None

  **References**:
  - `backend/src/main/kotlin/com/swarmeditor/backend/acp/AcpConnection.kt:58` — closed 字段
  - `backend/src/main/kotlin/com/swarmeditor/backend/acp/AcpConnection.kt:337-348` — gracefulShutdown

  **Acceptance Criteria**:
  - [ ] `closed` 字段有 `@Volatile` 注解
  - [ ] `gracefulShutdown` catch 块记录异常日志
  - [ ] `./gradlew build` 通过

  **QA Scenarios**:
  ```
  Scenario: 编译验证
    Tool: Bash
    Steps:
      1. ./gradlew build
    Expected: BUILD SUCCESSFUL
  ```

  **Commit**: YES (groups with 2,3,4)
  - Message: `fix(review): address code review findings`
  - Files: `AcpConnection.kt`

- [x] 2. SkillService 修复 — 非破坏性清理 + ConfigPaths

  **What to do**:
  - 删除第 55-59 行的普通目录清理逻辑（只保留 symlink 清理）
  - 第 47 行：`File(System.getProperty("user.home"), ".swarm-editor/skills")` → `File(ConfigPaths.SWARM_EDITOR_DIR, "skills")`
  - 添加 `import com.swarmeditor.common.config.ConfigPaths`

  **Must NOT do**:
  - 不改变 syncSkillsToAgent 的签名
  - 不改变 symlink 清理逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task F1
  - **Blocked By**: None

  **References**:
  - `backend/src/main/kotlin/com/swarmeditor/backend/service/SkillService.kt:55-59` — 破坏性目录清理
  - `backend/src/main/kotlin/com/swarmeditor/backend/service/SkillService.kt:47` — 硬编码路径
  - `common/src/commonMain/kotlin/com/swarmeditor/common/config/Paths.kt` — ConfigPaths 定义

  **Acceptance Criteria**:
  - [ ] 删除普通目录清理逻辑
  - [ ] 使用 ConfigPaths.SWARM_EDITOR_DIR
  - [ ] `./gradlew build` 通过

  **QA Scenarios**:
  ```
  Scenario: 编译验证
    Tool: Bash
    Steps:
      1. ./gradlew build
    Expected: BUILD SUCCESSFUL
  ```

  **Commit**: YES (groups with 1,3,4)

- [x] 3. SkillServiceTest 修复 — 测试隔离

  **What to do**:
  - 修改 SkillService 构造函数，增加 `skillsRootPath: String = ConfigPaths.SWARM_EDITOR_DIR` 参数
  - syncSkillsToAgent 使用 `File(skillsRootPath, "skills")` 替代硬编码路径
  - SkillServiceTest 中通过构造函数注入临时目录，不再修改 System.setProperty
  - 更新 Main.kt 中的 SkillService 初始化（使用默认值，无需改动）

  **Must NOT do**:
  - 不改变 SkillService 的公开 API（增加带默认值的参数）
  - 不修改测试的断言逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task F1
  - **Blocked By**: None

  **References**:
  - `backend/src/test/kotlin/com/swarmeditor/backend/service/SkillServiceTest.kt:100-127` — 当前测试使用 System.setProperty
  - `backend/src/main/kotlin/com/swarmeditor/backend/service/SkillService.kt:47` — 硬编码路径

  **Acceptance Criteria**:
  - [ ] SkillService 构造函数增加 skillsRootPath 参数（带默认值）
  - [ ] SkillServiceTest 不再修改 System.setProperty
  - [ ] `./gradlew test` 通过

  **QA Scenarios**:
  ```
  Scenario: 测试隔离验证
    Tool: Bash
    Steps:
      1. ./gradlew :backend:test --tests SkillServiceTest
    Expected: All tests passed
  ```

  **Commit**: YES (groups with 1,2,4)

- [x] 4. 死代码 TODO 标记

  **What to do**:
  - 在 `AgentDetectResult.kt` 顶部添加：`// TODO: Integrate into AgentAdapter.detect() return type`
  - 在 `ConfigFieldMeta.kt` 顶部添加：`// TODO: Use in AgentAdapter.configFields for dynamic UI generation`
  - 在 `ConfigFieldType.kt` 顶部添加：`// TODO: Use in ConfigFieldMeta.type`

  **Must NOT do**:
  - 不删除类型定义
  - 不修改类型结构

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task F1
  - **Blocked By**: None

  **References**:
  - `common/src/main/kotlin/com/swarmeditor/common/model/AgentDetectResult.kt`
  - `common/src/main/kotlin/com/swarmeditor/common/model/ConfigFieldMeta.kt`
  - `common/src/main/kotlin/com/swarmeditor/common/model/ConfigFieldType.kt`

  **Acceptance Criteria**:
  - [ ] 三个文件都有 TODO 注释
  - [ ] `./gradlew build` 通过

  **Commit**: YES (groups with 1,2,3)

---

## Final Verification Wave

- [ ] F1. **构建验证** — `quick`
  运行 `./gradlew build` 和 `./gradlew test`，验证全部通过。
  输出: `Build [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

---

## Commit Strategy

- **F1**: `fix(review): address code review findings` — AcpConnection.kt, SkillService.kt, SkillServiceTest.kt, AgentDetectResult.kt, ConfigFieldMeta.kt, ConfigFieldType.kt

---

## Success Criteria

### 验证命令
```bash
./gradlew build  # Expected: BUILD SUCCESSFUL
./gradlew test   # Expected: All tests passed
```

### 最终检查清单
- [ ] `closed` 字段有 `@Volatile`
- [ ] syncSkillsToAgent 不删除普通目录
- [ ] SkillServiceTest 不修改全局状态
- [ ] gracefulShutdown 记录异常日志
- [ ] 使用 ConfigPaths 获取路径
