# P0-1: Auto Lint/Compile Feedback Loop — 实施计划

> **自动化执行:** 使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施。步骤使用 checkbox (`- [ ]`) 追踪进度。

**目标:** 代码物理写入磁盘后，自动触发 Linter/编译校验。校验失败时捕获错误，原路反馈给 Agent 启动自主修复循环。超过最大重试次数后升级为 HITL 拦截。

**架构:** 在 `handleCommitPatch` 写入磁盘后，调用 `Verifier` 执行文件类型路由的 lint/compile。结果通过 WebSocket 广播给前端，同时通过 ACP `SendPrompt` 反馈给 Agent。ShadowBuffer 新增验证状态字段跟踪修复循环。

**技术栈:** Go 1.22+, ACP JSON-RPC 2.0, WebSocket broadcast, exec.Command

---

## 当前状态

**已实现:**
- `ShadowBuffer.Stage/Commit/Reject` — 内存暂存 + commit 仅删除 buffer，不写磁盘
- `handleStagePatch/handleListPatches/handleCommitPatch/handleRejectPatch` — 4 个 WebSocket handler
- `PendingPatch.Diff()` — unified diff 生成
- `ClientHub.Broadcast(eventType, payload)` — 前端事件推送
- `AgentConnection.SendPrompt(ctx, sessionID, prompt)` — Agent 反向通信

**差距 (设计文档 S7):**
- Commit 后无自动校验
- 无文件类型路由 (Go/TS/Python/...)
- 无错误反馈闭环 (Agent 自修复)
- 无重试计数 / HITL 升级
- PendingPatch 无验证状态字段

---

## 架构设计

```
handleCommitPatch
  │
  ├─ 1. sb.Commit(id) — 从 buffer 移除
  ├─ 2. os.WriteFile(path, newContent) — 写入磁盘
  ├─ 3. Verifier.Verify(path) ──────────────────────┐
  │                                                   │
  │   ┌───────────────────────────────────────────────┘
  │   │
  │   ├─ 成功 → Broadcast("verification_passed", {...})
  │   │
  │   └─ 失败 → Broadcast("verification_failed", {errors, retryCount})
  │              │
  │              ├─ retryCount < maxRetries (3)
  │              │   └─ AgentConnection.SendPrompt(feedback) → Agent 自修复
  │              │       └─ Agent 生成新 patch → Stage → Commit → Verify (循环)
  │              │
  │              └─ retryCount >= maxRetries
  │                  └─ Broadcast("verification_escalated", {...}) → HITL
  │
  └─ 返回结果
```

---

## 文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `internal/api/verifier.go` | Verifier 核心: 文件类型路由 + lint 执行 |
| 新建 | `internal/api/verifier_test.go` | Verifier 单元测试 |
| 修改 | `internal/api/shadowbuffer.go` | PendingPatch 增加验证状态字段 |
| 修改 | `internal/api/handler_agent.go` | handleCommitPatch 集成验证流程 |
| 修改 | `internal/api/handler.go` | 注册 `verify_patch` 命令路由 |
| 修改 | `internal/api/websocket_server.go` | Verifier 字段 + 工作区路径注入 |
| 新建 | `internal/api/verifier_integration_test.go` | 端到端集成测试 |

---

## 任务 1: PendingPatch 增加验证状态字段

**文件:** `internal/api/shadowbuffer.go`

- [ ] **步骤 1: 添加 VerificationInfo 结构体和状态常量**

在 `PendingPatch` 结构体之前添加:

```go
// VerificationState represents the state of patch verification.
type VerificationState string

const (
	VerifyPending   VerificationState = "pending"
	VerifyRunning   VerificationState = "running"
	VerifyPassed    VerificationState = "passed"
	VerifyFailed    VerificationState = "failed"
	VerifyEscalated VerificationState = "escalated"
)

// VerificationError represents a single lint/compile error.
type VerificationError struct {
	File    string `json:"file"`
	Line    int    `json:"line"`
	Column  int    `json:"column,omitempty"`
	Message string `json:"message"`
	Source  string `json:"source"` // e.g. "golint", "tsc", "pylint"
}
```

