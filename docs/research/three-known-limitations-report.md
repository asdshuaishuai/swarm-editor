# 调研报告：Swarm Editor 三个已知限制与 cc-switch 参考方案

> 调研范围：cc-switch (farion1231/cc-switch) Rust/Tauri 实现
> 调研日期：2026-06-10
> 性质：纯调研报告，无编码任务

---

## 问题一：Skills 同步方法未在 AgentAdapter 接口中声明

### 现状

`ClaudeCodeAdapter` 已实现 `scanSkills()`、`syncSkills()`、`applyProviderPreset()` 三个方法，但 `AgentAdapter` 接口中未声明。这导致：
- 上层调用方（如 `SkillService`/`AgentService`）必须做类型转换 `(adapter as? ClaudeCodeAdapter)` 才能调用
- 其他 Adapter（Qwen/Gemini/Kimi/OpenCode）的技能同步能力未定义
- 架构上存在"隐性契约"——方法存在但接口不保证

### cc-switch 的参考方案

cc-switch 采用了**完全不同的架构分层**：

1. **Provider 层只负责配置读写**，不接触 Skills
   - `Provider` 结构体：`id`, `name`, `settings_config`（松散 JSON）
   - `ProviderManager`：每个 App 的供应商列表 + 当前选中项
   - `claude.rs` provider 只实现 `read_config()` / `write_config()` / `sessions()`，**没有任何 skills 相关方法**

2. **Skills 由独立的全局 Service 层统一管理**
   - `services/skill.rs` 中的 `SkillService` 是 SSOT（Single Source of Truth）
   - `SkillStore` 存储在中央配置文件 `~/.cc-switch/config.json` 中
   - `sync_all_skills()` 遍历所有已安装技能，按 `SkillApps` 标记决定同步到哪些客户端
   - `sync_skill_to_app()` 执行实际的同步操作（symlink/copy）
   - `get_app_skills_dir(app: &AppType)` 根据应用类型返回对应 skills 目录

3. **启用状态由独立的 `SkillApps` / `McpApps` 结构体标记**
   ```rust
   pub struct SkillApps {
       pub claude: bool,
       pub codex: bool,
       pub gemini: bool,
       pub opencode: bool,
       pub hermes: bool,
   }
   ```
   每个 Skill/MCP 服务器携带一个 `apps` 字段，明确标记应用到哪些客户端。

4. **同步方法抽象为枚举，不是 Adapter 的方法**
   ```rust
   pub enum SyncMethod {
       Auto,     // 优先 symlink，失败 fallback 到 copy
       Symlink,  // 符号链接（推荐，实时更新）
       Copy,     // 物理拷贝（兼容性好）
   }
   pub enum SkillStorageLocation {
       AppDirectory,  // ~/.claude/skills/
       Central,       // ~/.cc-switch/skills/
   }
   ```

### 调研结论与建议方案

**不推荐**在 `AgentAdapter` 接口中增加 skills 相关方法。

**推荐方案：向 cc-switch 的 Service 层统一模式靠拢**

| 层面 | 当前做法 | 建议做法 |
|------|---------|---------|
| **Adapter 层** | 各自实现 `scanSkills()`/`syncSkills()` | **删除这些方法**，Adapter 只保留配置读写 + ACP 命令 |
| **Service 层** | `SkillService` 已存在但功能简单 | 强化 `SkillService`，引入 `SyncMethod` 枚举和 SSOT 存储 |
| **启用标记** | 无（`McpServerConfig.enabledAgents` 勉强可用） | 增加 `AgentType` 维度的启用标记结构，或沿用 `enabledAgents` |
| **同步策略** | 仅 symlink | 支持 Auto/Symlink/Copy 三种策略 |

**关键理由**：
1. Skills 目录路径对每个 Agent 来说是**文件系统路径**，不是协议行为——不需要每个 Adapter 自定义逻辑
2. cc-switch 的实践证明了 SSOT + 全局 Service 的模式可以支撑 6+ 个客户端的统一管理
3. 将 `applyProviderPreset()` 也上提到 Service 层（`AgentService.applyProviderPreset(agentType, preset)`），避免 Adapter 自行处理业务逻辑

