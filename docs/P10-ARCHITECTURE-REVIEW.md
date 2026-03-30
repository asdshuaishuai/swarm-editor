# Swarm Editor P10 架构审查报告

## 调研日期: 2026-03-22

---

## 一、Agent CLI 配置调研结果

### 1.1 已检测到的 Coding Agent CLI

| Agent | 版本 | 配置路径 | 配置格式 | Provider | MCP 支持 |
|-------|------|----------|----------|----------|----------|
| Claude Code | 2.1.81 | `~/.claude/config.json` | JSON | Anthropic | ✅ 内置 |
| Kimi Code | 1.24.0 | `~/.kimi/config.toml` | TOML | Moonshot | ✅ 内置 |
| OpenCode | 1.2.27 | `~/.config/opencode/opencode.json` | JSON | Multi | ✅ 内置 |
| Crush CLI | v0.51.2 | `~/.config/crush/crush.json` | JSON | Multi | ✅ 内置 |
| Gemini CLI | 0.34.0 | `~/.gemini/settings.json` | JSON | Google | ✅ 内置 |
| Qwen Code | 0.12.6 | `~/.qwen/settings.json` | JSON | Alibaba | ✅ 内置 |
| Droid CLI | 0.83.0 | `~/.factory/settings.json` | JSON | Factory | ✅ 内置 |

### 1.2 配置文件结构详解

#### Claude Code (`~/.claude/config.json`)
```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "sk-xxx",
    "ANTHROPIC_BASE_URL": "http://...",
    "ANTHROPIC_MODEL": "claude-opus-4-6"
  },
  "statusLine": { "enabled": true },
  "enabledPlugins": { ... }
}
```
**特点**:
- 使用环境变量配置 API
- 支持 plugins 扩展
- 配置路径: `~/.claude/`

#### Kimi Code (`~/.kimi/config.toml`)
```toml
default_model = "kimi"
[models.kimi]
provider = "anthropic"
model = "kimi-k2.5"
[providers.anthropic]
base_url = "http://..."
api_key = "sk-xxx"
```
**特点**:
- 使用 TOML 格式（唯一）
- 支持多模型配置
- 配置路径: `~/.kimi/`

#### OpenCode (`~/.config/opencode/opencode.json`)
```json
{
  "mcp": {
    "web-reader": { "enabled": true, "type": "remote", "url": "..." },
    "zai-mcp-server": { "command": ["npx", "-y", "@z_ai/mcp-server"], ... }
  },
  "model": "zhipuai-coding-plan/glm-4.6",
  "provider": {
    "volcengine": { "base_url": "...", "api_key": "..." },
    "xaio": { ... }
  }
}
```
**特点**:
- 支持多 Provider 切换
- MCP 服务器内置配置
- 配置路径: `~/.config/opencode/`

#### Crush CLI (`~/.config/crush/crush.json`)
```json
{
  "providers": {
    "zai": {
      "base_url": "https://open.bigmodel.cn/api/coding/paas/v4",
      "api_key": "sk-xxx"
    }
  },
  "mcp": {
    "zai-mcp-server": { "type": "stdio", "command": "npx", ... },
    "web-search-prime": { "type": "http", "url": "..." }
  }
}
```
**特点**:
- Provider 和 MCP 分离配置
- 支持 stdio 和 http 两种 MCP 类型
- 配置路径: `~/.config/crush/`

#### Gemini CLI (`~/.gemini/settings.json`)
```json
{
  "security": {
    "auth": { "selectedType": "oauth-personal" }
  },
  "general": {
    "previewFeatures": true,
    "enableAutoUpdate": true
  }
}
```
**特点**:
- OAuth 认证为主
- Google 账户集成
- 配置路径: `~/.gemini/`

#### Qwen Code (`~/.qwen/settings.json`)
```json
{
  "security": {
    "auth": { "selectedType": "qwen-oauth" }
  },
  "model": { "name": "coder-model" }
}
```
**特点**:
- 阿里云 OAuth 认证
- 通义千问模型
- 配置路径: `~/.qwen/`

#### Droid CLI (`~/.factory/settings.json` + `mcp.json`)
```json
// settings.json
{
  "customModels": [
    {
      "displayName": "GLM-4.7",
      "model": "glm-4.7",
      "baseUrl": "https://...",
      "apiKey": "sk-xxx",
      "provider": "anthropic",
      "maxOutputTokens": 131072
    }
  ]
}

// mcp.json
{
  "mcpServers": {
    "zai-mcp-server": { "type": "stdio", "command": "npx", ... },
    "web-search-prime": { "type": "http", "url": "...", "headers": {...} }
  }
}
```
**特点**:
- 配置分离（settings + mcp）
- 支持自定义模型列表
- **配置路径: `~/.factory/`** (注意：不是 `~/.droid`!)