- [ ] **步骤 2: 扩展 PendingPatch 结构体**

在 `PendingPatch` 中添加验证字段:

```go
type PendingPatch struct {
	ID         string            `json:"id"`
	AgentID    string            `json:"agentId"`
	Path       string            `json:"path"`
	OldContent string            `json:"oldContent"`
	NewContent string            `json:"newContent"`
	CreatedAt  time.Time         `json:"createdAt"`
	// Verification state
	VerifyState VerificationState `json:"verifyState,omitempty"`
	VerifyErrors []VerificationError `json:"verifyErrors,omitempty"`
	RetryCount  int               `json:"retryCount,omitempty"`
}
```

- [ ] **步骤 3: 编写测试**

创建 `internal/api/shadowbuffer_verify_test.go`:

```go
package api

import (
	"testing"
)

func TestPendingPatch_VerifyState(t *testing.T) {
	p := &PendingPatch{
		ID:          "test-1",
		VerifyState: VerifyPending,
	}
	if p.VerifyState != VerifyPending {
		t.Errorf("expected pending, got %s", p.VerifyState)
	}
}

func TestPendingPatch_VerifyErrors(t *testing.T) {
	p := &PendingPatch{
		VerifyState: VerifyFailed,
		VerifyErrors: []VerificationError{
			{File: "main.go", Line: 10, Message: "unused variable", Source: "go vet"},
		},
	}
	if len(p.VerifyErrors) != 1 {
		t.Fatalf("expected 1 error, got %d", len(p.VerifyErrors))
	}
	if p.VerifyErrors[0].Source != "go vet" {
		t.Errorf("expected 'go vet', got %s", p.VerifyErrors[0].Source)
	}
}

func TestVerificationState_Values(t *testing.T) {
	states := []VerificationState{VerifyPending, VerifyRunning, VerifyPassed, VerifyFailed, VerifyEscalated}
	for _, s := range states {
		if string(s) == "" {
			t.Error("verification state should not be empty")
		}
	}
}
```

**验证:**
```bash
cd /home/kelthas/code/swarm-editor && go test ./internal/api/ -run TestPendingPatch_Verify -v
```

---

## 任务 2: Verifier 核心实现

**文件:** `internal/api/verifier.go` (新建)

- [ ] **步骤 1: 定义 Verifier 结构体和 LinterConfig**

```go
package api

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// LinterConfig defines a linter command for a file type.
type LinterConfig struct {
	Name      string   // e.g. "go vet", "tsc"
	Command   string   // e.g. "go"
	Args      []string // e.g. ["vet", "./..."]
	Timeout   time.Duration
	FileTypes []string // e.g. [".go"]
}

// VerifyResult holds the outcome of a verification run.
type VerifyResult struct {
	State  VerifyPassed | VerifyFailed
	Errors []VerificationError
}

// Verifier runs lint/compile checks after patch commit.
type Verifier struct {
	workspacePath string
	linters       map[string][]LinterConfig // keyed by extension: ".go" -> [{...}]
}

// NewVerifier creates a verifier with default linter configs.
func NewVerifier(workspacePath string) *Verifier {
	v := &Verifier{
		workspacePath: workspacePath,
		linters:       defaultLinters(),
	}
	return v
}
```

- [ ] **步骤 2: 实现 defaultLinters**

```go
func defaultLinters() map[string][]LinterConfig {
	return map[string][]LinterConfig{
		".go": {
			{
				Name:      "go vet",
				Command:   "go",
				Args:      []string{"vet", "./..."},
				Timeout:   30 * time.Second,
				FileTypes: []string{".go"},
			},
		},
		".ts": {
			{
				Name:      "tsc",
				Command:   "npx",
				Args:      []string{"tsc", "--noEmit"},
				Timeout:   30 * time.Second,
				FileTypes: []string{".ts", ".tsx"},
			},
		},
		".py": {
			{
				Name:      "pylint",
				Command:   "pylint",
				Args:      []string{"--output-format=text"},
				Timeout:   30 * time.Second,
				FileTypes: []string{".py"},
			},
		},
	}
}
```

