package api

// Status constants — unified response status values used across all handlers.
// Follow Google Go Style Guide: group related constants, use typed string constants.
const (
	StatusStarted    = "started"
	StatusStopped    = "stopped"
	StatusDeleted    = "deleted"
	StatusCreated    = "created"
	StatusCopied     = "copied"
	StatusWritten    = "written"
	StatusCancelled  = "cancelled"
	StatusSubmitted  = "submitted"
	StatusRunning    = "running"
	StatusPending    = "pending"
	StatusCompleted  = "completed"
	StatusConnected  = "connected"
	StatusDiscovered = "discovered"
	StatusError      = "error"
)

// Agent type constants — categorize agent sources.
const (
	AgentTypeCLI      = "cli"
	AgentTypeExternal = "external"
)

// Agent state constants — runtime states reported to the UI.
const (
	AgentStateAvailable   = "available"
	AgentStateConnected   = "connected"
	AgentStateRunning     = "running"
	AgentStateIdle        = "idle"
	AgentStateUnreachable = "unreachable"
	AgentStateBusy        = "busy"
)

// Input validation limits.
const (
	MaxNameLen  = 100
	MaxDescLen  = 500
	MaxTitleLen = 200
	MaxIDLen    = 128
	MaxSessions = 1000
)

// Backward-compatible aliases — existing code uses unexported names.
const (
	maxNameLen  = MaxNameLen
	maxDescLen  = MaxDescLen
	maxTitleLen = MaxTitleLen
	maxIDLen    = MaxIDLen
	maxSessions = MaxSessions
)

// Validation error messages.
const (
	ErrIDRequired      = "id is required"
	ErrNameRequired    = "name is required"
	ErrPathRequired    = "path is required"
	ErrCommandRequired = "command is required"
	ErrContentRequired = "content is required"
	ErrNotFound        = "not found"
)
