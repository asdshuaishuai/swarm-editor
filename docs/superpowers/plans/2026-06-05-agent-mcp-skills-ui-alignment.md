# Agent / MCP / Skills UI 对齐 + 通信层迁移 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Swarm Editor 的 13 个 UI 模块与设计 mockup 对齐，同时将通信层从 WebSocket 迁移到 Unix Socket + Tauri IPC。

**Architecture:** 前端 React/Tauri v2 桌面客户端通过 Tauri IPC `invoke()` 调用 Go 后端的 Unix Socket 服务。保留 WebSocket 作为 fallback。UI 对齐主要涉及 Tailwind 类名和 inline style 调整。

**Tech Stack:** Go, TypeScript, React, Tauri v2, Zustand, Tailwind CSS, SVG

---

## 已完成的任务（无需实现）

以下任务在代码库中已完整实现：

| Task | 描述 | 验证 |
|------|------|------|
| 1 | Agent 注册修复 | `handler_agent.go:108-124` 已有 configAgents 第 4 数据源 |
| 2 | MCP 扫描修复 | `monitoringStore.ts:357-364` 已调 `api.mcp.scanServers()` |
| 3 | Skills 扫描修复 | `monitoringStore.ts:366-381` 有 async 双路径 + `skills_scanned` 事件 |
| 5 | Agent ConfigSync | `internal/agent/agent_config_sync.go` 已实现 4 个 agent |
| 6 | Agent 配置 API | `handler.go:85-87` 已注册 `get_agent_config` / `update_agent_config` |
| 7 | Agent ConfigModal | `AgentConfigModal.tsx` 665 行，basic + native 双模式 |
| 8 | 统一 MCP 存储 | `unified_store.go` 已有 4 agent（claude/opencode/qwen/kimi） |
| 9 | Agent MCP 同步 | `agent_sync.go` 已有 4 个 Writer |
| 10 | MCP IPC API | `handler_mcp.go` 已有 5 个 unified handler |
| 11 | MCP Panel UI | `MCPPanel.tsx` 1069 行，UnifiedServerCard + MCPServerCard |
| 11a | MCP 配置 Modal | `MCPPanel.tsx:718-919` 内嵌 MCPConfigModal |
| 12 | Skills 统一存储 | `internal/agent/unified_skill_store.go` 已实现 |
| 13 | Skills 面板 UI | `MCPPanel.tsx:307-373` Skills 区域已实现 |
| 16 | 标题栏/状态栏 | `MainLayout.tsx:173-177` 已是中文，无 QUEEN AGENT 文字 |

---

## Task 1: WebSocket → Unix Socket + Tauri IPC 通信层迁移

**目标**: 用 Unix Socket + Tauri IPC 替代 WebSocket JSON-RPC 2.0

**Files:**
- Create: `internal/api/unix_socket_server.go`
- Create: `internal/api/unix_socket_server_test.go`
- Modify: `ui/src-tauri/src/lib.rs`
- Modify: `ui/src-tauri/Cargo.toml`
- Create: `ui/src/services/ipcClient.ts`
- Modify: `ui/src/services/api.ts`
- Modify: `ui/src/stores/monitoringStore.ts`

- [ ] **Step 1: Write Unix Socket server test**