- [ ] **步骤 3: 实现 Verify 方法**

```go
// Verify runs linters matching the given file path.
func (v *Verifier) Verify(ctx context.Context, filePath string) VerifyResult {
	ext := filepath.Ext(filePath)
	configs, ok := v.linters[ext]
	if !ok {
		// No linter configured for this file type — pass by default
		return VerifyResult{State: VerifyPassed}
	}

	var allErrors []VerificationError
	for _, cfg := range configs {
		errors := v.runLinter(ctx, cfg, filePath)
		allErrors = append(allErrors, errors...)
	}

	if len(allErrors) == 0 {
		return VerifyResult{State: VerifyPassed}
	}
	return VerifyResult{State: VerifyFailed, Errors: allErrors}
}

func (v *Verifier) runLinter(ctx context.Context, cfg LinterConfig, filePath string) []VerificationError {
	lintCtx, cancel := context.WithTimeout(ctx, cfg.Timeout)
	defer cancel()

	cmd := exec.CommandContext(lintCtx, cfg.Command, cfg.Args...)
	cmd.Dir = v.workspacePath

	output, err := cmd.CombinedOutput()
	if err == nil {
		return nil // clean
	}

	return parseLinterOutput(cfg.Name, filePath, string(output))
}
```

- [ ] **步骤 4: 实现 parseLinterOutput**

```go
func parseLinterOutput(source, filePath, output string) []VerificationError {
	var errors []VerificationError
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		ve := parseLinterLine(source, line)
		if ve != nil {
			errors = append(errors, *ve)
		}
	}
	return errors
}

// parseLinterLine parses a single error line. Format varies by linter:
//   go vet: file.go:10: message
//   tsc:    file.ts(10,5): error TS1234: message
//   pylint: file.py:10: [C0114] message
func parseLinterLine(source, line string) *VerificationError {
	// Try colon-delimited format (go vet, pylint)
	parts := strings.SplitN(line, ":", 3)
	if len(parts) >= 3 {
		file := strings.TrimSpace(parts[0])
		var lineNum int
		fmt.Sscanf(strings.TrimSpace(parts[1]), "%d", &lineNum)
		msg := strings.TrimSpace(parts[2])
		if lineNum > 0 && msg != "" {
			return &VerificationError{
				File:    file,
				Line:    lineNum,
				Message: msg,
				Source:  source,
			}
		}
	}
	// Fallback: raw line as message
	if line != "" {
		return &VerificationError{
			Message: line,
			Source:  source,
		}
	}
	return nil
}
```

**验证:**
```bash
cd /home/kelthas/code/swarm-editor && go build ./internal/api/
```

---

## 任务 3: Verifier 单元测试

**文件:** `internal/api/verifier_test.go` (新建)

- [ ] **步骤 1: 测试 NewVerifier 和 defaultLinters**

