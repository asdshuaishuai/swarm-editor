
## 2026-06-10

### 新增: ConfigFieldMeta / ConfigFieldType 类型定义

**文件**:
- `common/src/main/kotlin/com/swarmeditor/common/model/ConfigFieldType.kt` — enum 定义 4 种字段类型 (Text, Password, Select, Number)
- `common/src/main/kotlin/com/swarmeditor/common/model/ConfigFieldMeta.kt` — data class，承载字段 id/label/type/options/isSensitive/envVarName

**验证**: `:common:compileKotlinJvm` ✅ | `:backend:compileKotlin` ❌ (pre-existing, `AcpConnection.kt:308`)

**待办**: AgentAdapter 实现中使用这两个类型声明原生配置字段元数据

---

### 新增: AgentDetectResult 类型定义

**文件**:
- `common/src/main/kotlin/com/swarmeditor/common/model/AgentDetectResult.kt` — data class + 3 个 companion factory 方法

**设计**:
- 三态语义：`found` (isCompatible=true) / `foundButFailed` (isCompatible=false) / `notFound` (isCompatible=false)
- `found()` → version + executablePath + isCompatible=true + errorMessage=null
- `foundButFailed()` → version + executablePath=null + isCompatible=false + error
- `notFound()` → version="" + executablePath=null + isCompatible=false + error

**验证**: `:common:compileKotlinJvm` ✅ | `:backend:compileKotlin` ❌ (pre-existing, `AcpConnection.kt:314`)

**待办**:
- 未来工作：`AgentAdapter.detect()` 的返回类型从 `String?` 改为 `AgentDetectResult`
- 涉及文件：`backend/agent/adapter/ClaudeCodeAdapter.kt`, `GeminiCliAdapter.kt`, `KimiCodeAdapter.kt`, `QwenCodeAdapter.kt`, `OpenCodeAdapter.kt`

### 修复: AcpConnection.close() 优雅关闭

**文件**: `backend/src/main/kotlin/.../acp/AcpConnection.kt`

**修复问题**:
1. stderr reader Job 未保存 — close 时协程泄漏
2. `close()` 直接 `destroyForcibly()` — 无优雅关闭
3. `notificationHandlers` 未清理
4. `close()` 非幂等 — 重复调用可能抛异常
5. `scope` 顶层 CoroutineScope 从未取消

**变更**:
- 实现 `Closeable` 接口
- `scope` → `connectionJob` + `connectionScope` 受管理生命周期
- 新增 `stderrJob` 字段跟踪 stderr reader 协程
- 新增 `gracefulShutdown(process, timeoutMs)` — `destroy()` + `waitFor(2s)` → `destroyForcibly()`
- `close()` 幂等 (via `closed` flag)
- `close()` 清理 `notificationHandlers`、null 所有引用

### 新增: AcpConnection 单元测试 (close 行为)

**文件**: `backend/src/test/kotlin/com/swarmeditor/backend/acp/AcpConnectionTest.kt`

**测试场景** (8 tests, all pass):
1. 正常关闭 — `process.destroy()` 被调用, `destroyForcibly()` 不调用
2. 超时强杀 — `waitFor` 返回 false 时调用 `destroyForcibly()`
3. 幂等关闭 — `close()` 两次, `destroy()` 只调用一次
4. 进程已死 — `isAlive=false` 时跳过 `destroy()`
5. 清理 notification handlers — close 后 list 为空
6. 状态转换 — CONNECTED → DISCONNECTED
7. 非 CONNECTED 状态不受影响
8. writer 正确关闭

**技术**: 使用 mockk 模拟 `Process` + Java reflection 注入私有字段 (`process`, `writer`, `status`)

**验证**: `./gradlew :backend:test --tests AcpConnectionTest` ✅ BUILD SUCCESSFUL

**观察**:
- `status` 属性的 `private set` 导致 Kotlin 反射 `.setter` 编译失败，需用 Java `Field.set()` 绕过
- `notificationHandlers` 是 `MutableList`，通过 Kotlin 反射获取引用后可直接操作

---

### 重构: SkillService Skills 同步提升到 Service 层

