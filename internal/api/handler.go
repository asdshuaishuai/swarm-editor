package api

import (
"context"
"encoding/json"
"fmt"
"io"
"os"
"os/exec"
"path/filepath"
"strings"
"time"
"github.com/swarm-editor/swarm-editor/internal/log"
"github.com/swarm-editor/swarm-editor/internal/lsp"
"github.com/swarm-editor/swarm-editor/internal/swarm"
)

var apiLog = log.With("component", "API")

// CommandHandler handles WebSocket commands from UI
type CommandHandler struct {
	server *WebSocketServer
}

// NewCommandHandler creates a new command handler
func NewCommandHandler(server *WebSocketServer) *CommandHandler {
	return &CommandHandler{server: server}
}

// context key for clientID
type contextKey string

const clientIDKey contextKey = "clientID"

// ClientIDFromContext extracts the WebSocket clientID from context.
func ClientIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(clientIDKey).(string); ok {
		return v
	}
	return ""
}

// HandleCommand handles a command from UI. clientID identifies the requesting WebSocket client.
func (h *CommandHandler) HandleCommand(method string, params json.RawMessage, clientID string) (any, error) {
	// Derive timeout from server context so in-flight commands are cancelled on shutdown
	parentCtx := h.server.Context()
	if parentCtx == nil {
		parentCtx = context.Background()
	}
	ctx, cancel := context.WithTimeout(context.WithValue(parentCtx, clientIDKey, clientID), 30*time.Second)
	defer cancel()

	switch method {
	// Agent management
	case "get_agents":
		return h.handleGetAgents(ctx, params)
	case "get_agent":
		return h.handleGetAgent(ctx, params)
	case "start_agent":
		return h.handleStartAgent(ctx, params)
	case "stop_agent":
		return h.handleStopAgent(ctx, params)
	case "refresh_agents":
		return h.handleRefreshAgents(ctx, params)
	case "add_agent":
		return h.handleAddAgent(ctx, params)
	case "update_agent":
		return h.handleUpdateAgent(ctx, params)
	case "delete_agent":
		return h.handleDeleteAgent(ctx, params)
	case "get_config_path":
		return h.handleGetConfigPath(ctx, params)
	case "scan_skills":
		return h.handleScanSkills(ctx, params)
	case "test_agent":
		return h.handleTestAgent(ctx, params)
		case "get_process_metrics":
			return h.handleGetProcessMetrics(ctx, params)
		case "get_agent_logs":
			return h.handleGetAgentLogs(ctx, params)

	// A2A protocol
	case "get_agent_cards":
		return h.handleGetAgentCards(ctx, params)
	case "find_agents_by_capability":
		return h.handleFindAgentsByCapability(ctx, params)
	case "a2a_status":
		return h.handleA2AStatus(ctx, params)
	case "a2a_message_log":
		return h.handleA2AMessageLog(ctx, params)

	// Session management
	case "create_session":
		return h.handleCreateSession(ctx, params)
	case "get_sessions":
		return h.handleGetSessions(ctx, params)
	case "send_message":
		return h.handleSendMessage(ctx, params)
	case "get_custom_instructions":
		return h.handleGetCustomInstructions(ctx, params)
	case "save_custom_instructions":
		return h.handleSaveCustomInstructions(ctx, params)
	case "close_session":
		return h.handleCloseSession(ctx, params)

	// Permission management
	case "permission_response":
		return h.handlePermissionResponse(ctx, params)

	// Swarm management
	case "get_swarms":
		return h.handleGetSwarms(ctx, params)
	case "get_swarm":
		return h.handleGetSwarm(ctx, params)
	case "create_swarm":
		return h.handleCreateSwarm(ctx, params)
	case "start_swarm":
		return h.handleStartSwarm(ctx, params)
	case "stop_swarm":
		return h.handleStopSwarm(ctx, params)
	case "delete_swarm":
		return h.handleDeleteSwarm(ctx, params)
	case "submit_task":
		return h.handleSubmitTask(ctx, params)
	case "get_swarm_tasks":
		return h.handleGetSwarmTasks(ctx, params)
	case "execute_task":
		return h.handleExecuteTask(ctx, params)
	case "cancel_task":
		return h.handleCancelTask(ctx, params)
	case "assign_task":
		return h.handleAssignTask(ctx, params)
	case "get_consensus":
		return h.handleGetConsensus(ctx, params)
	case "resolve_handoff":
		return h.handleResolveHandoff(ctx, params)

		// Swarm algorithm
		case "get_queen_status":
			return h.handleGetQueenStatus(ctx, params)
		case "trigger_election":
			return h.handleTriggerElection(ctx, params)
		case "abdicate_queen":
			return h.handleAbdicateQueen(ctx, params)
		case "interrupt_agent":
			return h.handleInterruptAgent(ctx, params)
		case "resume_task":
			return h.handleResumeTask(ctx, params)
		case "get_checkpoints":
			return h.handleGetCheckpoints(ctx, params)
		case "recover_task":
			return h.handleRecoverTask(ctx, params)
		case "get_role_assignments":
			return h.handleGetRoleAssignments(ctx, params)

	// Team management
	case "get_teams":
		return h.handleGetTeams(ctx, params)
	case "create_team":
		return h.handleCreateTeam(ctx, params)
	case "delete_team":
		return h.handleDeleteTeam(ctx, params)
	case "add_agent_to_team":
		return h.handleAddAgentToTeam(ctx, params)
	case "remove_agent_from_team":
		return h.handleRemoveAgentFromTeam(ctx, params)

	// MCP management
	case "get_mcp_servers":
		return h.handleGetMCPServers(ctx, params)
	case "start_mcp_server":
		return h.handleStartMCPServer(ctx, params)
	case "stop_mcp_server":
		return h.handleStopMCPServer(ctx, params)
	case "call_mcp_tool":
		return h.handleCallMCPTool(ctx, params)
	case "add_mcp_server":
		return h.handleAddMCPServer(ctx, params)
	case "remove_mcp_server":
		return h.handleRemoveMCPServer(ctx, params)
	case "scan_mcp_servers":
		return h.handleScanMCPServers(ctx, params)
	case "list_mcp_tools":
		return h.handleListMCPTools(ctx, params)

	// Code execution
	case "execute_code":
		return h.handleExecuteCode(ctx, params)

	// Monitoring
	case "get_supervisor_stats":
		return h.handleGetSupervisorStats(ctx, params)
	case "get_emergence_data":
		return h.handleGetEmergenceData(ctx, params)

	// File system
	case "get_workspace":
		return h.handleGetWorkspace(ctx, params)
	case "set_workspace":
		return h.handleSetWorkspace(ctx, params)
	case "list_dir":
		return h.handleListDir(ctx, params)
	case "read_file":
		return h.handleReadFile(ctx, params)
	case "write_file":
		return h.handleWriteFile(ctx, params)
	case "delete_file":
		return h.handleDeleteFile(ctx, params)
	case "rename_file":
		return h.handleRenameFile(ctx, params)
	case "create_file":
		return h.handleCreateFile(ctx, params)
	case "mkdir":
		return h.handleMkdir(ctx, params)
	case "copy_file":
		return h.handleCopyFile(ctx, params)
	case "search_files":
		return h.handleSearchFiles(ctx, params)
	case "search_content":
		return h.handleSearchContent(ctx, params)
	case "git_status":
		return h.handleGitStatus(ctx, params)
	case "git_diff":
		return h.handleGitDiff(ctx, params)
	case "git_stage":
		return h.handleGitStage(ctx, params)
	case "git_unstage":
		return h.handleGitUnstage(ctx, params)
	case "git_commit":
		return h.handleGitCommit(ctx, params)
	case "git_discard":
		return h.handleGitDiscard(ctx, params)
	case "git_log":
		return h.handleGitLog(ctx, params)
	case "git_branch":
		return h.handleGitBranch(ctx, params)
	case "git_branch_list":
		return h.handleGitBranchList(ctx, params)
	case "git_branch_create":
		return h.handleGitBranchCreate(ctx, params)
	case "git_branch_checkout":
		return h.handleGitBranchCheckout(ctx, params)
	case "git_push":
		return h.handleGitPush(ctx, params)
	case "git_pull":
		return h.handleGitPull(ctx, params)
	case "git_stash":
		return h.handleGitStash(ctx, params)
	case "git_stash_pop":
		return h.handleGitStashPop(ctx, params)
	case "git_undo_commit":
		return h.handleGitUndoCommit(ctx, params)
	case "git_diff_lines":
		return h.handleGitDiffLines(ctx, params)
	case "git_blame":
		return h.handleGitBlame(ctx, params)
	case "git_worktree_list":
		return h.handleGitWorktreeList(ctx, params)
	case "git_worktree_add":
		return h.handleGitWorktreeAdd(ctx, params)
	case "git_worktree_remove":
		return h.handleGitWorktreeRemove(ctx, params)
	case "replace_content":
		return h.handleReplaceContent(ctx, params)
	case "reveal_file":
		return h.handleRevealFile(ctx, params)

	// LSP integration
	case "lsp_completion":
		return h.handleLSPCompletion(ctx, params)
	case "lsp_hover":
		return h.handleLSPHover(ctx, params)
	case "lsp_definition":
		return h.handleLSPDefinition(ctx, params)
	case "lsp_implementation":
		return h.handleLSPImplementation(ctx, params)
	case "lsp_type_definition":
		return h.handleLSPTypeDefinition(ctx, params)
	case "lsp_references":
		return h.handleLSPReferences(ctx, params)
	case "lsp_did_open":
		return h.handleLSPDidOpen(ctx, params)
	case "lsp_did_change":
		return h.handleLSPDidChange(ctx, params)
	case "lsp_did_change_incremental":
		return h.handleLSPDidChangeIncremental(ctx, params)
	case "lsp_did_close":
		return h.handleLSPDidClose(ctx, params)
	case "lsp_did_save":
		return h.handleLSPDidSave(ctx, params)
	case "lsp_status":
		return h.handleLSPStatus(ctx, params)
	case "lsp_supports_incremental":
		return h.handleLSPSupportsIncremental(ctx, params)
	case "lsp_diagnostics":
		return h.handleLSPDiagnostics(ctx, params)
	case "lsp_signature_help":
		return h.handleLSPSignatureHelp(ctx, params)
	case "lsp_document_symbols":
		return h.handleLSPDocumentSymbols(ctx, params)
	case "lsp_document_highlight":
		return h.handleLSPDocumentHighlight(ctx, params)
	case "lsp_code_actions":
		return h.handleLSPCodeActions(ctx, params)
	case "lsp_inlay_hints":
		return h.handleLSPInlayHints(ctx, params)
	case "lsp_folding_ranges":
		return h.handleLSPFoldingRanges(ctx, params)
	case "lsp_workspace_symbols":
		return h.handleLSPWorkspaceSymbols(ctx, params)
	case "lsp_rename":
		return h.handleLSPRename(ctx, params)
	case "lsp_formatting":
		return h.handleLSPFormatting(ctx, params)
	case "lsp_range_formatting":
		return h.handleLSPRangeFormatting(ctx, params)
	case "lsp_selection_range":
		return h.handleLSPSelectionRange(ctx, params)
	case "lsp_on_type_formatting":
		return h.handleLSPOnTypeFormatting(ctx, params)
	case "lsp_semantic_tokens":
		return h.handleLSPSemanticTokens(ctx, params)
	case "lsp_semantic_tokens_range":
		return h.handleLSPSemanticTokensRange(ctx, params)
	case "lsp_semantic_tokens_legend":
		return h.handleLSPSemanticTokensLegend(ctx, params)
	case "lsp_document_links":
		return h.handleLSPDocumentLinks(ctx, params)
	case "lsp_code_lenses":
		return h.handleLSPCodeLenses(ctx, params)

	// Call Hierarchy
	case "lsp_prepare_call_hierarchy":
		return h.handlePrepareCallHierarchy(ctx, params)
	case "lsp_call_hierarchy_incoming_calls":
		return h.handleCallHierarchyIncomingCalls(ctx, params)
	case "lsp_call_hierarchy_outgoing_calls":
		return h.handleCallHierarchyOutgoingCalls(ctx, params)

	// Type Hierarchy
	case "lsp_prepare_type_hierarchy":
		return h.handlePrepareTypeHierarchy(ctx, params)
	case "lsp_type_hierarchy_supertypes":
		return h.handleTypeHierarchySupertypes(ctx, params)
	case "lsp_type_hierarchy_subtypes":
		return h.handleTypeHierarchySubtypes(ctx, params)

	// Workflow management
	case "list_workflows":
		return h.handleListWorkflows(ctx, params)
	case "get_workflow":
		return h.handleGetWorkflow(ctx, params)
	case "create_workflow":
		return h.handleCreateWorkflow(ctx, params)
	case "update_workflow":
		return h.handleUpdateWorkflow(ctx, params)
	case "delete_workflow":
		return h.handleDeleteWorkflow(ctx, params)
	case "execute_workflow":
		return h.handleExecuteWorkflow(ctx, params)
	case "get_workflow_checkpoints":
		return h.handleGetWorkflowCheckpoints(ctx, params)
	case "restore_workflow":
		return h.handleRestoreWorkflow(ctx, params)
	case "resume_workflow":
		return h.handleResumeWorkflow(ctx, params)
	case "add_workflow_node":
		return h.handleAddWorkflowNode(ctx, params)
	case "add_workflow_edge":
		return h.handleAddWorkflowEdge(ctx, params)
	case "export_workflow":
		return h.handleExportWorkflow(ctx, params)
	case "import_workflow":
		return h.handleImportWorkflow(ctx, params)
	case "validate_workflow":
		return h.handleValidateWorkflow(ctx, params)
	case "get_workflow_status":
		return h.handleGetWorkflowStatus(ctx, params)
	case "get_workflow_report":
		return h.handleGetWorkflowReport(ctx, params)
	case "clear_node_cache":
		return h.handleClearNodeCache(ctx, params)
	case "clear_all_caches":
		return h.handleClearAllCaches(ctx, params)

	// Audit Log Commands
	case "list_audit_events":
		return h.handleListAuditEvents(ctx, params)
	case "get_audit_stats":
		return h.handleGetAuditStats(ctx, params)
	case "clear_audit_log":
		return h.handleClearAuditLog(ctx, params)


	// Schedule Runner
	case "start_schedule_runner":
		return h.handleStartScheduleRunner(ctx, params)
	case "stop_schedule_runner":
		return h.handleStopScheduleRunner(ctx, params)
	case "get_schedule_runner_status":
		return h.handleGetScheduleRunnerStatus(ctx, params)

	default:
		return nil, NewAPIError(CodeMethodNotFound, fmt.Sprintf("unknown method: %s", method))
	}
}