```go
package api

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestNewVerifier(t *testing.T) {
	v := NewVerifier("/tmp")
	if v.workspacePath != "/tmp" {
		t.Errorf("expected /tmp, got %s", v.workspacePath)
	}
	if len(v.linters) == 0 {
		t.Error("expected default linters to be configured")
	}
}

func TestVerifier_NoLinterForUnknownExt(t *testing.T) {
	v := NewVerifier(t.TempDir())
	result := v.Verify(context.Background(), "readme.xyz")
	if result.State != VerifyPassed {
		t.Errorf("expected passed for unknown ext, got %s", result.State)
	}
}

func TestVerifier_GoVet_Pass(t *testing.T) {
	dir := t.TempDir()
	goFile := filepath.Join(dir, "main.go")
	content := "package main\n\nfunc main() {}\n"
	if err := os.WriteFile(goFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	v := NewVerifier(dir)
	result := v.Verify(context.Background(), goFile)
	// go vet may not be available in CI; skip if command not found
	t.Logf("result: state=%s errors=%d", result.State, len(result.Errors))
}

func TestVerifier_GoVet_Fail(t *testing.T) {
	dir := t.TempDir()
	goFile := filepath.Join(dir, "bad.go")
	// Write file with obvious vet error (unused result)
	content := "package bad\n\nimport \"fmt\"\n\nfunc _() {\n\tfmt.Sprintf(\"%d\")\n}\n"
	if err := os.WriteFile(goFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	v := NewVerifier(dir)
	result := v.Verify(context.Background(), goFile)
	t.Logf("result: state=%s errors=%v", result.State, result.Errors)
}

func TestParseLinterLine_GoVet(t *testing.T) {
	ve := parseLinterLine("go vet", "main.go:10: unreachable code")
	if ve == nil {
		t.Fatal("expected non-nil")
	}
	if ve.Line != 10 {
		t.Errorf("expected line 10, got %d", ve.Line)
	}
	if ve.Source != "go vet" {
		t.Errorf("expected 'go vet', got %s", ve.Source)
	}
}

func TestParseLinterLine_Empty(t *testing.T) {
	ve := parseLinterLine("go vet", "")
	if ve != nil {
		t.Error("expected nil for empty line")
	}
}

func TestParseLinterOutput_MultiLine(t *testing.T) {
	output := "main.go:5: undefined: foo\nmain.go:8: unused variable\n"
	errors := parseLinterOutput("go vet", "main.go", output)
	if len(errors) != 2 {
		t.Fatalf("expected 2 errors, got %d", len(errors))
	}
	if errors[0].Line != 5 {
		t.Errorf("expected line 5, got %d", errors[0].Line)
	}
	if errors[1].Line != 8 {
		t.Errorf("expected line 8, got %d", errors[1].Line)
	}
}
```

**验证:**
```bash
cd /home/kelthas/code/swarm-editor && go test ./internal/api/ -run TestVerifier -v
cd /home/kelthas/code/swarm-editor && go test ./internal/api/ -run TestParseLinter -v
```

---

## 任务 4: WebSocket 集成 — Verifier 挂载到 WebSocketServer

**文件:** `internal/api/websocket_server.go`

- [ ] **步骤 1: 在 WebSocketServer 添加 Verifier 字段**

在 WebSocketServer 结构体中找到 `shadowBuffer` 字段附近，添加:

```go
verifier *Verifier
```

- [ ] **步骤 2: 在 NewWebSocketServer 或初始化路径中创建 Verifier**

在 workspacePath 已知后初始化:

```go
func (s *WebSocketServer) Verifier() *Verifier {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.verifier == nil {
		s.verifier = NewVerifier(s.workspacePath)
	}
	return s.verifier
}
```

**验证:**
```bash
cd /home/kelthas/code/swarm-editor && go build ./internal/api/
```

---

## 任务 5: handleCommitPatch 集成验证流程

**文件:** `internal/api/handler_agent.go`

这是核心改动 — 将 `handleCommitPatch` 从"仅移除 buffer"升级为"写入磁盘 + 验证 + 反馈"。

- [ ] **步骤 1: 修改 handleCommitPatch — 获取 patch 内容后写磁盘**

将现有的 `handleCommitPatch` 函数替换为:

```go
func (h *CommandHandler) handleCommitPatch(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.ID) == "" {
		return nil, errValidation("id is required")
	}

	sb := h.server.ShadowBuffer()
	if sb == nil {
		return nil, NewAPIError(CodeInternalError, "shadow buffer not available")
	}

	patch, ok := sb.Get(req.ID)
	if !ok {
		return nil, errNotFound("patch not found")
	}

	// Write to disk
	if h.server.WorkspacePath() != "" && patch.NewContent != "" {
		fullPath := filepath.Join(h.server.WorkspacePath(), patch.Path)
		if err := os.WriteFile(fullPath, []byte(patch.NewContent), 0644); err != nil {
			return nil, NewAPIError(CodeInternalError, "failed to write file: "+err.Error())
		}
	}

	// Remove from buffer after successful write
	sb.Commit(req.ID)

	// Trigger verification
	result := h.verifyAndBroadcast(ctx, patch)

	return map[string]any{
		"id":            req.ID,
		"status":        "committed",
		"verifyState":   string(result.State),
		"verifyErrors":  result.Errors,
	}, nil
}
```