**文件**:
- `backend/src/main/kotlin/.../agent/ProviderPreset.kt` — 共享 data class（从 ClaudeCodeAdapter 内部类提取）
- `backend/src/main/kotlin/.../agent/AgentAdapter.kt` — 新增 `providerPresets` 属性（默认 `emptyList()`）
- `backend/src/main/kotlin/.../agent/adapter/ClaudeCodeAdapter.kt` — 使用共享 `ProviderPreset`，`providerPresets` 加 `override`
- `backend/src/main/kotlin/.../service/SkillService.kt` — 新增 3 个方法
- `backend/src/main/kotlin/.../Main.kt` — SkillService 初始化传入 `agentRegistry::getAdapter`

**变更**:
- `SkillService` 构造函数新增 `adapterResolver: (AgentType) -> AgentAdapter?` 参数
- `syncSkillsToAgent(agentType, skillNames, method)` — 支持 Auto/Symlink/Copy 三种同步策略，清理旧 skills
- `scanAgentSkills(agentType)` — 扫描 agent skills 目录
- `applyProviderPreset(agentType, presetName)` — 通过 adapter 写入 Base URL + Model
- `ProviderPreset` 从 ClaudeCodeAdapter 内部类提升为 `backend.agent` 包级类

**验证**: `./gradlew build` ✅ BUILD SUCCESSFUL

**待办**:
- ~~Task 6: 删除 ClaudeCodeAdapter 中的 `scanSkills`/`syncSkills`/`applyProviderPreset` 方法（已有 Service 层替代）~~ ✅ **2026-06-10 完成**
- 其他 adapter（GeminiCli、KimiCode、QwenCode、OpenCode）如需 provider presets，实现 `providerPresets` 属性
- 考虑在 REST API 层暴露新方法（skillRoutes）

**Task 6 验证结果 (2026-06-10)**:
- ✅ 已删除 `scanSkills()` (原 ~155-161 行)
- ✅ 已删除 `syncSkills(skillNames: List<String>)` (原 ~163-182 行)
- ✅ 已删除 `applyProviderPreset(presetName: String)` (原 ~184-189 行)
- ✅ `providerPresets` 属性保留
- ✅ `Dispatchers`/`withContext` 导入仍被其余方法使用，无需清理
- ✅ 无其他代码调用这三个方法（grep 确认仅 ClaudeCodeAdapter 自身定义）
- ✅ `./gradlew build` → BUILD SUCCESSFUL

### 新增: SkillService 单元测试 (同步 + 预设)

**文件**: `backend/src/test/kotlin/com/swarmeditor/backend/service/SkillServiceTest.kt`

**测试场景** (10 tests, all pass):
1. `scanAgentSkills` 返回目录名列表
2. `scanAgentSkills` adapter 为 null 时返回空列表
3. `scanAgentSkills` 目录不存在时返回空列表
4. `syncSkillsToAgent` Copy 模式 — 物理拷贝，非 symlink
5. `syncSkillsToAgent` Symlink 模式 — 创建符号链接
6. `syncSkillsToAgent` 目标目录不存在时自动创建
7. `syncSkillsToAgent` adapter 为 null 时静默返回
8. `applyProviderPreset` 成功写入 Base URL + Model
9. `applyProviderPreset` 预设不存在时不调用 writeNativeConfigField
10. `applyProviderPreset` adapter 为 null 时静默返回

**技术**:
- mockk 模拟 `SkillStore`、`SkillScanner`、`AgentAdapter`
- `System.setProperty("user.home", fakeHome)` 绕过硬编码 `~/.swarm-editor/skills` 路径
- `@After` 清理临时目录

**验证**: `./gradlew :backend:test --tests SkillServiceTest` ✅ BUILD SUCCESSFUL

**观察**:
- `syncSkillsToAgent` 硬编码 `System.getProperty("user.home") + "/.swarm-editor/skills"` — 可测试性受限，需要 fake user.home
- `SyncMethod.Auto` 分支有 try-catch fallback（symlink → copy），测试中未覆盖 fallback 路径（需 mock `Files.createSymbolicLink` 抛异常）
