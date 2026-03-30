package acp

import "encoding/json"

// ==================== Initialization Types ====================

// InitializeParams represents the initialize request parameters
type InitializeParams struct {
	ProtocolVersion    int                `json:"protocolVersion"`
	ClientCapabilities ClientCapabilities `json:"clientCapabilities,omitempty"`
	ClientInfo         ImplementationInfo `json:"clientInfo"`
}

// InitializeResult represents the initialize response
type InitializeResult struct {
	ProtocolVersion   int                `json:"protocolVersion"`
	AgentCapabilities AgentCapabilities  `json:"agentCapabilities"`
	AgentInfo         ImplementationInfo `json:"agentInfo"`
	AuthMethods       []AuthMethod       `json:"authMethods"`
}

// ImplementationInfo describes a client or agent implementation
type ImplementationInfo struct {
	Name    string `json:"name"`
	Title   string `json:"title,omitempty"`
	Version string `json:"version"`
}

// ClientCapabilities describes what the client supports
type ClientCapabilities struct {
	FileSystem FileSystemCapabilities `json:"fs,omitempty"`
	Terminal   bool                   `json:"terminal,omitempty"`
}

// FileSystemCapabilities describes file system capabilities
type FileSystemCapabilities struct {
	ReadTextFile  bool `json:"readTextFile,omitempty"`
	WriteTextFile bool `json:"writeTextFile,omitempty"`
}

// AgentCapabilities describes what the agent supports
type AgentCapabilities struct {
	LoadSession        bool               `json:"loadSession,omitempty"`
	PromptCapabilities PromptCapabilities `json:"promptCapabilities,omitempty"`
	MCP                MCPCapabilities    `json:"mcp,omitempty"`
	// Swarm extension
	SwarmMode         *SwarmCapabilities `json:"swarm,omitempty"`
	PairProgramming   bool               `json:"pairProgramming,omitempty"`
	TeamCollaboration bool               `json:"teamCollaboration,omitempty"`
}

// PromptCapabilities describes prompt content capabilities
type PromptCapabilities struct {
	Image           bool `json:"image,omitempty"`
	Audio           bool `json:"audio,omitempty"`
	EmbeddedContext bool `json:"embeddedContext,omitempty"`
}

// MCPCapabilities describes MCP server connection capabilities
type MCPCapabilities struct {
	HTTP bool `json:"http,omitempty"`
	SSE  bool `json:"sse,omitempty"` // Deprecated
}

// SwarmCapabilities describes swarm mode capabilities
type SwarmCapabilities struct {
	MaxAgents     int      `json:"maxAgents,omitempty"`
	Topologies    []string `json:"topologies,omitempty"`
	TaskDecompose bool     `json:"taskDecompose,omitempty"`
	Consensus     bool     `json:"consensus,omitempty"`
}

// AuthMethod represents an authentication method
type AuthMethod struct {
	Type string `json:"type"` // "none", "apiKey", "oauth"
	Name string `json:"name,omitempty"`
}

// ==================== Session Types ====================

// SessionID uniquely identifies a session
type SessionID string

// SessionMode represents the operating mode of a session
type SessionMode string

const (
	ModeDefault    SessionMode = "default"
	ModePlanning   SessionMode = "planning"
	ModeEditing    SessionMode = "editing"
	ModeReviewing  SessionMode = "reviewing"
	ModePairDriver SessionMode = "pair_driver"
	ModePairNav    SessionMode = "pair_navigator"
	ModeSwarm      SessionMode = "swarm"
)

// SessionNewParams creates a new session
type SessionNewParams struct {
	SessionID     SessionID       `json:"sessionId,omitempty"`
	Mode          SessionMode     `json:"mode,omitempty"`
	ConfigOptions json.RawMessage `json:"configOptions,omitempty"`
	// Swarm extensions
	SwarmConfig *SwarmSessionConfig `json:"swarmConfig,omitempty"`
	PairPartner *AgentID            `json:"pairPartner,omitempty"`
	TeamID      string              `json:"teamId,omitempty"`
}

// SwarmSessionConfig configures swarm mode for a session
type SwarmSessionConfig struct {
	Topology     string   `json:"topology"` // "star", "mesh", "tree", "ring"
	AgentCount   int      `json:"agentCount"`
	AgentTypes   []string `json:"agentTypes,omitempty"`
	TaskStrategy string   `json:"taskStrategy"` // "parallel", "sequential", "pipeline"
}