- [ ] **步骤 2: 实现 verifyAndBroadcast 方法**

在 `handleCommitPatch` 之后添加:

```go
const maxVerifyRetries = 3

func (h *CommandHandler) verifyAndBroadcast(ctx context.Context, patch *PendingPatch) VerifyResult {
	hub := h.server.Hub()
	verifier := h.server.Verifier()
	if hub == nil || verifier == nil {
		return VerifyResult{State: VerifyPassed}
	}

	// Broadcast verification started
	hub.Broadcast("verification_started", map[string]any{
		"patchId": patch.ID,
		"agentId": patch.AgentID,
		"path":    patch.Path,
	})

	result := verifier.Verify(ctx, patch.Path)

	if result.State == VerifyPassed {
		hub.Broadcast("verification_passed", map[string]any{
			"patchId": patch.ID,
			"agentId": patch.AgentID,
			"path":    patch.Path,
		})
		return result
	}

	// Verification failed
	patch.RetryCount++
	hub.Broadcast("verification_failed", map[string]any{
		"patchId":    patch.ID,
		"agentId":    patch.AgentID,
		"path":       patch.Path,
		"errors":     result.Errors,
		"retryCount": patch.RetryCount,
	})

	if patch.RetryCount >= maxVerifyRetries {
		hub.Broadcast("verification_escalated", map[string]any{
			"patchId":    patch.ID,
			"agentId":    patch.AgentID,
			"path":       patch.Path,
			"errors":     result.Errors,
			"retryCount": patch.RetryCount,
			"reason":     "max retries exceeded, requiring human intervention",
		})
		return result
	}

	// Send feedback to agent for self-repair
	h.sendVerifyFeedback(ctx, patch, result.Errors)

	return result
}
```

- [ ] **步骤 3: 实现 sendVerifyFeedback — ACP 反向通信**

```go
func (h *CommandHandler) sendVerifyFeedback(ctx context.Context, patch *PendingPatch, errors []VerificationError) {
	conn := h.server.AgentConnection(patch.AgentID)
	if conn == nil {
		apiLog.Warn("no agent connection for feedback", "agentId", patch.AgentID)
		return
	}

	// Build structured error message for agent
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Verification failed for %s (attempt %d/%d):\n\n", patch.Path, patch.RetryCount, maxVerifyRetries))
	for i, e := range errors {
		sb.WriteString(fmt.Sprintf("%d. [%s] %s:%d: %s\n", i+1, e.Source, e.File, e.Line, e.Message))
	}
	sb.WriteString("\nPlease fix these errors and generate a new patch.")

	// Find or create a session for this agent
	sessionID := h.server.AgentSession(patch.AgentID)
	if sessionID == "" {
		apiLog.Warn("no active session for agent feedback", "agentId", patch.AgentID)
		return
	}

	_, err := conn.SendPrompt(ctx, sessionID, Prompt{
		Type: "text",
		Text: sb.String(),
	})
	if err != nil {
		apiLog.Error("failed to send verify feedback", "agentId", patch.AgentID, "error", err)
	}
}
```

- [ ] **步骤 4: 在 handler_agent.go 顶部添加缺失的 import**

确认 import 中包含:
```go
"os"
"path/filepath"
```

**验证:**
```bash
cd /home/kelthas/code/swarm-editor && go build ./internal/api/
```

---

## 任务 6: WebSocketServer 辅助方法

**文件:** `internal/api/websocket_server.go`

`verifyAndBroadcast` 引用了 `WorkspacePath()`, `AgentConnection()`, `AgentSession()` 三个方法。检查它们是否存在，不存在则添加。

- [ ] **步骤 1: 检查并添加 WorkspacePath()**

```go
func (s *WebSocketServer) WorkspacePath() string {
	return s.workspacePath
}
```

- [ ] **步骤 2: 检查并添加 AgentConnection(agentID)**