```go
// internal/api/unix_socket_server_test.go
package api

import (
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestUnixSocketServer_StartStop(t *testing.T) {
	sockPath := filepath.Join(t.TempDir(), "swarm.sock")
	srv := NewUnixSocketServer(sockPath, nil)
	if err := srv.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer srv.Stop()

	if _, err := os.Stat(sockPath); err != nil {
		t.Fatalf("socket file not created: %v", err)
	}
}

func TestUnixSocketServer_HandleCommand(t *testing.T) {
	sockPath := filepath.Join(t.TempDir(), "swarm.sock")
	handler := &mockCommandHandler{
		responses: map[string]any{
			"ping": map[string]string{"status": "ok"},
		},
	}
	srv := NewUnixSocketServer(sockPath, handler)
	if err := srv.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer srv.Stop()

	conn, err := net.Dial("unix", sockPath)
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	defer conn.Close()

	req := json.RawMessage(`{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}`)
	frame := append(req, '\n')
	if _, err := conn.Write(frame); err != nil {
		t.Fatalf("Write: %v", err)
	}

	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 4096)
	n, err := conn.Read(buf)
	if err != nil {
		t.Fatalf("Read: %v", err)
	}

	var resp map[string]any
	if err := json.Unmarshal(buf[:n], &resp); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if resp["jsonrpc"] != "2.0" {
		t.Errorf("expected jsonrpc 2.0, got %v", resp["jsonrpc"])
	}
}

type mockCommandHandler struct {
	responses map[string]any
}

func (m *mockCommandHandler) HandleCommand(method string, params json.RawMessage, clientID string) (any, error) {
	if resp, ok := m.responses[method]; ok {
		return resp, nil
	}
	return nil, fmt.Errorf("unknown method: %s", method)
}
```

- [ ] **Step 2: Implement Unix Socket server**

```go
// internal/api/unix_socket_server.go
package api

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"sync"
)

type CommandHandler interface {
	HandleCommand(method string, params json.RawMessage, clientID string) (any, error)
}

type UnixSocketServer struct {
	sockPath string
	handler  CommandHandler
	listener net.Listener
	wg       sync.WaitGroup
	cancel   context.CancelFunc
}

func NewUnixSocketServer(sockPath string, handler CommandHandler) *UnixSocketServer {
	return &UnixSocketServer{
		sockPath: sockPath,
		handler:  handler,
	}
}

func (s *UnixSocketServer) Start() error {
	os.Remove(s.sockPath)
	ln, err := net.Listen("unix", s.sockPath)
	if err != nil {
		return fmt.Errorf("listen unix: %w", err)
	}
	s.listener = ln

	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel

	s.wg.Add(1)
	go s.acceptLoop(ctx)
	return nil
}

func (s *UnixSocketServer) Stop() {
	if s.cancel != nil {
		s.cancel()
	}
	if s.listener != nil {
		s.listener.Close()
	}
	s.wg.Wait()
	os.Remove(s.sockPath)
}

func (s *UnixSocketServer) acceptLoop(ctx context.Context) {
	defer s.wg.Done()
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				return
			default:
				continue
			}
		}
		s.wg.Add(1)
		go s.handleConn(ctx, conn)
	}
}

type jsonRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type jsonRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *jsonRPCError   `json:"error,omitempty"`
}

type jsonRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (s *UnixSocketServer) handleConn(ctx context.Context, conn net.Conn) {
	defer s.wg.Done()
	defer conn.Close()

	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024) // 1MB max

	for scanner.Scan() {
		var req jsonRPCRequest
		if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
			s.writeResponse(conn, jsonRPCResponse{
				JSONRPC: "2.0",
				Error:   &jsonRPCError{Code: -32700, Message: "parse error"},
			})
			continue
		}

		result, err := s.handler.HandleCommand(req.Method, req.Params, "unix-socket")
		resp := jsonRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
		}
		if err != nil {
			resp.Error = &jsonRPCError{Code: -32000, Message: err.Error()}
		} else {
			resp.Result = result
		}
		s.writeResponse(conn, resp)
	}
}

func (s *UnixSocketServer) writeResponse(conn net.Conn, resp jsonRPCResponse) {
	data, _ := json.Marshal(resp)
	data = append(data, '\n')
	conn.Write(data)
}

func (s *UnixSocketServer) Broadcast(method string, params any) {
	// Broadcast is handled via Tauri events, not socket
}
```

- [ ] **Step 3: Run test to verify**

Run: `go test -v -run TestUnixSocket ./internal/api/`
Expected: PASS

- [ ] **Step 4: Add Tauri IPC bridge**