**若短期内不想大改架构**，折中方案：
- 在 `AgentAdapter` 接口中增加 `val supportsSkillsSync: Boolean` 和 `val supportsProviderPresets: Boolean`
- 增加 `suspend fun syncSkills(names: List<String>)` 和 `suspend fun applyProviderPreset(name: String)` 到接口
- 不支持的 Adapter 提供默认空实现（Kotlin 接口可用 `fun xxx() {}` 默认实现）

---

## 问题二：AgentNativeConfig / AgentDetectResult 类型未定义

### 现状

- `AgentAdapter.detect()` → `String?`（版本号字符串，null = 未安装）
- `AgentAdapter.readNativeConfigFields()` → `Map<String, String>`（键值对映射）
- `AgentAdapter.readNativeConfig()` → `String?`（原始 JSON/TOML 字符串）
- 没有强类型的 `AgentNativeConfig` 数据类
- 没有 `AgentDetectResult` 结构（包含版本、路径、是否可用等）

### cc-switch 的参考方案

cc-switch 采用了**松散 JSON 值 + 应用特化解析**的模式：

1. **Provider 配置使用 `serde_json::Value`（即 Kotlin 的 `JsonElement`）**
   ```rust
   pub struct Provider {
       pub id: String,
       pub name: String,
       pub settings_config: Value,  // <-- 松散 JSON，不同应用形状不同
       // ...
   }
   ```
   不强制统一配置结构，因为 Claude/Codex/Gemini/OpenCode 的配置形状差异极大。

2. **凭据解析在 Provider 层按 AppType 分治**
   ```rust
   pub fn resolve_usage_credentials(&self, app_type: &AppType) -> (String, String) {
       match app_type {
           AppType::Claude | AppType::ClaudeDesktop => { /* 读 env.ANTHROPIC_API_KEY */ }
           AppType::Codex => { /* 读 auth.OPENAI_API_KEY + TOML config */ }
           AppType::Gemini => { /* 读 env.GEMINI_API_KEY */ }
           AppType::OpenCode => { /* 读 options.apiKey */ }
           AppType::Hermes => { /* 读顶层 api_key */ }
           // ...
       }
   }
   ```
   这使得新增 AppType 时，编译器会强制要求在此补全凭据解析逻辑。

3. **检测直接返回版本字符串，无结构化结果**
   ```rust
   fn scan_claude_version() -> Result<String, AppError>
   fn scan_cli_version(path: &str) -> Result<String, AppError>
   ```
   成功 = 版本号字符串，失败 = 错误信息。没有 "DetectResult" 包装类型。

4. **没有 "NativeConfig" 强类型**
   cc-switch 甚至将 Provider 的 `settings_config` 直接序列化为 JSON 写入各客户端的配置文件，不做任何中间强类型转换。

### 调研结论与建议方案

**对于 `AgentDetectResult`**：建议定义，但保持极简。

```kotlin
data class AgentDetectResult(
    val version: String,           // 版本号（如 "1.2.3"）
    val executablePath: String?,   // 可执行文件绝对路径（可选，方便诊断）
    val isCompatible: Boolean,     // 版本是否满足最低要求
    val errorMessage: String?      // 检测失败时的可读错误
)
```

- `detect()` 返回 `AgentDetectResult?`（null = 未安装）
- 比 `String?` 更利于 UI 展示（可以显示 "已安装但版本过低" 等中间状态）
- cc-switch 虽然没有这个类型，但其 `ShellProbe` 枚举体现了类似的三态逻辑：`Found` / `FoundButFailed` / `NotFound`

**对于 `AgentNativeConfig`**：建议**不定义统一的接口层强类型**，但鼓励各 Adapter 内部定义自己的数据类。