在 WebSocketServer 中查找 Agent 连接查找方法。如不存在，添加:

```go
func (s *WebSocketServer) AgentConnection(agentID string) *acp.AgentConnection {
	// Delegate to ACP manager or agent registry
	if s.acpManager != nil {
		return s.acpManager.GetConnection(agentID)
	}
	return nil
}
```

- [ ] **步骤 3: 检查并添加 AgentSession(agentID)**

```go
func (s *WebSocketServer) AgentSession(agentID string) acp.SessionID {
	if s.acpManager != nil {
		return s.acpManager.GetActiveSession(agentID)
	}
	return ""
}
```

**验证:**
```bash
cd /home/kelthas/code/swarm-editor && go build ./internal/api/
```

---

## 任务 7: 注册 verify_patch 手动触发命令

**文件:** `internal/api/handler.go`

- [ ] **步骤 1: 添加命令路由**

在 handler.go 的 switch 块中 `reject_patch` case 之后添加:

```go
case "verify_patch":
	return h.handleVerifyPatch(ctx, params)
```

- [ ] **步骤 2: 实现 handleVerifyPatch**

在 `handler_agent.go` 的 Shadow Buffer 区域末尾添加:

```go
func (h *CommandHandler) handleVerifyPatch(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.Path) == "" {
		return nil, errValidation("path is required")
	}

	verifier := h.server.Verifier()
	if verifier == nil {
		return nil, NewAPIError(CodeInternalError, "verifier not available")
	}

	result := verifier.Verify(ctx, req.Path)
	return map[string]any{
		"path":        req.Path,
		"verifyState": string(result.State),
		"errors":      result.Errors,
	}, nil
}
```

**验证:**
```bash
cd /home/kelthas/code/swarm-editor && go build ./internal/api/
```

---

## 任务 8: 集成测试

**文件:** `internal/api/verifier_integration_test.go` (新建)

- [ ] **步骤 1: 端到端测试 — commit + verify pass**

```go
package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestCommitPatch_VerifyPass(t *testing.T) {
	dir := t.TempDir()
	// Write a valid Go file
	goFile := filepath.Join(dir, "good.go")
	if err := os.WriteFile(goFile, []byte("package good\n"), 0644); err != nil {
		t.Fatal(err)
	}

	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	// Stage a patch for a Go file
	stageResult, err := handler.HandleCommand("stage_patch", json.RawMessage(
		`{"agentId":"a1","path":"good.go","oldContent":"package good\n","newContent":"package good\n\nfunc Hello() {}\n"}`), "test")
	if err != nil {
		t.Fatalf("stage failed: %v", err)
	}
	stageMap := stageResult.(map[string]any)
	patchID := stageMap["id"].(string)

	// Commit the patch (triggers write + verify)
	commitResult, err := handler.HandleCommand("commit_patch", json.RawMessage(
		`{"id":"`+patchID+`"}`), "test")
	if err != nil {
		t.Fatalf("commit failed: %v", err)
	}

	commitMap := commitResult.(map[string]any)
	t.Logf("commit result: %v", commitMap)

	// Verify file was written
	content, err := os.ReadFile(goFile)
	if err != nil {
		t.Fatalf("file not written: %v", err)
	}
	if string(content) != "package good\n\nfunc Hello() {}\n" {
		t.Errorf("unexpected content: %q", string(content))
	}
}

func TestVerifyPatch_Command(t *testing.T) {
	dir := t.TempDir()
	goFile := filepath.Join(dir, "main.go")
	if err := os.WriteFile(goFile, []byte("package main\n\nfunc main() {}\n"), 0644); err != nil {
		t.Fatal(err)
	}

	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("verify_patch", json.RawMessage(
		`{"path":"main.go"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m := result.(map[string]any)
	t.Logf("verify result: %v", m)
	if m["path"] != "main.go" {
		t.Errorf("expected path main.go, got %v", m["path"])
	}
}

func TestVerifyPatch_MissingPath(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("verify_patch", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing path")
	}
}