### 1.3 配置路径修正

当前 `scanner.go` 中 Droid CLI 的配置路径错误:

```go
// 错误 ❌
ConfigPaths: []string{"~/.droid", "~/.config/droid"},

// 正确 ✅
ConfigPaths: []string{"~/.factory", "~/.config/factory"},
```

---

## 二、LSP 工具链调研结果

### 2.1 当前系统 LSP 状态

| 语言 | LSP Server | 安装状态 | 检测命令 |
|------|------------|----------|----------|
| Rust | rust-analyzer | ✅ 已安装 | `rust-analyzer --version` |
| Go | gopls | ✅ 已安装 | `gopls version` |
| Python | pyright/pylance | ❌ 未安装 | `pyright --version` |
| Java | jdtls | ❌ 未安装 | `jdtls --version` |
| C# | omnisharp | ❌ 未安装 | `omnisharp --version` |
| MoonBit | moon | ❌ 未安装 | `moon version` |

### 2.2 LSP 安装方案

```bash
# Python
npm install -g pyright

# Java (需要手动下载)
# https://download.eclipse.org/jdtls/

# C#
dotnet tool install -g OmniSharp

# MoonBit
# https://www.moonbitlang.com/download/
```

---

## 三、协议支持分析

### 3.1 ACP (Agent Communication Protocol)

**定义**: AI Agent 与客户端之间的通信协议

| Agent | ACP 支持 | 实现方式 |
|-------|----------|----------|
| Claude Code | ✅ | 内置 Anthropic 协议 |
| Kimi Code | ✅ | Anthropic 兼容 |
| OpenCode | ✅ | Anthropic/OpenAI 双协议 |
| Crush CLI | ✅ | Anthropic 兼容 |
| Gemini CLI | ✅ | Google AI 协议 |
| Qwen Code | ✅ | 阿里云协议 |
| Droid CLI | ✅ | Factory 协议 |

### 3.2 A2A (Agent-to-Agent)

**定义**: Agent 之间的协作通信协议

当前 Swarm Editor 实现状态:
- ✅ `internal/swarm/handoff.go` - Agent Handoff 机制
- ✅ `internal/swarm/a2a_protocol.go` - A2A 消息类型
- ✅ Queen Bee 共识机制

### 3.3 MCP (Model Context Protocol)

**定义**: 工具/上下文集成协议

所有检测到的 Agent CLI 都支持 MCP:
- **stdio** 类型: 通过子进程通信
- **http** 类型: 通过 HTTP/SSE 通信

---

## 四、战略行动方案

### P0: 核心基础设施 (Week 1-2)

#### P0-1: Agent CLI 扫描系统 (已完成调研)

**任务**:
1. 修复 Droid CLI 配置路径 (`~/.factory`)
2. 实现 TOML 配置解析器 (Kimi Code)
3. 实现配置统一抽象层
4. 添加 MCP 服务器发现

**代码修改**:
```
internal/agent/scanner.go      # 修复配置路径
internal/agent/config_parser.go # 新增：多格式配置解析
internal/agent/mcp_discovery.go # 新增：MCP 服务器发现
```

#### P0-2: UI 三栏布局重构

**布局**:
```
┌──────────────┬──────────────────────┬──────────────────────┐
│              │                      │                      │
│   工作区      │       编辑区          │    Agent 调度区       │
│   Workspace  │       Editor         │    Agent Dispatch    │
│              │                      │                      │
│  - 文件树     │   - 代码编辑          │   - Agent 对话       │
│  - 项目列表   │   - LSP 集成          │   - 任务状态         │
│  - 会话历史   │   - 预览              │   - 蜂群调度可视化    │
│              │                      │                      │
│  200px       │      flex-1          │      300px          │
│              │                      │                      │
└──────────────┴──────────────────────┴──────────────────────┘
```

**UI 设计风格**:
- 抛弃 VSCode 风格
- 采用现代化设计（参考 Linear/Raycast/Arc）
- 深色主题为主
- 圆角 + 毛玻璃效果
- 微动画 + 流畅过渡

#### P0-3: 蜂群调度可视化

**功能**:
1. Agent 节点可视化（网络图）
2. 任务流转动画
3. 数据变动实时显示
4. 共识过程可视化
5. Emergence Dashboard 增强

#### P0-4: LSP 多语言支持

**任务**:
1. LSP 自动扫描和发现
2. 按需安装缺失的 LSP
3. LSP 状态面板
4. 多语言支持配置

