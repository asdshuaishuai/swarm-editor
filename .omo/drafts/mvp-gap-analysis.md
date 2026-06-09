# Swarm Editor MVP 差距分析与路线图

> 基于对代码库的全面审查（backend 23 个文件 + desktopApp 20 个文件 + common 7 个文件 + 设计文档 2 份）

---

## 一、当前状态速览

### 一句话总结
**当前 = "有漂亮 UI 的后端骨架"，核心通信链路（Agent ↔ ACP ↔ 流式消息）尚未打通。**

代码完成了：项目结构、UI 组件、REST API、JSON 持久化、ACP 连接管理。但**消息是阻塞式单次请求-响应**，无法展示流式输出的核心体验。

---

## 二、已实现 vs 缺失矩阵

### 后端（Backend）

| 模块 | 状态 | 说明 |
|------|------|------|
| **Service 层骨架** | ✅ 80% | Agent/Session/Mcp/Skill 4 个 Service 都有，StateFlow + CRUD 完整 |
| **Store 层** | ✅ 90% | SessionStore/McpStore/SkillStore JSON 持久化 + Mutex 线程安全 |
| **ACP 连接层** | 🟡 60% | AcpConnection (307 行): connect/initialize/sendPrompt/close 都有，readLoop 完整，**但流式输出、通知业务处理缺失** |
| **Agent 适配器** | 🟡 70% | 5 个适配器基本实现 detect/read/write native config + MCP config，**但 Provider 预设切换未接入 Service** |
| **AgentRegistry** | ✅ 80% | 扫描 PATH、自动注册、配置加载保存 |
| **Ktor REST 路由** | ✅ 85% | agent/session/mcp/skill 路由完整绑定 |
| **MCP 工具调用** | ❌ 0% | 无 tools/list、tools/call 实现 |
| **MCP → Agent 同步** | ❌ 0% | 有 writeMcpConfig 接口，但 Service 层未编排同步逻辑 |
| **Skills → Agent 同步** | ❌ 0% | toggleAgent 只改 SkillStore，未触发 Agent 配置更新 |
| **错误处理/重试** | ❌ 0% | 无连接失败重试、超时降级 |
| **测试** | ❌ 0% | 0 个测试文件 |

### 前端（DesktopApp）

| 模块 | 状态 | 说明 |
|------|------|------|
| **UI 组件层** | ✅ 85% | AgentBar/SessionPanel/ChatArea/RightPanel/SettingsModal 视觉完整 |
| **ViewModel 骨架** | 🟡 60% | 5 个 VM 都有，但 **McpViewModel/SkillViewModel 过于简单（只有 load），SettingsViewModel 功能堆砌** |
| **ApiClient** | ✅ 80% | HTTP 封装完整，但**设计目标要求废弃** |
| **App.kt 主布局** | ✅ 90% | 三栏布局完整 |
| **流式消息渲染** | ❌ 0% | ChatArea 只能显示完整消息，无打字机效果 |
| **实时状态更新** | ❌ 0% | 靠手动轮询 (load)，无 SSE 或 StateFlow 直推 |
| **活动日志 (activities)** | ❌ 0% | UiActivity 有数据结构，无业务逻辑 |
| **错误提示/Loading** | 🟡 30% | isSending 有，但无网络错误、连接失败提示 |

### 架构与质量

| 维度 | 状态 | 说明 |
|------|------|------|
| **嵌入式架构迁移** | ❌ 0% | 设计目标：ViewModel → 直连 Service。当前：ViewModel → ApiClient → HTTP → Ktor Route → Service |
| **测试覆盖** | ❌ 0% | 无单元测试、无集成测试、无 UI 测试 |
| **设计文档对齐** | 🟡 50% | 代码结构基本对齐 spec，但 spec 要求的"无网络"架构未实现 |

---

## 三、距离"真正可交互 MVP"还差什么

### MVP 定义（来自设计文档）
> 端到端可交互：用户选择 Agent → 连接 → 创建会话 → 发送消息 → **实时看到流式回复** → 管理 MCP/Skills → 配置同步到 Agent

### 当前阻断性问题（没有这些就不算 MVP）

1. **消息流是阻塞式的**
   - 现状：`sendPrompt()` 等待 Agent 完整响应后才返回 → 前端显示"发送中..." → 突然跳出完整回复
   - MVP 要求：逐字/逐块流式输出，用户看到"打字机效果"
   - 影响：核心用户体验缺失

2. **前端通过 HTTP 轮询，非实时**
   - 现状：Agent 连接状态、消息更新靠前端手动调用 `load()`
   - MVP 要求：StateFlow 驱动 UI 自动刷新，或至少 SSE 推送
   - 影响：状态不同步，体验卡顿

3. **MCP 工具调用未实现**
   - 现状：McpServerConfig 只有配置存储，无 tools/list、tools/call
   - MVP 要求：Agent 可以调用 MCP 工具，用户能看到工具执行过程
   - 影响：MCP 功能只是"配置编辑器"，不是"工具调用"

4. **MCP/Skills 配置未同步到 Agent**
   - 现状：用户在 UI 修改 MCP/Skills，只改了 Swarm Editor 的 JSON 文件，Agent 原生配置未更新
   - MVP 要求：修改后自动同步到 `~/.claude.json`、`~/.kimi/mcp.json` 等
   - 影响：配置"各管各的"，Agent 实际运行时看不到用户配的 MCP

5. **架构未迁移到嵌入式**
   - 现状：跑两个进程（backend + desktopApp），desktop 调 `localhost:8080`
   - MVP 要求：单个进程，Service 层直接注入到 ViewModel
   - 影响：部署复杂、状态同步困难、与 spec 不符