// ==================== Agent Handlers ====================






// ==================== Session Handlers ====================



// instructionFiles lists the file names to look for custom instructions, in priority order.
// Cursor uses .cursorrules, VS Code uses AGENTS.md and .instructions.md.
var instructionFiles = []string{
	".swarm-instructions.md", // Swarm Editor primary
	"AGENTS.md",             // VS Code / Windsurf
	".cursorrules",          // Cursor
	".instructions.md",       // VS Code (older)
}

// loadCustomInstructions reads custom instruction files from the workspace root.
// Returns the concatenated content, or empty string if no instruction files found.

// handleGetCustomInstructions returns the current custom instructions content.
// If .swarm-instructions.md exists, returns its content. Otherwise returns empty.

// handleSaveCustomInstructions saves content to .swarm-instructions.md in the workspace root.


// ==================== Permission Handlers ====================

// PermissionResponseRequest represents a permission response from UI
type PermissionResponseRequest struct {
	RequestID  string `json:"requestId"`
	Approved   bool   `json:"approved"`
	ResolvedBy string `json:"resolvedBy"`
	Reason     string `json:"reason,omitempty"`
}

func (h *CommandHandler) handlePermissionResponse(ctx context.Context, params json.RawMessage) (any, error) {
	var req PermissionResponseRequest
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.RequestID == "" {
		return nil, errValidation("requestId is required")
	}
	if req.ResolvedBy == "" {
		return nil, errValidation("resolvedBy is required")
	}

	// Get team manager and respond to permission request
	tm := h.server.TeamManager()
	if tm == nil {
		return nil, NewAPIError(CodeInternalError, "service unavailable")
	}

	pm := tm.PermissionManager()
	if pm == nil {
		return nil, NewAPIError(CodeInternalError, "service unavailable")
	}

	err := pm.RespondToRequest(req.RequestID, req.Approved, req.ResolvedBy, req.Reason)
	if err != nil {
		return nil, safeError("failed to respond to request", err)
	}

	// Audit log permission response for accountability
	if orch := h.server.Orchestrator(); orch != nil {
		if logger := orch.GetAuditLogger(); logger != nil {
			logger.Log("permission.response", req.ResolvedBy,
				fmt.Sprintf("permission_%s", map[bool]string{true: "approved", false: "denied"}[req.Approved]),
				"permission_request", req.RequestID,
				map[string]any{"approved": req.Approved, "reason": req.Reason},
				true, "")
		}
	}

	return map[string]any{
		"requestId": req.RequestID,
		"status":    req.Approved,
	}, nil
}