```rust
// ui/src-tauri/src/lib.rs — add IPC command
use std::os::unix::net::UnixStream;
use std::io::{Write, BufRead, BufReader};

#[tauri::command]
async fn swarm_invoke(method: String, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let sock_path = dirs::home_dir()
        .ok_or("no home dir")?
        .join(".swarm-editor")
        .join("swarm.sock");

    let mut stream = UnixStream::connect(&sock_path)
        .map_err(|e| format!("connect: {}", e))?;

    let req = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    });

    let mut payload = serde_json::to_vec(&req).map_err(|e| e.to_string())?;
    payload.push(b'\n');
    stream.write_all(&payload).map_err(|e| e.to_string())?;

    let reader = BufReader::new(&stream);
    let line = reader.lines().next()
        .ok_or("no response")?
        .map_err(|e| e.to_string())?;

    let resp: serde_json::Value = serde_json::from_str(&line)
        .map_err(|e| format!("parse: {}", e))?;

    if let Some(err) = resp.get("error") {
        Err(format!("rpc error: {}", err))
    } else {
        Ok(resp.get("result").cloned().unwrap_or(serde_json::Value::Null))
    }
}

// In main():
.invoke_handler(tauri::generate_handler![swarm_invoke, ...])
```

Update `Cargo.toml`:
```toml
[dependencies]
dirs = "5"
```

- [ ] **Step 5: Create IPC client for frontend**

```typescript
// ui/src/services/ipcClient.ts
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface IPCClient {
  invoke(method: string, params?: any): Promise<any>;
  subscribe(event: string, handler: (payload: any) => void): UnlistenFn;
}

export function createIPCClient(): IPCClient {
  return {
    async invoke(method: string, params: any = {}) {
      return invoke('swarm_invoke', { method, params });
    },
    subscribe(event: string, handler: (payload: any) => void) {
      const unlisten = listen(event, (e) => handler(e.payload));
      // listen returns a Promise<UnlistenFn> in Tauri v2
      let unlistenFn: UnlistenFn | null = null;
      unlisten.then(fn => { unlistenFn = fn; });
      return () => { unlistenFn?.(); };
    },
  };
}
```

- [ ] **Step 6: Update api.ts to use IPC client**

```typescript
// ui/src/services/api.ts — replace getClient()
import { createIPCClient, type IPCClient } from './ipcClient';

let _client: IPCClient | null = null;

function getClient(): IPCClient {
  if (!_client) {
    _client = createIPCClient();
  }
  return _client;
}

// All existing api methods continue to work since they use getClient().invoke()
```

- [ ] **Step 7: Update monitoringStore event subscriptions**

```typescript
// ui/src/stores/monitoringStore.ts — replace events.subscribe with Tauri listen
import { listen } from '@tauri-apps/api/event';

// In subscribeToEvents():
const unlisteners: (() => void)[] = [];

const on = (event: string, handler: (data: any) => void) => {
  listen(event, (e) => handler(e.payload)).then(fn => unlisteners.push(fn));
};

on('audit_event', (data) => { ... });
on('mcp_servers_scanned', (data) => { ... });
on('skills_scanned', (data) => { ... });
// ... all other events
```

- [ ] **Step 8: Run TypeScript check and tests**

Run: `cd ui && npx tsc --noEmit && npx vitest run`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add internal/api/unix_socket_server.go internal/api/unix_socket_server_test.go
git add ui/src-tauri/src/lib.rs ui/src-tauri/Cargo.toml
git add ui/src/services/ipcClient.ts ui/src/services/api.ts ui/src/stores/monitoringStore.ts
git commit -m "feat: migrate WebSocket to Unix Socket + Tauri IPC"
```

---

## Task 2: MCP 导入 Modal

**目标**: 从 MCP 面板 "导入" 按钮打开 Modal，展示扫描来源 + checkbox 选择 + 批量导入

**Files:**
- Create: `ui/src/components/MCPImportModal.tsx`
- Create: `ui/src/components/MCPImportModal.test.tsx`
- Modify: `ui/src/panels/MCPPanel.tsx`

- [ ] **Step 1: Write MCPImportModal test**

```typescript
// ui/src/components/MCPImportModal.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MCPImportModal from './MCPImportModal';