### 次要缺失（有更好，没有也能用）

6. **无测试** — 无法保证重构安全
7. **无错误处理** — 连接失败、Agent 崩溃无提示
8. **无活动日志** — 无法展示 Agent "正在思考"、"调用工具"等中间状态
9. **Settings 功能堆砌** — SettingsViewModel 同时管 Agent 配置、MCP、Skills，未按面板拆分
10. **无 Agent 配置验证** — 保存配置时不校验必填字段

---

## 四、量化评估

| 维度 | 当前完成度 | MVP 要求 | 差距 |
|------|-----------|---------|------|
| 后端骨架（Service/Store/Route）| 80% | 100% | 小 |
| ACP 通信协议 | 60% | 100% | **中**（缺流式、缺通知处理） |
| Agent 适配器 | 70% | 100% | 中 |
| 前端 UI 组件 | 85% | 95% | 小 |
| 前端状态管理 | 50% | 100% | **大**（缺实时、缺流式） |
| MCP 工具调用 | 0% | 100% | **大** |
| MCP/Skills 同步 | 0% | 100% | **大** |
| 嵌入式架构 | 0% | 100% | **大** |
| 测试覆盖 | 0% | 60% | **大** |
| **综合** | **~45%** | **100%** | **~55% 差距** |

**结论：当前约完成 45%，距离可交互 MVP 还有 55% 的工作量。**

---

## 五、推荐路线图（按优先级排序）

### Phase 1: 核心通信打通（最高优先级，阻塞级）
1. **ACP 流式消息支持**
   - AcpConnection 增加流式 sendPrompt（返回 Flow<String> 或 Channel）
   - readLoop 解析 session/update 通知，驱动流式输出
2. **前端流式渲染**
   - ChatArea 支持增量更新消息内容
   - ViewModel 用 StateFlow/Channel 收集流式片段
3. **嵌入式架构迁移**
   - desktopApp 依赖 backend 模块
   - ViewModel 直接注入 Service 实例（替代 ApiClient）
   - 移除 Ktor server 启动（或可选启动）

### Phase 2: MCP 功能完整化
4. **MCP 工具调用**
   - 实现 tools/list、tools/call JSON-RPC 方法
   - McpService 管理工具客户端连接
5. **MCP → Agent 同步**
   - McpService.upsert/delete 后自动调用 AgentAdapter.writeMcpConfig()
6. **Skills → Agent 同步**
   - SkillService.toggleAgent 后同步到 Agent 原生配置

### Phase 3: 体验与质量
7. **ACP 通知业务处理**
   - 订阅 session/update、progress 等通知
   - 驱动 UiActivity（"正在思考..."、"调用 xxx 工具"）
8. **错误处理与重试**
   - 连接失败重试（指数退避）
   - 前端错误提示（Toast/Modal）
9. **测试覆盖**
   - SessionStore、McpStore、SkillStore 单元测试
   - AgentService 集成测试（mock AcpConnection）
   - ViewModel 测试（kotlinx-coroutines-test）

### Phase 4: 架构收尾
10. **废弃 HTTP 层**
    - 删除 ApiClient（或标记 deprecated）
    - 清理 Ktor Route（如果不再需要）
    - 验证单机运行流程

---

## 六、风险点

| 风险 | 等级 | 说明 |
|------|------|------|
| **ACP 协议流式支持不确定** | 🔴 高 | 需要确认 ACP SDK/CLI 是否支持流式返回（session/update 通知） |
| **嵌入式架构耦合度** | 🟡 中 | desktopApp 依赖 backend 会增加编译时间和模块耦合 |
| **MCP 工具调用复杂度** | 🟡 中 | 需要启动和管理外部 MCP Server 进程 |
| **多 Agent 配置格式差异** | 🟡 中 | Claude(Qwen/Kimi 的 MCP 配置格式不同，同步逻辑复杂 |
| **Compose Desktop 流式渲染性能** | 🟢 低 | Compose 的 StateFlow 驱动重组应该能胜任 |

---

## 七、现有代码值得保留的部分

以下模块质量较高，可直接沿用：

1. **AcpConnection.kt** — JSON-RPC 2.0 实现完整，只需扩展流式输出
2. **SessionStore/McpStore/SkillStore** — 持久化逻辑完整，Mutex 保护正确
3. **UI 组件** — Theme、ChatArea、AgentBar 视觉完整
4. **Agent 适配器** — native config I/O 已实现，只需接入同步触发点
5. **Service 层骨架** — StateFlow 模式正确，只需填充业务逻辑

---

## 八、与现有实现计划文档的对比

`docs/superpowers/plans/2026-06-08-mvp-deep-implementation.md` 中列出的任务：

| 计划中的任务 | 当前状态 |
|-------------|---------|
| SessionStore 实现 | ✅ 已完成 |
| AgentService 实现 | 🟡 骨架有，缺流式、缺同步 |
| McpService 实现 | 🟡 骨架有，缺工具调用、缺同步 |
| SkillService 实现 | 🟡 骨架有，缺同步 |
| ViewModel 绑定 | 🟡 HTTP 绑定有，缺嵌入式直调 |
| 测试 | ❌ 未开始 |

**现有实现计划低估了工作量的部分：**
- 未包含嵌入式架构迁移
- 未包含流式消息输出
- 未包含 MCP 工具调用
- 未包含配置同步到 Agent

---

*评估日期: 2026-06-09 | 评估人: Prometheus (AI Planner)*
*基于: backend/src/main/kotlin 23 文件 + desktopApp/src/main/kotlin 20 文件 + common/src/commonMain/kotlin 7 文件 + 设计文档 2 份*