// ==================== Swarm Handlers ====================


type createSwarmRequest struct {
	Name     string   `json:"name"`
	Topology string   `json:"topology"`
	Strategy string   `json:"strategy"`
	AgentIDs []string `json:"agentIds"`
}






// ==================== Team Handlers ====================






// ==================== MCP Handlers ====================





// ==================== Monitoring Handlers ====================



// ==================== File System Handlers ====================



// searchExcludeDirs are directories to skip during recursive file search
var searchExcludeDirs = map[string]bool{
	".git":          true,
	"node_modules":  true,
	"dist":          true,
	"build":         true,
	".next":         true,
	"__pycache__":   true,
	"vendor":        true,
	"target":        true,
	"bin":           true,
	".cache":        true,
	".terraform":    true,
	".idea":         true,
	".vscode":       true,
}


// ContentSearchResult represents a single match in content search
type ContentSearchResult struct {
	Path    string `json:"path"`
	Line    int    `json:"line"`    // 0-indexed
	Column  int    `json:"column"`  // 0-indexed
	Content string `json:"content"` // The matched line text
}

















func (h *CommandHandler) getCurrentBranch(ctx context.Context) (string, error) {
	cmd := exec.CommandContext(ctx, "git", "branch", "--show-current")
	cmd.Dir = h.server.workspacePath
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

// handleGitDiffLines returns line-level diff ranges for gutter decorations (VS Code pattern)


type ReplaceResult struct {
	Path      string `json:"path"`
	Line      int    `json:"line"`
	Column    int    `json:"column"`
	OldLine   string `json:"oldLine"`
	NewLine   string `json:"newLine"`
}


// caseInsensitiveReplaceAll replaces all occurrences of old in s, ignoring case.
// preserveCaseMatch adapts the casing of replacement to match the original matched text.
// Mirrors VS Code's buildReplaceStringWithCasePreserved logic.
func preserveCaseMatch(match, replacement string) string {
	if match == replacement || len(match) == 0 || len(replacement) == 0 {
		return replacement
	}
	// Both hyphenated/underscored with same segment count? Process independently
	var sep rune
	for _, c := range match {
		if c == '-' || c == '_' {
			sep = c
			break
		}
	}
	if sep != 0 {
		mParts := strings.Split(match, string(sep))
		rParts := strings.Split(replacement, string(sep))
		if len(mParts) == len(rParts) {
			result := make([]string, len(rParts))
			for i, p := range rParts {
				result[i] = preserveCaseMatch(mParts[i], p)
			}
			return strings.Join(result, string(sep))
		}
	}
	if match == strings.ToUpper(match) {
		return strings.ToUpper(replacement)
	}
	if match == strings.ToLower(match) {
		return strings.ToLower(replacement)
	}
	// Title case: first char upper, rest lower (e.g. "Hello")
	if len(match) > 1 && match[0] >= 'A' && match[0] <= 'Z' && match[1:] == strings.ToLower(match[1:]) {
		if len(replacement) > 0 {
			return strings.ToUpper(string(replacement[0])) + strings.ToLower(replacement[1:])
		}
		return replacement
	}
	// Inverted title: first char lower, rest upper (e.g. "hELLO")
	if len(match) > 1 && match[0] >= 'a' && match[0] <= 'z' && match[1:] == strings.ToUpper(match[1:]) {
		if len(replacement) > 0 {
			return strings.ToLower(string(replacement[0])) + strings.ToUpper(replacement[1:])
		}
		return replacement
	}
	return replacement
}

// caseInsensitiveReplaceAllWithCasePreserve replaces all occurrences of old with new,
// adapting the casing of new to match each occurrence's casing in s.
func caseInsensitiveReplaceAllWithCasePreserve(s, old, replacement string) string {
	if old == "" {
		return s
	}
	lowerS := strings.ToLower(s)
	lowerOld := strings.ToLower(old)
	var result strings.Builder
	result.Grow(len(s) + (len(replacement)-len(old))*strings.Count(lowerS, lowerOld))
	start := 0
	for {
		idx := strings.Index(lowerS[start:], lowerOld)
		if idx < 0 {
			result.WriteString(s[start:])
			break
		}
		match := s[start+idx : start+idx+len(old)]
		result.WriteString(s[start : start+idx])
		result.WriteString(preserveCaseMatch(match, replacement))
		start += idx + len(old)
	}
	return result.String()
}

func caseInsensitiveReplaceAll(s, old, new string) string {
	if old == "" {
		return s
	}
	lowerS := strings.ToLower(s)
	lowerOld := strings.ToLower(old)
	var result strings.Builder
	result.Grow(len(s) + (len(new)-len(old))*strings.Count(lowerS, lowerOld))
	start := 0
	for {
		idx := strings.Index(lowerS[start:], lowerOld)
		if idx < 0 {
			result.WriteString(s[start:])
			break
		}
		result.WriteString(s[start : start+idx])
		result.WriteString(new)
		start += idx + len(old)
	}
	return result.String()
}

// isBinaryExt checks if the file extension is known to be binary
func isBinaryExt(ext string) bool {
	binaryExts := map[string]bool{
		".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".ico": true,
		".pdf": true, ".zip": true, ".tar": true, ".gz": true, ".bz2": true,
		".exe": true, ".dll": true, ".so": true, ".dylib": true,
		".mp3": true, ".mp4": true, ".wav": true, ".avi": true,
		".ttf": true, ".otf": true, ".woff": true, ".woff2": true,
		".eot": true, ".class": true, ".jar": true, ".war": true,
	}
	return binaryExts[ext]
}

// isBinaryContent checks if content looks binary (null bytes)
func isBinaryContent(content []byte) bool {
	// Check first 512 bytes for null bytes
	checkLen := len(content)
	if checkLen > 512 {
		checkLen = 512
	}
	for i := 0; i < checkLen; i++ {
		if content[i] == 0 {
			return true
		}
	}
	return false
}

// safePath validates and resolves a relative path within the workspace.
// It uses EvalSymlinks to prevent symlink traversal attacks.
// For non-existent paths (e.g., creating new files), it falls back to validating
// the parent directory with EvalSymlinks and checking the cleaned path.
func (h *CommandHandler) safePath(relPath string) (string, error) {
	if relPath == "" {
		return "", errValidation("path is required")
	}

	if h.server.workspacePath == "" {
		return "", errNotConnected("workspace not configured")
	}

	path := filepath.Clean(relPath)
	path = filepath.Join(h.server.workspacePath, path)

	absWorkspace, err := filepath.EvalSymlinks(h.server.workspacePath)
	if err != nil {
		return "", errValidation("invalid workspace configuration")
	}

	// Try EvalSymlinks first (works for existing paths)
	absPath, err := filepath.EvalSymlinks(path)
	if err == nil {
		// Path exists — verify it's within workspace
		if !strings.HasPrefix(absPath, absWorkspace+string(filepath.Separator)) && absPath != absWorkspace {
			return "", errUnauthorized("access denied: path outside workspace")
		}
		return absPath, nil
	}

	// Path doesn't exist — validate parent directory and check for ".." traversal
	parentDir := filepath.Dir(path)
	absParent, err := filepath.EvalSymlinks(parentDir)
	if err != nil {
		// Parent doesn't exist either — fall back to Abs and check no ".." components
		absParent, err = filepath.Abs(parentDir)
		if err != nil {
			return "", errValidation("invalid path")
		}
		relToWorkspace, relErr := filepath.Rel(absWorkspace, absParent)
		if relErr != nil || strings.HasPrefix(relToWorkspace, "..") {
			return "", errUnauthorized("access denied: path outside workspace")
		}
	} else {
		// Parent exists — verify it's within workspace
		if !strings.HasPrefix(absParent, absWorkspace+string(filepath.Separator)) && absParent != absWorkspace {
			return "", errUnauthorized("access denied: path outside workspace")
		}
	}

	// Use Abs for the full path (preserves the intended path without symlink resolution
	// since the file doesn't exist yet)
	absPath, err = filepath.Abs(path)
	if err != nil {
		return "", errValidation("invalid path")
	}
	if !strings.HasPrefix(absPath, absWorkspace+string(filepath.Separator)) && absPath != absWorkspace {
		return "", errUnauthorized("access denied: path outside workspace")
	}

	return absPath, nil
}



// handleDeleteFile deletes a file or directory

// handleRenameFile renames a file or directory

// handleCreateFile creates a new empty file

// handleCopyFile copies a file or directory to a new location

// copyFileContents copies a single file with explicit close (avoids defer-in-loop FD leak)
func copyFileContents(srcPath, dstPath string, _ os.FileMode) error {
	srcFile, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	srcInfo, err := srcFile.Stat()
	if err != nil {
		srcFile.Close()
		return err
	}

	dstFile, err := os.OpenFile(dstPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, srcInfo.Mode())
	if err != nil {
		srcFile.Close()
		return err
	}

	_, copyErr := io.Copy(dstFile, srcFile)
	closeSrcErr := srcFile.Close()
	closeDstErr := dstFile.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeSrcErr != nil {
		return closeSrcErr
	}
	_ = closeDstErr
	return nil
}

// handleMkdir creates a new directory

// ==================== Additional Agent Handlers ====================





// ==================== Additional Swarm Handlers ====================




// ==================== Additional MCP Handlers ====================



// ==================== Workflow Handlers ====================





























// workflowToMap converts a workflow snapshot to a map for JSON serialization
func workflowToMap(w *swarm.Workflow) map[string]any {
	if w == nil {
		return nil
	}

	s := w.Snapshot()

	nodes := make([]map[string]any, 0, len(s.Nodes))
	for _, n := range s.Nodes {
		nodeMap := map[string]any{
			"id":       n.ID,
			"name":     n.Name,
			"agentId":  n.AgentID,
			"type":     n.Type,
			"status":   string(n.Status),
			"position": n.Position,
		}
		// Add optional fields only if they have values
		if n.SubgraphID != "" {
			nodeMap["subgraphId"] = n.SubgraphID
		}
		if n.Config != nil {
			nodeMap["config"] = n.Config
		}
		if n.Result != nil {
			nodeMap["result"] = n.Result
		}
		if n.StartedAt != nil {
			nodeMap["startedAt"] = n.StartedAt.Format(time.RFC3339Nano)
		}
		if n.CompletedAt != nil {
			nodeMap["completedAt"] = n.CompletedAt.Format(time.RFC3339Nano)
		}
		if len(n.DependsOn) > 0 {
			nodeMap["dependsOn"] = n.DependsOn
		}
		// Interrupt fields for human-in-the-loop workflows
		if n.Interrupt {
			nodeMap["interrupt"] = n.Interrupt
		}
		if n.InterruptBefore {
			nodeMap["interruptBefore"] = n.InterruptBefore
		}
		if n.InterruptAfter {
			nodeMap["interruptAfter"] = n.InterruptAfter
		}
		if n.ResumeInput != nil {
			nodeMap["resumeInput"] = n.ResumeInput
		}
		if len(n.InterruptActions) > 0 {
			nodeMap["interruptActions"] = n.InterruptActions
		}
		if n.ChosenAction != "" {
			nodeMap["chosenAction"] = n.ChosenAction
		}
		nodes = append(nodes, nodeMap)
	}

	edges := make([]map[string]any, 0, len(s.Edges))
	for _, e := range s.Edges {
		edges = append(edges, map[string]any{
			"id":        e.ID,
			"from":      e.From,
			"to":        e.To,
			"condition": e.Condition,
			"label":     e.Label,
		})
	}

	return map[string]any{
		"id":                s.ID,
		"name":              s.Name,
		"description":       s.Description,
		"mode":              string(s.Mode),
		"status":            s.Status,
		"nodes":             nodes,
		"edges":             edges,
		"createdAt":         s.CreatedAt.Format(time.RFC3339),
		"updatedAt":         s.UpdatedAt.Format(time.RFC3339),
		"interruptedNodeId": s.InterruptedNodeID,
		"interruptPhase":    s.InterruptPhase,
		"onComplete":        s.OnComplete,
	}
}

// safeError wraps an error for client responses without exposing internal details.
// It logs the full error internally and returns a generic APIError to the client.
func safeError(msg string, err error) error {
	// Log full error internally for debugging
	apiLog.Error("Internal error", "msg", msg, "error", err)
	// Return APIError with internal error code
	return NewAPIError(CodeInternalError, msg)
}

// safeUnmarshalError returns a generic JSON parse error without exposing details.
func safeUnmarshalError(err error) error {
	apiLog.Error("JSON unmarshal error", "error", err)
	return errValidation("invalid request format")
}

// ==================== Audit Log Handlers ====================

// handleListAuditEvents returns audit events with optional filtering

// handleGetAuditStats returns audit log statistics

// handleClearAuditLog clears the in-memory audit log
// WARNING: This is a destructive operation. Requires confirm=true parameter.

// ==================== Schedule Runner Handlers ====================

// handleStartScheduleRunner starts the cron-based schedule runner.

// handleStopScheduleRunner stops the cron-based schedule runner.

// handleGetScheduleRunnerStatus returns the schedule runner's full status snapshot.

// ==================== LSP Handlers ====================
























// ==================== Call Hierarchy ====================




func mapToCallHierarchyItem(m map[string]any) lsp.CallHierarchyItem {
	item := lsp.CallHierarchyItem{}
	if name, ok := m["name"].(string); ok {
		item.Name = name
	}
	if kind, ok := m["kind"].(float64); ok {
		item.Kind = int(kind)
	}
	if detail, ok := m["detail"].(string); ok {
		item.Detail = detail
	}
	if uri, ok := m["uri"].(string); ok {
		item.URI = uri
	}
	if r, ok := m["range"].(map[string]any); ok {
		item.Range = mapToRange(r)
	}
	if sr, ok := m["selectionRange"].(map[string]any); ok {
		item.SelectionRange = mapToRange(sr)
	}
	if tags, ok := m["tags"].([]any); ok {
		item.Tags = make([]int, 0, len(tags))
		for _, t := range tags {
			if f, ok := t.(float64); ok {
				item.Tags = append(item.Tags, int(f))
			}
		}
	}
	if data, ok := m["data"]; ok {
		item.Data = data
	}
	return item
}

func mapToRange(m map[string]any) lsp.Range {
	r := lsp.Range{}
	if start, ok := m["start"].(map[string]any); ok {
		r.Start = mapToPosition(start)
	}
	if end, ok := m["end"].(map[string]any); ok {
		r.End = mapToPosition(end)
	}
	return r
}

func mapToPosition(m map[string]any) lsp.Position {
	p := lsp.Position{}
	if line, ok := m["line"].(float64); ok {
		p.Line = int(line)
	}
	if char, ok := m["character"].(float64); ok {
		p.Character = int(char)
	}
	return p
}

// ==================== Type Hierarchy ====================




func mapToTypeHierarchyItem(m map[string]any) lsp.TypeHierarchyItem {
	item := lsp.TypeHierarchyItem{}
	if name, ok := m["name"].(string); ok {
		item.Name = name
	}
	if kind, ok := m["kind"].(float64); ok {
		item.Kind = int(kind)
	}
	if detail, ok := m["detail"].(string); ok {
		item.Detail = detail
	}
	if uri, ok := m["uri"].(string); ok {
		item.URI = uri
	}
	if r, ok := m["range"].(map[string]any); ok {
		item.Range = mapToRange(r)
	}
	if sr, ok := m["selectionRange"].(map[string]any); ok {
		item.SelectionRange = mapToRange(sr)
	}
	if tags, ok := m["tags"].([]any); ok {
		item.Tags = make([]int, 0, len(tags))
		for _, t := range tags {
			if f, ok := t.(float64); ok {
				item.Tags = append(item.Tags, int(f))
			}
		}
	}
	if data, ok := m["data"]; ok {
		item.Data = data
	}
	return item
}









// handleRevealFile reveals a file in the OS file manager (VS Code "Reveal in Explorer" pattern)