const mockScanned = [
  { name: 'filesystem', type: 'stdio', command: 'npx @anthropic/mcp-fs', source: 'claude' },
  { name: 'github', type: 'stdio', command: 'npx @anthropic/mcp-gh', source: 'claude' },
  { name: 'memory', type: 'stdio', command: 'npx @anthropic/mcp-mem', source: 'kimi' },
];

describe('MCPImportModal', () => {
  it('renders scanned servers with checkboxes', () => {
    render(<MCPImportModal scanned={mockScanned} onImport={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('filesystem')).toBeInTheDocument();
    expect(screen.getByText('github')).toBeInTheDocument();
    expect(screen.getByText('memory')).toBeInTheDocument();
    expect(screen.getByText('已选 3 / 3')).toBeInTheDocument();
  });

  it('toggles checkbox selection', () => {
    render(<MCPImportModal scanned={mockScanned} onImport={vi.fn()} onClose={vi.fn()} />);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // uncheck first
    expect(screen.getByText('已选 2 / 3')).toBeInTheDocument();
  });

  it('calls onImport with selected servers', () => {
    const onImport = vi.fn();
    render(<MCPImportModal scanned={mockScanned} onImport={onImport} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('导入选中'));
    expect(onImport).toHaveBeenCalledWith(mockScanned);
  });

  it('shows source agent labels', () => {
    render(<MCPImportModal scanned={mockScanned} onImport={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getAllByText('Claude').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Kimi').length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ui && npx vitest run MCPImportModal.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement MCPImportModal**

```tsx
// ui/src/components/MCPImportModal.tsx
import { useState, useMemo } from 'react';

interface ScannedServer {
  name: string;
  type: string;
  command?: string;
  url?: string;
  source: string;
}

interface Props {
  scanned: ScannedServer[];
  onImport: (selected: ScannedServer[]) => void;
  onClose: () => void;
}

const SOURCE_COLORS: Record<string, string> = {
  claude: '#fb923c',
  kimi: '#22d3ee',
  opencode: '#a78bfa',
  qwen: '#f778ba',
};

export default function MCPImportModal({ scanned, onImport, onClose }: Props) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(scanned.map((_, i) => i)));

  const toggle = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const selectedServers = useMemo(() => scanned.filter((_, i) => selected.has(i)), [scanned, selected]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[460px] rounded-lg overflow-hidden" style={{ background: '#1a1f26', border: '1px solid #30363d' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #30363d' }}>
          <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#d0d7de' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            导入 MCP 服务器
          </span>
          <button onClick={onClose} style={{ color: '#6b7280' }} className="text-lg cursor-pointer">&times;</button>
        </div>

        {/* Server list */}
        <div className="px-4 py-3" style={{ maxHeight: 280, overflowY: 'auto' }}>
          <div className="text-[9px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#8b949e' }}>
            发现的服务器 ({scanned.length})
          </div>
          <div className="flex flex-col gap-1">
            {scanned.map((s, i) => (
              <label
                key={i}
                className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer"
                style={{ background: 'rgba(33,38,45,0.5)', border: '1px solid #30363d' }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggle(i)}
                  style={{ accentColor: '#58a6ff', width: 14, height: 14 }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold" style={{ color: '#d1d5db' }}>{s.name}</div>
                  <div className="text-[8px] font-mono truncate" style={{ color: '#6b7280' }}>
                    {s.command || s.url}
                  </div>
                </div>
                <span
                  className="text-[8px] px-1 rounded"
                  style={{
                    background: `${SOURCE_COLORS[s.source] || '#6b7280'}15`,
                    color: SOURCE_COLORS[s.source] || '#6b7280',
                  }}
                >
                  {s.source}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid #30363d' }}>
          <button onClick={onClose} className="px-3 py-1.5 rounded text-[10px]" style={{ color: '#9ca3af', border: '1px solid #30363d' }}>
            取消
          </button>
          <div className="flex-1" />
          <span className="text-[9px]" style={{ color: '#6b7280' }}>已选 {selected.size} / {scanned.length}</span>
          <button
            onClick={() => onImport(selectedServers)}
            disabled={selectedServers.length === 0}
            className="px-4 py-1.5 rounded text-[10px] font-semibold text-white"
            style={{ background: '#238636', border: '1px solid #2ea043' }}
          >
            导入选中
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ui && npx vitest run MCPImportModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire into MCPPanel**

```tsx
// ui/src/panels/MCPPanel.tsx — add import modal state + trigger
import MCPImportModal from '../components/MCPImportModal';

// Add state:
const [showImport, setShowImport] = useState(false);
const [scannedForImport, setScannedForImport] = useState<any[]>([]);

// Replace handleRefreshAndImport:
const handleImportClick = async () => {
  try {
    const servers = await api.mcp.scanServers();
    if (servers?.length) {
      setScannedForImport(servers);
      setShowImport(true);
    }
  } catch {}
};

// In JSX, replace the import button onClick:
<button onClick={handleImportClick}>导入</button>

// Add modal at end of component:
{showImport && (
  <MCPImportModal
    scanned={scannedForImport}
    onImport={async (selected) => {
      for (const s of selected) {
        await api.mcp.upsertServer({ name: s.name, type: s.type, command: s.command, url: s.url });
      }
      setShowImport(false);
      fetchUnified();
    }}
    onClose={() => setShowImport(false)}
  />
)}
```

- [ ] **Step 6: Run full UI tests**

Run: `cd ui && npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add ui/src/components/MCPImportModal.tsx ui/src/components/MCPImportModal.test.tsx
git add ui/src/panels/MCPPanel.tsx
git commit -m "feat: add MCP Import Modal with checkbox selection and batch import"
```

---

## Task 3: 左侧边栏对齐

**目标**: 对齐设计 mockup — 3 Tab 栏 + 文件树语言标签 + Git 状态 + 符号大纲

**Files:**
- Modify: `ui/src/components/layouts/MainLayout.tsx:214-264`
- Modify: `ui/src/panels/ExplorerPanel.tsx`

- [ ] **Step 1: Update left sidebar tabs to match design**

```tsx
// ui/src/components/layouts/MainLayout.tsx — left sidebar tabs (around line 214)
// Current: 'files' | 'mcp' | 'capabilities'
// Update tab labels to Chinese + icons

<div className="flex" style={{ background: '#0f141a', borderBottom: '1px solid #30363d' }}>
  <button
    onClick={() => setLeftTab('files')}
    className="flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-semibold"
    style={{
      color: leftTab === 'files' ? '#fff' : '#8b949e',
      background: leftTab === 'files' ? '#161b22' : 'transparent',
      borderTop: leftTab === 'files' ? '2px solid #58a6ff' : '2px solid transparent',
    }}
  >
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={leftTab === 'files' ? '#58a6ff' : 'currentColor'} strokeWidth="2">
      <path d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
    </svg>
    项目文件
  </button>
  <button
    onClick={() => setLeftTab('mcp')}
    className="flex-1 flex items-center justify-center gap-1 py-2 text-[10px]"
    style={{
      color: leftTab === 'mcp' ? '#fff' : '#8b949e',
      background: leftTab === 'mcp' ? '#161b22' : 'transparent',
      borderTop: leftTab === 'mcp' ? '2px solid #58a6ff' : '2px solid transparent',
    }}
  >
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={leftTab === 'mcp' ? '#58a6ff' : 'currentColor'} strokeWidth="2">
      <path d="M12 22V14M8 6V2M16 6V2M6 6H18V10C18 13.3 15.3 16 12 16C8.7 16 6 13.3 6 10V6Z" />
    </svg>
    MCP 与技能
  </button>
  <button
    onClick={() => setLeftTab('capabilities')}
    className="flex-1 flex items-center justify-center gap-1 py-2 text-[10px]"
    style={{
      color: leftTab === 'capabilities' ? '#fff' : '#8b949e',
      background: leftTab === 'capabilities' ? '#161b22' : 'transparent',
      borderTop: leftTab === 'capabilities' ? '2px solid #58a6ff' : '2px solid transparent',
    }}
  >
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={leftTab === 'capabilities' ? '#58a6ff' : 'currentColor'} strokeWidth="2">
      <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
    Agent 能力
  </button>
</div>
```

- [ ] **Step 2: Add language badge + Git status to ExplorerPanel file tree**

```tsx
// ui/src/panels/ExplorerPanel.tsx — file item rendering
// Add language badge before filename:
const LANG_BADGES: Record<string, { bg: string; color: string; label: string }> = {
  '.tsx': { bg: '#2563eb', color: '#fff', label: 'TS' },
  '.ts':  { bg: '#2563eb', color: '#fff', label: 'TS' },
  '.go':  { bg: '#00add8', color: '#fff', label: 'GO' },
  '.py':  { bg: '#3776ab', color: '#fff', label: 'PY' },
  '.rs':  { bg: '#dea584', color: '#000', label: 'RS' },
  '.json': { bg: '#6b7280', color: '#fff', label: 'JS' },
  '.md':  { bg: '#6b7280', color: '#fff', label: 'MD' },
  'Makefile': { bg: '#6b7280', color: '#fff', label: 'MK' },
};

// Git status badge:
const GIT_STATUS: Record<string, { color: string; label: string }> = {
  'M': { color: '#f0883e', label: 'M' },
  'A': { color: '#3fb950', label: 'A' },
  'D': { color: '#f85149', label: 'D' },
  '?': { color: '#6b7280', label: '?' },
};

// In file item JSX:
<span style={{ fontSize: 9, padding: '0 4px', background: badge.bg, color: badge.color, borderRadius: 2, fontWeight: 700 }}>
  {badge.label}
</span>
<span style={{ color: isCurrent ? '#58a6ff' : '#d1d5db', fontWeight: isCurrent ? 600 : 400 }}>
  {file.name}
</span>
{gitStatus && (
  <span style={{ marginLeft: 'auto', fontSize: 9, color: GIT_STATUS[gitStatus].color, fontWeight: 700 }}>
    {GIT_STATUS[gitStatus].label}
  </span>
)}
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/layouts/MainLayout.tsx ui/src/panels/ExplorerPanel.tsx
git commit -m "feat: align left sidebar tabs, file tree badges, and git status with design"
```

---

## Task 4: CLI 工坊对齐

**目标**: Agent 专属颜色条 + 内存估算 + 进程状态实时更新

**Files:**
- Modify: `ui/src/components/CLIProcessWorkshop.tsx`

- [ ] **Step 1: Update row rendering with agent color bar**

```tsx
// ui/src/components/CLIProcessWorkshop.tsx — row rendering (around line 124)
const AGENT_COLORS: Record<string, string> = {
  'claude-code': '#fb923c',
  'kimi-code': '#22d3ee',
  'opencode': '#a78bfa',
  'qwen-code': '#f778ba',
  'gemini-cli': '#22d3ee',
  'cline': '#3fb950',
};

// In row JSX:
<div
  className="flex items-center gap-3 px-3 py-2 cursor-pointer"
  style={{ borderLeft: `3px solid ${AGENT_COLORS[process.name] || '#6b7280'}` }}
  onClick={() => handleRowClick(process)}
>
  {/* Status dot */}
  <span
    className="w-2 h-2 rounded-full"
    style={{ background: status === 'running' ? '#3fb950' : status === 'idle' ? '#fbbf24' : '#6b7280' }}
  />
  {/* ... rest of columns */}
</div>
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/CLIProcessWorkshop.tsx
git commit -m "feat: align CLI workshop with agent color bars and status indicators"
```

---

## Task 5: 蜂王沙盘对齐

**目标**: SVG 节点位置 + 状态动画 + HITL 弹窗 + 流动粒子边

**Files:**
- Modify: `ui/src/components/QueenSandbox.tsx`

- [ ] **Step 1: Verify node positions match design**

Design mockup coordinates:
- Scanner: x:52, y:178
- gemini: x:220, y:40
- claude-code: x:220, y:240
- validation: x:548, y:140
- aider: x:728, y:140

Check current code (line 113) and adjust if needed.

- [ ] **Step 2: Verify edge colors match design**

Design: scanner→gemini (#58a6ff), gemini→validation (#f0883e), validation→aider (#3fb950)

Check current edge rendering (lines 276-324) and adjust colors.

- [ ] **Step 3: Verify HITL popup renders correctly**

Check lines 549-641 for blocked/waiting_auth node popup with approve/deny buttons.

- [ ] **Step 4: Run TypeScript check**

Run: `cd ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/QueenSandbox.tsx
git commit -m "feat: align queen sandbox node positions, edges, and HITL popup with design"
```

---

## Task 6: 右侧边栏对齐

**目标**: 指令交互 Filter Tab + 活动日志分类 Filter + 彩色卡片

**Files:**
- Modify: `ui/src/components/ProtocolMonitor.tsx`
- Modify: `ui/src/components/ActivityLog.tsx`

- [ ] **Step 1: Verify ProtocolMonitor filter tabs**

Current tabs (line 11-16): `all`, `ACP`, `A2A`, `MCP` — matches design.
Verify list/timeline view toggle works.

- [ ] **Step 2: Verify ActivityLog filter tabs**

Current tabs (line 5-20): `all`, `MCP`, `Tools`, `Agent`, `Protocol`, `Skill`, `System` — matches design.
Verify color-coded cards render correctly.

- [ ] **Step 3: Run TypeScript check**

Run: `cd ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/ProtocolMonitor.tsx ui/src/components/ActivityLog.tsx
git commit -m "feat: verify right sidebar alignment with design"
```

---

## Task 7: 蜂王调度器对齐

**目标**: 策略选择器 + 目标输入 + 最近任务状态

**Files:**
- Modify: `ui/src/components/QueenDispatcher.tsx`

- [ ] **Step 1: Verify strategy selector matches design**

Current strategies (lines 7-14): `round_robin`, `least_loaded`, `priority`, `capability` — matches design.
Verify select dropdown styling.

- [ ] **Step 2: Verify recent task display**

Current (lines 104-118): Shows 3 most recent tasks with status dots — matches design.

- [ ] **Step 3: Run TypeScript check**

Run: `cd ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/QueenDispatcher.tsx
git commit -m "feat: verify queen dispatcher alignment with design"
```

---

## Task 8: 全链路集成验证

**目标**: 验证所有功能正常

- [ ] **Step 1: Go build + vet**

Run: `make build && go vet ./...`
Expected: PASS

- [ ] **Step 2: Go tests**

Run: `go test ./internal/api/... ./internal/mcp/... ./internal/agent/...`
Expected: PASS

- [ ] **Step 3: TypeScript check**

Run: `cd ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: UI tests**

Run: `cd ui && npx vitest run`
Expected: PASS

- [ ] **Step 5: Visual verification**

Run: `cd ui && npx tauri dev`
Verify:
- [ ] MCP 面板显示 scanned servers
- [ ] MCP 导入 Modal 正常弹出
- [ ] Agent 配置 Modal 正常工作
- [ ] 左侧边栏 3 Tab 切换正常
- [ ] 蜂王沙盘节点动画正常
- [ ] 右侧边栏 Filter 正常
- [ ] 底部 CLI 工坊颜色条正常

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete UI alignment and transport migration for all 13 modules"
```

---

## 执行顺序

```
Task 1 (通信层迁移)  ← 独立，优先执行
Task 2 (MCP 导入)    ← 独立
Task 3-7 (UI 对齐)   ← 可并行
Task 8 (集成验证)    ← 最后执行
```