### P1: 功能增强 (Week 3-4)

#### P1-1: Agent 会话管理
- 会话历史持久化
- 会话切换和恢复
- 工作上下文保存

#### P1-2: Team 模型增强
- 人-Agent 结对编程
- 无领导小组模式
- 任务分配策略

#### P1-3: 设置面板
- Agent 配置统一管理
- LSP 配置
- 主题设置

---

## 五、技术实现细节

### 5.1 配置解析器接口

```go
// internal/agent/config_parser.go

type ConfigParser interface {
    Parse(path string) (*AgentConfig, error)
    Format() string
}

type JSONConfigParser struct{}
type TOMLConfigParser struct{}

func (p *JSONConfigParser) Parse(path string) (*AgentConfig, error) {
    // JSON 解析
}

func (p *TOMLConfigParser) Parse(path string) (*AgentConfig, error) {
    // TOML 解析 (Kimi Code)
}
```

### 5.2 MCP 服务器发现

```go
// internal/agent/mcp_discovery.go

type MCPServerInfo struct {
    Name     string
    Type     string // "stdio" or "http"
    Command  []string
    URL      string
    Headers  map[string]string
    Env      map[string]string
    Disabled bool
}

func (s *Scanner) DiscoverMCP(agent *AgentCLI) ([]MCPServerInfo, error) {
    // 从 agent 配置中发现 MCP 服务器
}
```

### 5.3 LSP 扫描器

```go
// internal/lsp/scanner.go

type LSPServer struct {
    Language   string
    ServerName string
    Path       string
    Version    string
    Status     LSPStatus
}

type LSPScanner struct {
    knownServers []KnownLSPServer
}

func (s *LSPScanner) Scan() ([]LSPServer, error) {
    // 扫描系统已安装的 LSP 服务器
}
```

---

## 六、UI 重构设计规范

### 6.1 设计原则

1. **极简主义**: 减少视觉噪音
2. **信息密度**: 高效利用空间
3. **一致性**: 统一的设计语言
4. **可访问性**: 高对比度，清晰可读

### 6.2 颜色系统

```css
/* 主色调 */
--primary: #6366f1;        /* 靛蓝 */
--primary-light: #818cf8;
--primary-dark: #4f46e5;

/* 背景 */
--bg-base: #0f0f10;        /* 近黑 */
--bg-surface: #1a1a1c;     /* 卡片背景 */
--bg-elevated: #242426;    /* 悬浮元素 */

/* 文字 */
--text-primary: #ffffff;
--text-secondary: #a1a1aa;
--text-muted: #71717a;

/* 状态色 */
--success: #22c55e;
--warning: #eab308;
--error: #ef4444;
--info: #3b82f6;
```

### 6.3 组件规范

```css
/* 圆角 */
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;

/* 间距 */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;

/* 阴影 */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
--shadow-md: 0 4px 6px rgba(0,0,0,0.4);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.5);
```

---

## 七、实施时间表

| 阶段 | 任务 | 预计时间 | 优先级 |
|------|------|----------|--------|
| Week 1 | P0-1: Agent CLI 扫描修复 | 2 天 | P0 |
| Week 1 | P0-4: LSP 扫描实现 | 3 天 | P0 |
| Week 2 | P0-2: UI 三栏布局重构 | 5 天 | P0 |
| Week 2 | P0-3: 蜂群调度可视化 | 3 天 | P0 |
| Week 3 | P1-1: 会话管理 | 3 天 | P1 |
| Week 3 | P1-3: 设置面板 | 3 天 | P1 |
| Week 4 | P1-2: Team 模型增强 | 3 天 | P1 |
| Week 4 | 测试和优化 | 2 天 | P1 |

---

## 八、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| TOML 解析复杂 | 中 | 使用成熟库 `github.com/pelletier/go-toml` |
| UI 重构范围大 | 高 | 分阶段实施，保持功能可用 |
| LSP 兼容性 | 中 | 实现通用 LSP 客户端接口 |
| Agent 协议差异 | 中 | 统一抽象层 + 适配器模式 |

---

## 九、结论

本次调研完成了 7 种 Coding Agent CLI 的配置格式分析，发现了 Droid CLI 配置路径错误的问题，并制定了完整的战略行动方案。

**下一步行动**:
1. 立即修复 `scanner.go` 中 Droid CLI 配置路径
2. 实现 TOML 配置解析器
3. 开始 UI 三栏布局重构
4. 实现 LSP 自动扫描

---

*报告生成: 2026-03-22*
*作者: P10 CTO Architecture Review*
