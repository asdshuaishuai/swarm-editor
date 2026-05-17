# Swarm Editor 开发指南

> 最后更新: 2026-05-17 | 版本: R5933

---

## 开发方向

### 核心战略

**阶段一 (已完成): 基础能力补齐**
- Monaco 编辑器、WebSocket、文件系统、Git、终端
- ACP 协议、Agent 注册表、Session 管理
- LSP 桥接、代码库索引、Diff 视图

**阶段二 (已完成): Agent 深度集成**
- ACP Agent 自动扫描与配置
- MCP 服务器发现与工具浏览
- Skill 扫描 (文件系统 + Agent + MCP)
- Agent 配置面板与连接管理

**阶段三 (当前): 内联智能**
- Tab 补全 (Inline Completion)
- Ghost Text 预览
- 多行补全
- 补全触发策略

**阶段四 (规划中): 多文件编辑与 Background Agent**
- Agent 批量文件修改
- 变更预览与 Accept/Reject
- 异步任务队列
- 后台 Agent 执行

---

## 编码规范

### Go 后端

**文件组织:**
```
internal/
├── acp/          # ACP 协议实现
├── agent/        # Agent 管理与扫描
├── api/          # WebSocket API handlers
│   ├── handler.go           # 路由分发
│   ├── handler_agent.go     # Agent 相关命令
│   ├── handler_mcp.go       # MCP 相关命令
│   ├── handler_session.go   # Session 相关命令
│   └── ...
├── lsp/          # LSP 桥接
├── mcp/          # MCP 客户端
├── swarm/        # 蜂群协调
└── session/      # 会话持久化
```

**命名规范:**
- 包名: 小写单词，无下划线
- 导出函数: PascalCase
- 非导出函数: camelCase
- 常量: PascalCase 或 camelCase
- 接口: 以 `-er` 结尾 (如 `Scanner`, `Checker`)

**错误处理:**
```go
// 使用结构化错误
return nil, errValidation("agent id is required")
return nil, errNotFound("agent not found")
return nil, safeError("failed to load config", err)

// 日志使用 slog
apiLog.Warn("agent scan failed", "error", err)
apiLog.Info("scan completed", "count", len(result))
```

**并发安全:**
- 使用 `sync.RWMutex` 保护共享状态
- 读操作用 `RLock`, 写操作用 `Lock`
- 避免在锁内调用外部函数

### TypeScript 前端

**文件组织:**
```
ui/src/
├── components/       # 通用组件
│   ├── layouts/      # 布局组件
│   └── ...
├── hooks/            # 自定义 hooks
├── panels/           # 面板组件
├── services/         # API 服务层
├── stores/           # Zustand 状态管理
└── utils/            # 工具函数
```

**命名规范:**
- 组件文件: PascalCase (如 `AgentConfigPanel.tsx`)
- Hook 文件: camelCase, `use` 前缀 (如 `useEditorStore.ts`)
- 工具文件: camelCase (如 `monacoLSP.ts`)
- 测试文件: 与源文件同名 + `.test.tsx`

**状态管理:**
```typescript
// 使用 Zustand
export const useAppStore = create<AppState>((set, get) => ({
  // state
  toasts: [],
  // actions
  addToast: (type, title, message) => set((state) => ({
    toasts: [...state.toasts, { id: Date.now(), type, title, message }]
  })),
}))
```

**API 调用:**
```typescript
// 统一通过 api 服务层
import { api } from '../services/api'

// Agent 操作
const agents = await api.agent.getAgents()
const result = await api.agent.testAgent(agentId)

// MCP 操作
const tools = await api.mcp.listTools(serverId)

// Session 操作
const session = await api.session.create(agentId, mode)
const response = await api.session.sendMessage(sessionId, content)
```

**错误处理:**
```typescript
// 使用 logger 记录错误
import { logger } from '../utils/logger'

try {
  await api.agent.startAgent(id)
} catch (err) {
  logger.error('Failed to start agent', err)
  addToast('error', 'Start failed', String(err))
}
```

---

## 测试策略

### 前端测试

**工具:** Vitest + React Testing Library

**覆盖率目标:** 80%+

**测试类型:**
1. **单元测试**: 工具函数、hooks、stores
2. **组件测试**: 面板渲染、用户交互
3. **集成测试**: API 调用、状态变更

**示例:**
```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

// Mock API
vi.mock('../services/api', () => ({
  api: {
    agent: {
      getAgents: vi.fn().mockResolvedValue([]),
      testAgent: vi.fn().mockResolvedValue({ id: 'test', status: 'available' }),
    }
  }
}))

test('renders agent list', async () => {
  render(<AgentScannerPanel />)
  expect(await screen.findByText('Agents')).toBeInTheDocument()
})
```