理由：
1. Claude 用 `{"env": {...}}`，Codex 用 `{"auth": {...}, "config": "..."}`，OpenCode 用 `{"options": {...}}`——**形状差异太大，统一强类型会导致大量可空字段和类型污染**
2. cc-switch 用 `serde_json::Value` 成功支撑了 7 个客户端，证明了松散结构的工程可行性
3. Kotlin 的 `JsonElement` / `JsonObject` 完全可以胜任

**折中改进方案**：

```kotlin
// 不强制统一，但提供通用字段访问接口
interface AgentAdapter {
    // ... 现有方法 ...
    
    /** 返回该 Adapter 支持的所有可配置字段的元数据（供 UI 动态生成表单） */
    val configFields: List<ConfigFieldMeta>
    
    /** 读取单个字段（UI 层调用，无需知道底层结构） */
    suspend fun readConfigField(fieldId: String): String?
    
    /** 写入单个字段 */
    suspend fun writeConfigField(fieldId: String, value: String)
}

data class ConfigFieldMeta(
    val id: String,           // "apiKey"
    val label: String,        // "API Key"
    val type: ConfigFieldType, // Text, Password, Select, Number
    val options: List<String> = emptyList(),  // Select 选项
    val isSensitive: Boolean = false,         // 是否脱敏显示
    val envVarName: String? = null            // 对应环境变量名（如 ANTHROPIC_API_KEY）
)
```

这样 UI 层可以完全通用化——不需要为每个 Agent 写死表单字段，而是通过 `configFields` 动态渲染。

---

## 问题三：AcpConnection.close() 未优雅关闭 stderr reader

### 现状

```kotlin
fun close() {
    readerJob?.cancel()          // ✅ 取消了 stdout reader
    // ❌ 没有取消 stderr reader（connect() 中 scope.launch { ... } 创建的 Job）
    try { writer?.close() } catch (_: Exception) {}
    try { process?.destroyForcibly() } catch (_: Exception) {}
    // ...
}
```

问题：
1. `stderrReader` 协程（第 82-92 行）没有保存其 `Job` 引用，`close()` 无法取消它
2. `destroyForcibly()` 过于粗暴，没有给进程 graceful shutdown 的机会
3. `pendingRequests` 中的等待者会收到异常，但通知处理器（`notificationHandlers`）没有被清理

### cc-switch 的参考价值

c c-switch **没有长期运行的子进程**，它使用 `std::process::Command.output()` 执行短命令（探测版本、读写配置）。因此没有 stderr reader 协程需要管理。

但 cc-switch 的进程错误处理模式值得参考：
- `finish_lifecycle_output()` 提取 stderr 尾部 8 行作为错误详情，避免整段日志淹没 UI
- 区分 `exit 127`（命令不存在）和其他非零退出码（命令存在但执行失败）
- 使用 `last_lines(text, n)` 截断冗长输出

### 调研结论与建议方案

**短期修复（最小改动）**：

```kotlin
class AcpConnection(...) {
    private var stderrJob: Job? = null  // 新增

    suspend fun connect(): Result<Unit> = withContext(Dispatchers.IO) {
        // ...
        stderrJob = scope.launch {  // 保存 Job 引用
            try {
                while (isActive) {
                    val line = stderrReader.readLine() ?: break
                    if (line.isNotBlank()) log.warn { "[$agentId stderr] $line" }
                }
            } catch (_: Exception) { }
        }
        // ...
    }

    fun close() {
        readerJob?.cancel()
        stderrJob?.cancel()          // ✅ 取消 stderr reader
        stderrJob = null
        
        try { writer?.close() } catch (_: Exception) {}
        
        // 先尝试 graceful shutdown，给进程 2 秒时间
        process?.let { p ->
            if (p.isAlive) {
                p.destroy()
                try {
                    if (!p.waitFor(2, java.util.concurrent.TimeUnit.SECONDS)) {
                        p.destroyForcibly()
                    }
                } catch (_: InterruptedException) {
                    p.destroyForcibly()
                }
            }
        }
        
        notificationHandlers.clear()  // 清理通知处理器
        pendingRequests.values.forEach { 
            it.completeExceptionally(Exception("Connection closed")) 
        }
        pendingRequests.clear()
        // ...
    }
}
```