// SessionNewResult is the result of session creation
type SessionNewResult struct {
	SessionID SessionID   `json:"sessionId"`
	Mode      SessionMode `json:"mode"`
}

// SessionLoadParams loads an existing session
type SessionLoadParams struct {
	SessionID SessionID `json:"sessionId"`
}

// SessionLoadResult is the result of loading a session
type SessionLoadResult struct {
	SessionID SessionID   `json:"sessionId"`
	Mode      SessionMode `json:"mode"`
	// Could include conversation history, etc.
}

// SessionSetModeParams changes the session mode
type SessionSetModeParams struct {
	SessionID SessionID   `json:"sessionId"`
	Mode      SessionMode `json:"mode"`
}

// ==================== Prompt Turn Types ====================

// Prompt represents user input content
type Prompt []ContentBlock

// ContentBlock represents a piece of content in a prompt
type ContentBlock struct {
	Type         string        `json:"type"` // "text", "image", "audio", "resource", "resourceLink"
	Text         string        `json:"text,omitempty"`
	Image        *ImageData    `json:"image,omitempty"`
	Audio        *AudioData    `json:"audio,omitempty"`
	Resource     *Resource     `json:"resource,omitempty"`
	ResourceLink *ResourceLink `json:"resourceLink,omitempty"`
}

// ImageData represents an image content
type ImageData struct {
	Data     string `json:"data"` // Base64
	MimeType string `json:"mimeType"`
}

// AudioData represents an audio content
type AudioData struct {
	Data     string `json:"data"` // Base64
	MimeType string `json:"mimeType"`
}

// Resource represents an embedded resource
type Resource struct {
	URI      string `json:"uri"`
	MimeType string `json:"mimeType,omitempty"`
	Text     string `json:"text,omitempty"`
	Blob     string `json:"blob,omitempty"` // Base64
}

// ResourceLink is a reference to a resource
type ResourceLink struct {
	URI      string `json:"uri"`
	MimeType string `json:"mimeType,omitempty"`
}

// SessionPromptParams sends a prompt to the session
type SessionPromptParams struct {
	SessionID SessionID `json:"sessionId"`
	Prompt    Prompt    `json:"prompt"`
}

// SessionPromptResult is the result of a prompt turn
type SessionPromptResult struct {
	StopReason StopReason `json:"stopReason"`
}

// StopReason indicates why the agent stopped
type StopReason string

const (
	StopEndTurn     StopReason = "end_turn"
	StopMaxTokens   StopReason = "max_tokens"
	StopMaxRequests StopReason = "max_turn_requests"
	StopRefusal     StopReason = "refusal"
	StopCancelled   StopReason = "cancelled"
)

// ==================== Update Types ====================

// SessionUpdateParams is sent by the agent to update the session
type SessionUpdateParams struct {
	SessionID SessionID `json:"sessionId"`
	Update    Update    `json:"update"`
}

// Update represents a session update
type Update struct {
	SessionUpdate string `json:"sessionUpdate"`
	// Fields depend on sessionUpdate type
	Plan          *PlanUpdate        `json:"entries,omitempty"`
	Content       *ContentBlock      `json:"content,omitempty"`
	ToolCallID    string             `json:"toolCallId,omitempty"`
	Title         string             `json:"title,omitempty"`
	Kind          ToolKind           `json:"kind,omitempty"`
	Status        ToolCallStatus     `json:"status,omitempty"`
	ContentBlocks []ToolCallContent  `json:"contentBlocks,omitempty"`
	Locations     []ToolCallLocation `json:"locations,omitempty"`
	RawInput      json.RawMessage    `json:"rawInput,omitempty"`
	RawOutput     json.RawMessage    `json:"rawOutput,omitempty"`
	// Swarm extensions
	AgentID         AgentID          `json:"agentId,omitempty"`
	SwarmTaskID     string           `json:"swarmTaskId,omitempty"`
	ConsensusResult *ConsensusResult `json:"consensusResult,omitempty"`
}

// PlanUpdate represents a plan with entries
type PlanUpdate struct {
	Entries []PlanEntry `json:"entries"`
}