### 后端测试

**工具:** Go testing + testify

**测试类型:**
1. **单元测试**: 独立函数测试
2. **集成测试**: 需要外部依赖 (文件系统、进程)
3. **API 测试**: WebSocket 命令处理

**示例:**
```go
func TestHandleGetAgents(t *testing.T) {
    h := newTestHandler(t)
    result, err := h.handleGetAgents(context.Background(), nil)
    require.NoError(t, err)
    assert.IsType(t, []AgentInfo{}, result)
}
```

---

## 构建与部署

### 开发环境

```bash
# 1. 克隆仓库
git clone https://github.com/swarm-editor/swarm-editor.git
cd swarm-editor

# 2. 安装依赖
go mod download
cd ui && npm install && cd ..

# 3. 启动开发服务器
cargo tauri dev
```

### 生产构建

```bash
# 前端构建
cd ui && npm run build

# 后端构建
go build -o bin/swarm-editor ./cmd/swarm-editor

# Tauri 打包
cargo tauri build
```

### CI/CD 流程

```yaml
# 5-gate 验证
- go build ./...
- staticcheck ./...
- go vet ./...
- cd ui && npx tsc --noEmit
- cd ui && npm run test
```

---

## 贡献流程

### 分支策略

- `main` — 稳定版本
- `develop` — 开发分支
- `feature/*` — 功能分支
- `fix/*` — 修复分支

### 提交规范

```
<type>(<scope>): <subject>

类型:
- feat: 新功能
- fix: 修复
- docs: 文档
- style: 格式
- refactor: 重构
- test: 测试
- chore: 构建/工具

示例:
feat(agent): add ACP agent auto-discovery
fix(mcp): health check now pings servers
docs(wiki): add architecture overview
```

### Pull Request 流程

1. 创建功能分支: `git checkout -b feature/my-feature`
2. 提交变更: `git commit -m "feat(scope): description"`
3. 推送分支: `git push origin feature/my-feature`
4. 创建 PR 并填写描述
5. 等待 CI 通过 + Code Review
6. 合并到 develop

---

## 常见任务

### 添加新的 WebSocket 命令

1. 在 `internal/api/handler_*.go` 添加 handler:
```go
func (h *CommandHandler) handleMyCommand(ctx context.Context, params json.RawMessage) (any, error) {
    var req struct {
        ID string `json:"id"`
    }
    if err := json.Unmarshal(params, &req); err != nil {
        return nil, safeUnmarshalError(err)
    }
    // 实现逻辑
    return map[string]string{"status": "ok"}, nil
}
```

2. 在 `internal/api/handler.go` 添加路由:
```go
case "my_command":
    return h.handleMyCommand(ctx, params)
```

3. 在 `ui/src/services/api.ts` 添加调用:
```typescript
myCommand: (id: string) => sendRequest('my_command', { id }),
```

### 添加新的前端面板

1. 创建面板组件:
```typescript
// ui/src/panels/MyPanel.tsx
export function MyPanel() {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h2>My Panel</h2>
      </div>
      <div className="flex-1 overflow-auto">
        {/* 内容 */}
      </div>
    </div>
  )
}
```

2. 添加到路由和 ActivityBar
3. 编写测试: `MyPanel.test.tsx`

---

## 性能优化

### 前端

- **代码分割**: 使用 `React.lazy()` 按需加载面板
- **虚拟滚动**: 大列表使用虚拟化
- **防抖**: 输入框使用 `useDebounce`
- **Memo**: 使用 `React.memo` 避免不必要的重渲染

### 后端

- **连接池**: 复用 ACP 连接
- **缓存**: 缓存 Agent 状态、MCP 工具列表
- **并发**: 使用 goroutine 并行扫描
- **超时**: 所有外部调用设置超时

---

## 调试技巧

### 前端调试

```typescript
// 启用详细日志
localStorage.setItem('debug', 'swarm:*')

// 查看 WebSocket 消息
ws.addEventListener('message', console.log)
```

### 后端调试

```bash
# 启用调试日志
SWARM_LOG_LEVEL=debug ./bin/swarm-editor

# 查看 goroutine 泄漏
go tool pprof http://localhost:6060/debug/pprof/goroutine
```

### ACP 调试

```bash
# 手动测试 ACP 连接
echo '{"jsonrpc":"2.0","id":1,"method":"session/create","params":{"mode":"default"}}' | claude acp
```