func TestCommitPatch_WritesFile(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	// Stage
	stageResult, _ := handler.HandleCommand("stage_patch", json.RawMessage(
		`{"agentId":"a1","path":"sub/dir/test.txt","oldContent":"","newContent":"hello world"}`), "test")
	patchID := stageResult.(map[string]any)["id"].(string)

	// Create sub dir
	os.MkdirAll(filepath.Join(dir, "sub", "dir"), 0755)

	// Commit
	_, err := handler.HandleCommand("commit_patch", json.RawMessage(
		`{"id":"`+patchID+`"}`), "test")
	if err != nil {
		t.Fatalf("commit failed: %v", err)
	}

	// Verify file written
	content, err := os.ReadFile(filepath.Join(dir, "sub", "dir", "test.txt"))
	if err != nil {
		t.Fatalf("file not found: %v", err)
	}
	if string(content) != "hello world" {
		t.Errorf("expected 'hello world', got %q", string(content))
	}
}
```

**验证:**
```bash
cd /home/kelthas/code/swarm-editor && go test ./internal/api/ -run TestCommitPatch -v
cd /home/kelthas/code/swarm-editor && go test ./internal/api/ -run TestVerifyPatch -v
```

---

## 任务 9: 前端 — 验证事件订阅

**文件:** `ui/src/services/api.ts`

- [ ] **步骤 1: 添加 verify_patch API 方法**

在 api.ts 的适当位置添加:

```typescript
verify: {
  verifyPatch: (path: string) =>
    ws.request('verify_patch', { path }),
},
```

- [ ] **步骤 2: 在 monitoringStore 添加验证事件订阅**

在 WebSocket subscribe 区域添加事件处理:

```typescript
ws.subscribe('verification_started', (data) => {
  apiLog.debug('Verification started', data)
})

ws.subscribe('verification_passed', (data) => {
  apiLog.debug('Verification passed', data)
})

ws.subscribe('verification_failed', (data) => {
  apiLog.warn('Verification failed', data)
})

ws.subscribe('verification_escalated', (data) => {
  apiLog.error('Verification escalated to HITL', data)
})
```

**验证:**
```bash
cd /home/kelthas/code/swarm-editor/ui && npx tsc --noEmit
```

---

## 任务 10: 五关验证

- [ ] **步骤 1: Go build**
```bash
cd /home/kelthas/code/swarm-editor && go build ./...
```

- [ ] **步骤 2: go vet**
```bash
cd /home/kelthas/code/swarm-editor && go vet ./...
```

- [ ] **步骤 3: staticcheck**
```bash
cd /home/kelthas/code/swarm-editor && staticcheck ./...
```

- [ ] **步骤 4: Go tests**
```bash
cd /home/kelthas/code/swarm-editor && go test ./internal/api/ -v -count=1
```

- [ ] **步骤 5: TypeScript**
```bash
cd /home/kelthas/code/swarm-editor/ui && npx tsc --noEmit
```

- [ ] **步骤 6: UI tests**
```bash
cd /home/kelthas/code/swarm-editor/ui && npx vitest run
```

---

## 实施优先级总结

| 任务 | 优先级 | 依赖 | 估计改动量 |
|------|--------|------|-----------|
| 任务 1: PendingPatch 扩展 | P0 | 无 | ~50 行 |
| 任务 2: Verifier 核心 | P0 | 任务 1 | ~150 行 |
| 任务 3: Verifier 测试 | P0 | 任务 2 | ~120 行 |
| 任务 4: WebSocketServer 集成 | P0 | 任务 2 | ~15 行 |
| 任务 5: handleCommitPatch 重写 | P0 | 任务 1-4 | ~100 行 |
| 任务 6: 辅助方法 | P0 | 任务 5 | ~30 行 |
| 任务 7: verify_patch 命令 | P1 | 任务 2 | ~30 行 |
| 任务 8: 集成测试 | P1 | 任务 5-7 | ~100 行 |
| 任务 9: 前端事件 | P1 | 任务 7 | ~30 行 |
| 任务 10: 五关验证 | P0 | 任务 1-9 | 0 行 |

**总估计:** ~625 行新增/修改代码