**中期改进（资源管理更健壮）**：

```kotlin
// 使用 Kotlin 的 Closeable 模式，支持 use { }
class AcpConnection(...) : Closeable {
    
    // 用 SupervisorJob + 子 Job 管理所有协程
    private val connectionJob = SupervisorJob()
    private val connectionScope = CoroutineScope(Dispatchers.IO + connectionJob)
    
    suspend fun connect(): Result<Unit> = withContext(Dispatchers.IO) {
        // ...
        // 所有子协程挂在 connectionScope 下
        connectionScope.launch { readLoop(reader) }
        connectionScope.launch { stderrLoop(stderrReader) }
        // ...
    }
    
    override fun close() {
        connectionJob.cancel()  // 一键取消所有子协程
        connectionScope.cancel()
        
        process?.let { gracefulShutdown(it, timeoutMs = 2000) }
        
        notificationHandlers.clear()
        pendingRequests.values.forEach { 
            it.completeExceptionally(Exception("Connection closed")) 
        }
        pendingRequests.clear()
        
        if (status == AgentStatus.CONNECTED) status = AgentStatus.DISCONNECTED
    }
    
    private fun gracefulShutdown(process: Process, timeoutMs: Long) {
        process.destroy()
        val exited = process.waitFor(timeoutMs, java.util.concurrent.TimeUnit.MILLISECONDS)
        if (!exited) {
            log.warn { "[$agentId] Process did not exit gracefully within ${timeoutMs}ms, forcing..." }
            process.destroyForcibly()
        }
    }
}
```

**关键改进点**：

| 问题 | 修复 |
|------|------|
| stderr reader 泄漏 | 保存 `Job` 引用并在 `close()` 中取消 |
| 进程强制杀死 | 先 `destroy()` + `waitFor(2s)`，超时再 `destroyForcibly()` |
| 通知处理器泄漏 | `close()` 中调用 `notificationHandlers.clear()` |
| 作用域管理混乱 | 用 `SupervisorJob` + 专用 `CoroutineScope` 替代全局 `scope` |

---

## 总结对比表

| 问题 | 当前状态 | cc-switch 模式 | 推荐方案 | 优先级 |
|------|---------|---------------|---------|--------|
| Skills 同步未在接口声明 | Adapter 各自实现，上层需类型转换 | Service 层统一管理，Provider 不接触 Skills | **方案 A**：删除 Adapter 的 skills 方法，强化 SkillService；**方案 B**：接口增加默认实现方法 | 中 |
| NativeConfig / DetectResult 无类型 | `String?` + `Map<String, String>` | 松散 `serde_json::Value` + 应用特化解析 | 定义 `AgentDetectResult`；`NativeConfig` 保持松散但增加 `ConfigFieldMeta` 供 UI 通用化 | 低 |
| close() 不优雅 | stderr 协程泄漏 + 强制杀进程 | 无长期进程（参考价值有限） | 保存 stderr Job、graceful shutdown(2s)、SupervisorJob 管理协程生命周期 | **高** |

---

## 附：cc-switch 关键文件索引

| 文件 | 内容 |
|------|------|
| `src/services/skill.rs` | SSOT Skill 存储、SyncMethod/SyncStatus 枚举、全局同步逻辑 |
| `src/session_manager/providers/claude.rs` | Claude provider：read_config/write_config/sessions |
| `src/app_config.rs` | AppType 枚举、McpApps/SkillApps、ProviderManager、MultiAppConfig |
| `src/provider.rs` | Provider 结构体、resolve_usage_credentials（按 AppType 分治） |
| `src/commands/misc.rs` | 进程版本探测、stderr 错误提取、last_lines 截断 |
| `tests/skill_sync.rs` | Skill 同步测试（Auto/Symlink/Copy 策略验证） |