// PlanEntry represents a single plan item
type PlanEntry struct {
	Content  string `json:"content"`
	Priority string `json:"priority,omitempty"` // "high", "medium", "low"
	Status   string `json:"status"`             // "pending", "in_progress", "completed"
}

// ==================== Tool Call Types ====================

// ToolCallID uniquely identifies a tool call
type ToolCallID string

// ToolKind categorizes the tool
type ToolKind string

const (
	ToolRead    ToolKind = "read"
	ToolEdit    ToolKind = "edit"
	ToolDelete  ToolKind = "delete"
	ToolMove    ToolKind = "move"
	ToolSearch  ToolKind = "search"
	ToolExecute ToolKind = "execute"
	ToolThink   ToolKind = "think"
	ToolFetch   ToolKind = "fetch"
	ToolOther   ToolKind = "other"
)

// ToolCallStatus represents the status of a tool call
type ToolCallStatus string

const (
	StatusPending    ToolCallStatus = "pending"
	StatusInProgress ToolCallStatus = "in_progress"
	StatusCompleted  ToolCallStatus = "completed"
	StatusFailed     ToolCallStatus = "failed"
)

// ToolCallContent represents content from a tool call
type ToolCallContent struct {
	Type     string           `json:"type"` // "content", "diff", "terminal"
	Content  *ContentBlock    `json:"content,omitempty"`
	Diff     *DiffContent     `json:"diff,omitempty"`
	Terminal *TerminalContent `json:"terminal,omitempty"`
}

// DiffContent represents a file diff
type DiffContent struct {
	Path    string `json:"path"`
	OldText string `json:"oldText,omitempty"`
	NewText string `json:"newText"`
}

// TerminalContent references terminal output
type TerminalContent struct {
	TerminalID string `json:"terminalId"`
}

// ToolCallLocation tracks file locations
type ToolCallLocation struct {
	Path string `json:"path"`
	Line int    `json:"line,omitempty"`
}

// ==================== Permission Types ====================

// SessionRequestPermissionParams requests permission from user
type SessionRequestPermissionParams struct {
	SessionID SessionID          `json:"sessionId"`
	ToolCall  ToolCallInfo       `json:"toolCall"`
	Options   []PermissionOption `json:"options"`
}

// ToolCallInfo describes a tool call for permission request
type ToolCallInfo struct {
	ToolCallID ToolCallID `json:"toolCallId"`
	Title      string     `json:"title,omitempty"`
	Kind       ToolKind   `json:"kind,omitempty"`
}

// PermissionOption represents a permission choice
type PermissionOption struct {
	OptionID string         `json:"optionId"`
	Name     string         `json:"name"`
	Kind     PermissionKind `json:"kind"`
}

// PermissionKind represents the type of permission
type PermissionKind string

const (
	PermAllowOnce    PermissionKind = "allow_once"
	PermAllowAlways  PermissionKind = "allow_always"
	PermRejectOnce   PermissionKind = "reject_once"
	PermRejectAlways PermissionKind = "reject_always"
)

// ==================== Swarm API Types ====================

// Swarm 方法常量
const (
	MethodSwarmCreate      = "swarm/create"
	MethodSwarmStart       = "swarm/start"
	MethodSwarmStop        = "swarm/stop"
	MethodSwarmSubmitTask  = "swarm/submitTask"
	MethodSwarmExecuteTask = "swarm/executeTask"
	MethodSwarmGetStatus   = "swarm/getStatus"
)

// SwarmCreateParams 创建 Swarm 参数
type SwarmCreateParams struct {
	Name     string   `json:"name"`
	Topology string   `json:"topology"`
	Strategy string   `json:"strategy"`
	AgentIDs []string `json:"agentIds"`
}

// SwarmCreateResult 创建 Swarm 结果
type SwarmCreateResult struct {
	SwarmID string `json:"swarmId"`
}

// SwarmStartParams 启动 Swarm 参数
type SwarmStartParams struct {
	SwarmID string `json:"swarmId"`
}

// SwarmStopParams 停止 Swarm 参数
type SwarmStopParams struct {
	SwarmID string `json:"swarmId"`
}

// SwarmSubmitTaskParams 提交任务参数
type SwarmSubmitTaskParams struct {
	SwarmID     string `json:"swarmId"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Prompt      Prompt `json:"prompt"`
	Priority    int    `json:"priority"`
}

// SwarmSubmitTaskResult 提交任务结果
type SwarmSubmitTaskResult struct {
	TaskID string `json:"taskId"`
}

// SwarmExecuteTaskParams 执行任务参数
type SwarmExecuteTaskParams struct {
	SwarmID string `json:"swarmId"`
	TaskID  string `json:"taskId"`
}

// SwarmGetStatusParams 获取状态参数
type SwarmGetStatusParams struct {
	SwarmID string `json:"swarmId"`
}

// SwarmStatusResult 状态结果
type SwarmStatusResult struct {
	SwarmID         string `json:"swarmId"`
	State           string `json:"state"`
	AgentCount      int    `json:"agentCount"`
	IdleAgents      int    `json:"idleAgents"`
	ExecutingAgents int    `json:"executingAgents"`
	PendingTasks    int    `json:"pendingTasks"`
	CompletedTasks  int    `json:"completedTasks"`
	Topology        string `json:"topology"`
	Strategy        string `json:"strategy"`
}

// SwarmTaskResult 任务执行结果
type SwarmTaskResult struct {
	TaskID       string                     `json:"taskId"`
	Status       string                     `json:"status"`
	Output       string                     `json:"output"`
	AgentResults map[string]AgentTaskResult `json:"agentResults"`
}

// AgentTaskResult Agent 任务结果
type AgentTaskResult struct {
	AgentID    string `json:"agentId"`
	Status     string `json:"status"`
	Output     string `json:"output"`
	DurationMs int64  `json:"durationMs"`
}

// PermissionOutcome is the result of a permission request
type PermissionOutcome struct {
	Outcome  string `json:"outcome"` // "selected", "cancelled"
	OptionID string `json:"optionId,omitempty"`
}

// ==================== Cancel Types ====================

// SessionCancelParams cancels an ongoing prompt turn
type SessionCancelParams struct {
	SessionID SessionID `json:"sessionId"`
}

// ==================== Agent Types (Swarm Extension) ====================

// AgentID uniquely identifies an agent
type AgentID string

// ConsensusResult represents the result of swarm consensus
type ConsensusResult struct {
	TaskID        string              `json:"taskId"`
	Status        string              `json:"status"` // "agreed", "disagreed", "partial"
	Contributions []AgentContribution `json:"contributions"`
	FinalResult   json.RawMessage     `json:"finalResult,omitempty"`
}

// AgentContribution represents an agent's contribution to a task
type AgentContribution struct {
	AgentID AgentID         `json:"agentId"`
	Content json.RawMessage `json:"content"`
	Vote    string          `json:"vote,omitempty"` // "approve", "reject", "abstain"
	Weight  float64         `json:"weight,omitempty"`
}

// ==================== MCP Types ====================

// MCPStartServerParams parameters for starting an MCP server
type MCPStartServerParams struct {
	ServerID string `json:"serverId"`
}

// MCPStopServerParams parameters for stopping an MCP server
type MCPStopServerParams struct {
	ServerID string `json:"serverId"`
}

// MCPServerStatus represents the status of an MCP server
type MCPServerStatus struct {
	ServerID string `json:"serverId"`
	Name     string `json:"name"`
	Status   string `json:"status"` // "connected", "disconnected", "connecting", "error"
	Tools    []Tool `json:"tools,omitempty"`
	Error    string `json:"error,omitempty"`
}

// Tool represents an MCP tool definition
type Tool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"inputSchema"`
}

// MCPCallToolParams parameters for calling an MCP tool
type MCPCallToolParams struct {
	ServerID  string         `json:"serverId"`
	ToolName  string         `json:"toolName"`
	Arguments map[string]any `json:"arguments"`
}

// MCPCallToolResult result of calling an MCP tool
type MCPCallToolResult struct {
	Content []MCPContent `json:"content"`
	IsError bool         `json:"isError"`
}

// MCPContent represents content in an MCP result
type MCPContent struct {
	Type     string `json:"type"` // "text", "image", "resource"
	Text     string `json:"text,omitempty"`
	Data     string `json:"data,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
}

// MCPListToolsParams parameters for listing MCP tools
type MCPListToolsParams struct {
	ServerID string `json:"serverId"`
}

// MCPListToolsResult result of listing MCP tools
type MCPListToolsResult struct {
	Tools []Tool `json:"tools"`
}
