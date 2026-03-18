//! ACP (Agent Communication Protocol) types
//!
//! This module defines the JSON-RPC 2.0 based message types for ACP,
//! corresponding to the Go implementation in internal/acp/protocol.go

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Protocol version constant
pub const PROTOCOL_VERSION: i32 = 1;

/// JSON-RPC version constant
pub const JSONRPC_VERSION: &str = "2.0";

/// Request ID can be either a number or string
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum RequestId {
    Number(i64),
    String(String),
}

impl Default for RequestId {
    fn default() -> Self {
        RequestId::Number(0)
    }
}

/// JSON-RPC 2.0 message structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    #[serde(rename = "jsonrpc")]
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<RequestId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

impl Message {
    /// Create a new JSON-RPC request
    pub fn new_request(id: RequestId, method: &str, params: Option<Value>) -> Self {
        Self {
            jsonrpc: JSONRPC_VERSION.to_string(),
            id: Some(id),
            method: Some(method.to_string()),
            params,
            result: None,
            error: None,
        }
    }

    /// Create a new JSON-RPC response
    pub fn new_response(id: RequestId, result: Value) -> Self {
        Self {
            jsonrpc: JSONRPC_VERSION.to_string(),
            id: Some(id),
            method: None,
            params: None,
            result: Some(result),
            error: None,
        }
    }

    /// Create a new JSON-RPC error response
    pub fn new_error(id: Option<RequestId>, code: i32, message: &str, data: Option<Value>) -> Self {
        Self {
            jsonrpc: JSONRPC_VERSION.to_string(),
            id,
            method: None,
            params: None,
            result: None,
            error: Some(RpcError {
                code,
                message: message.to_string(),
                data,
            }),
        }
    }

    /// Create a new JSON-RPC notification (no id)
    pub fn new_notification(method: &str, params: Option<Value>) -> Self {
        Self {
            jsonrpc: JSONRPC_VERSION.to_string(),
            id: None,
            method: Some(method.to_string()),
            params,
            result: None,
            error: None,
        }
    }

    /// Check if this is a request (has method and id)
    pub fn is_request(&self) -> bool {
        self.method.is_some() && self.id.is_some()
    }

    /// Check if this is a response (has result or error and id)
    pub fn is_response(&self) -> bool {
        (self.result.is_some() || self.error.is_some()) && self.id.is_some()
    }

    /// Check if this is a notification (has method but no id)
    pub fn is_notification(&self) -> bool {
        self.method.is_some() && self.id.is_none()
    }
}

/// JSON-RPC error structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl std::fmt::Display for RpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ACP error {}: {}", self.code, self.message)
    }
}

impl std::error::Error for RpcError {}

// Standard JSON-RPC error codes
pub const PARSE_ERROR: i32 = -32700;
pub const INVALID_REQUEST: i32 = -32600;
pub const METHOD_NOT_FOUND: i32 = -32601;
pub const INVALID_PARAMS: i32 = -32602;
pub const INTERNAL_ERROR: i32 = -32603;

// Custom ACP error codes (range -32000 to -32099)
pub const ERR_SESSION_NOT_FOUND: i32 = -32001;
pub const ERR_AGENT_NOT_READY: i32 = -32002;
pub const ERR_PERMISSION_DENIED: i32 = -32003;
pub const ERR_TOOL_EXECUTION: i32 = -32004;
pub const ERR_AUTHENTICATION: i32 = -32005;
pub const ERR_SESSION_CANCELLED: i32 = -32006;
pub const ERR_CAPABILITY_NOT_SUPPORTED: i32 = -32007;

// ==================== ACP Message Types ====================

/// Initialize request params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitializeParams {
    #[serde(rename = "protocolVersion")]
    pub protocol_version: i32,
    #[serde(rename = "clientCapabilities")]
    pub client_capabilities: ClientCapabilities,
    #[serde(rename = "clientInfo")]
    pub client_info: ImplementationInfo,
}

/// Initialize response result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitializeResult {
    #[serde(rename = "protocolVersion")]
    pub protocol_version: i32,
    #[serde(rename = "agentCapabilities")]
    pub agent_capabilities: AgentCapabilities,
    #[serde(rename = "agentInfo")]
    pub agent_info: ImplementationInfo,
    #[serde(rename = "authMethods")]
    pub auth_methods: Vec<AuthMethod>,
}

/// Implementation info (client or agent)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImplementationInfo {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub version: String,
}

/// Client capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientCapabilities {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fs: Option<FileSystemCapabilities>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal: Option<bool>,
}

/// File system capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSystemCapabilities {
    #[serde(rename = "readTextFile")]
    pub read_text_file: bool,
    #[serde(rename = "writeTextFile")]
    pub write_text_file: bool,
}

/// Agent capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCapabilities {
    #[serde(rename = "loadSession")]
    pub load_session: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "promptCapabilities")]
    pub prompt_capabilities: Option<PromptCapabilities>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mcp: Option<MCPCapabilities>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swarm: Option<SwarmCapabilities>,
    #[serde(rename = "pairProgramming")]
    pub pair_programming: bool,
    #[serde(rename = "teamCollaboration")]
    pub team_collaboration: bool,
}

/// Prompt capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptCapabilities {
    pub image: bool,
    pub audio: bool,
    #[serde(rename = "embeddedContext")]
    pub embedded_context: bool,
}

/// MCP capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPCapabilities {
    pub http: bool,
    pub sse: bool,
}

/// Swarm capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmCapabilities {
    #[serde(rename = "maxAgents")]
    pub max_agents: i32,
    pub topologies: Vec<String>,
    #[serde(rename = "taskDecompose")]
    pub task_decompose: bool,
    pub consensus: bool,
}

/// Authentication method
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthMethod {
    #[serde(rename = "type")]
    pub method_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Session ID type
pub type SessionId = String;

/// Session mode
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SessionMode {
    #[serde(rename = "default")]
    Default,
    #[serde(rename = "planning")]
    Planning,
    #[serde(rename = "editing")]
    Editing,
    #[serde(rename = "reviewing")]
    Reviewing,
    #[serde(rename = "pair_driver")]
    PairDriver,
    #[serde(rename = "pair_navigator")]
    PairNavigator,
    #[serde(rename = "swarm")]
    Swarm,
}

/// Session new params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionNewParams {
    #[serde(rename = "sessionId")]
    pub session_id: Option<SessionId>,
    pub mode: Option<SessionMode>,
    #[serde(rename = "configOptions")]
    pub config_options: Option<Value>,
    #[serde(rename = "swarmConfig")]
    pub swarm_config: Option<Value>,
    #[serde(rename = "pairPartner")]
    pub pair_partner: Option<String>,
    #[serde(rename = "teamId")]
    pub team_id: Option<String>,
}

/// Session new result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionNewResult {
    #[serde(rename = "sessionId")]
    pub session_id: SessionId,
    pub mode: SessionMode,
}

/// Session prompt params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionPromptParams {
    #[serde(rename = "sessionId")]
    pub session_id: SessionId,
    pub prompt: Vec<ContentBlock>,
}

/// Content block for prompts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentBlock {
    #[serde(rename = "type")]
    pub content_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<ImageData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<AudioData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource: Option<Resource>,
    #[serde(rename = "resourceLink", skip_serializing_if = "Option::is_none")]
    pub resource_link: Option<ResourceLink>,
}

/// Image data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageData {
    pub data: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
}

/// Audio data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioData {
    pub data: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
}

/// Resource
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Resource {
    pub uri: String,
    #[serde(rename = "mimeType", skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blob: Option<String>,
}

/// Resource link
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLink {
    pub uri: String,
    #[serde(rename = "mimeType", skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
}

/// Session prompt result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionPromptResult {
    #[serde(rename = "stopReason")]
    pub stop_reason: StopReason,
}

/// Stop reason for prompt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StopReason {
    #[serde(rename = "end_turn")]
    EndTurn,
    #[serde(rename = "max_tokens")]
    MaxTokens,
    #[serde(rename = "max_turn_requests")]
    MaxTurnRequests,
    #[serde(rename = "refusal")]
    Refusal,
    #[serde(rename = "cancelled")]
    Cancelled,
}

/// Session update params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionUpdateParams {
    #[serde(rename = "sessionId")]
    pub session_id: SessionId,
    pub update: Update,
}

/// Update structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Update {
    #[serde(rename = "sessionUpdate")]
    pub session_update: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan: Option<PlanUpdate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<ContentBlock>,
    #[serde(rename = "toolCallId", skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<ToolKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<ToolCallStatus>,
    #[serde(rename = "contentBlocks", skip_serializing_if = "Option::is_none")]
    pub content_blocks: Option<Vec<ToolCallContent>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locations: Option<Vec<ToolCallLocation>>,
    #[serde(rename = "rawInput", skip_serializing_if = "Option::is_none")]
    pub raw_input: Option<Value>,
    #[serde(rename = "rawOutput", skip_serializing_if = "Option::is_none")]
    pub raw_output: Option<Value>,
    #[serde(rename = "agentId", skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(rename = "swarmTaskId", skip_serializing_if = "Option::is_none")]
    pub swarm_task_id: Option<String>,
    #[serde(rename = "consensusResult", skip_serializing_if = "Option::is_none")]
    pub consensus_result: Option<ConsensusResult>,
}

/// Plan update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanUpdate {
    pub entries: Vec<PlanEntry>,
}

/// Plan entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanEntry {
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<String>,
    pub status: String,
}

/// Tool kind
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ToolKind {
    #[serde(rename = "read")]
    Read,
    #[serde(rename = "edit")]
    Edit,
    #[serde(rename = "delete")]
    Delete,
    #[serde(rename = "move")]
    Move,
    #[serde(rename = "search")]
    Search,
    #[serde(rename = "execute")]
    Execute,
    #[serde(rename = "think")]
    Think,
    #[serde(rename = "fetch")]
    Fetch,
    #[serde(rename = "other")]
    Other,
}

/// Tool call status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ToolCallStatus {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "in_progress")]
    InProgress,
    #[serde(rename = "completed")]
    Completed,
    #[serde(rename = "failed")]
    Failed,
}

/// Tool call content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallContent {
    #[serde(rename = "type")]
    pub content_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<ContentBlock>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diff: Option<DiffContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal: Option<TerminalContent>,
}

/// Diff content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffContent {
    pub path: String,
    #[serde(rename = "oldText", skip_serializing_if = "Option::is_none")]
    pub old_text: Option<String>,
    #[serde(rename = "newText")]
    pub new_text: String,
}

/// Terminal content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalContent {
    #[serde(rename = "terminalId")]
    pub terminal_id: String,
}

/// Tool call location
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallLocation {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<i32>,
}

/// Consensus result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsensusResult {
    #[serde(rename = "taskId")]
    pub task_id: String,
    pub status: String,
    pub contributions: Vec<AgentContribution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "finalResult")]
    pub final_result: Option<Value>,
}

/// Agent contribution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentContribution {
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub content: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vote: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight: Option<f64>,
}

/// Permission option
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionOption {
    #[serde(rename = "optionId")]
    pub option_id: String,
    pub name: String,
    pub kind: PermissionKind,
}

/// Permission kind
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PermissionKind {
    #[serde(rename = "allow_once")]
    AllowOnce,
    #[serde(rename = "allow_always")]
    AllowAlways,
    #[serde(rename = "reject_once")]
    RejectOnce,
    #[serde(rename = "reject_always")]
    RejectAlways,
}

/// Permission outcome
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionOutcome {
    pub outcome: String,
    #[serde(rename = "optionId", skip_serializing_if = "Option::is_none")]
    pub option_id: Option<String>,
}

// ==================== Swarm Types ====================

/// Swarm create params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmCreateParams {
    pub name: String,
    pub topology: String,
    pub strategy: String,
    #[serde(rename = "agentIds")]
    pub agent_ids: Vec<String>,
}

/// Swarm create result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmCreateResult {
    #[serde(rename = "swarmId")]
    pub swarm_id: String,
}

/// Swarm start params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmStartParams {
    #[serde(rename = "swarmId")]
    pub swarm_id: String,
}

/// Swarm stop params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmStopParams {
    #[serde(rename = "swarmId")]
    pub swarm_id: String,
}

/// Swarm submit task params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmSubmitTaskParams {
    #[serde(rename = "swarmId")]
    pub swarm_id: String,
    pub title: String,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i32>,
}

/// Swarm submit task result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmSubmitTaskResult {
    #[serde(rename = "taskId")]
    pub task_id: String,
}

/// Swarm execute task params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmExecuteTaskParams {
    #[serde(rename = "swarmId")]
    pub swarm_id: String,
    #[serde(rename = "taskId")]
    pub task_id: String,
}

/// Swarm task result (from Go backend)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmTaskResult {
    #[serde(rename = "taskId")]
    pub task_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(rename = "agentResults", skip_serializing_if = "Option::is_none")]
    pub agent_results: Option<std::collections::HashMap<String, AgentTaskResult>>,
}

/// Agent task result (from Go backend)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTaskResult {
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub content: String,
    pub success: bool,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
}

/// Swarm get status params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmGetStatusParams {
    #[serde(rename = "swarmId")]
    pub swarm_id: String,
}

/// Swarm status result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmStatusResult {
    #[serde(rename = "swarmId")]
    pub swarm_id: String,
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<SwarmStatsData>,
}

/// Swarm stats data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmStatsData {
    #[serde(rename = "agentCount")]
    pub agent_count: usize,
    #[serde(rename = "idleAgents")]
    pub idle_agents: usize,
    #[serde(rename = "executingAgents")]
    pub executing_agents: usize,
    #[serde(rename = "pendingTasks")]
    pub pending_tasks: usize,
    #[serde(rename = "completedTasks")]
    pub completed_tasks: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_serialization() {
        let msg = Message::new_request(
            RequestId::Number(1),
            "initialize",
            Some(serde_json::json!({"version": 1})),
        );

        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"jsonrpc\":\"2.0\""));
        assert!(json.contains("\"id\":1"));
        assert!(json.contains("\"method\":\"initialize\""));
    }

    #[test]
    fn test_request_id_parsing() {
        // Test number ID
        let json = r#"{"jsonrpc":"2.0","id":123,"method":"test","params":null}"#;
        let msg: Message = serde_json::from_str(json).unwrap();
        assert_eq!(msg.id, Some(RequestId::Number(123)));

        // Test string ID
        let json = r#"{"jsonrpc":"2.0","id":"abc","method":"test","params":null}"#;
        let msg: Message = serde_json::from_str(json).unwrap();
        assert_eq!(msg.id, Some(RequestId::String("abc".to_string())));
    }

    #[test]
    fn test_error_response() {
        let error_msg = Message::new_error(
            Some(RequestId::Number(1)),
            METHOD_NOT_FOUND,
            "Method not found",
            None,
        );

        let json = serde_json::to_string(&error_msg).unwrap();
        assert!(json.contains("\"error\""));
        assert!(json.contains("\"code\":-32601"));
        assert!(json.contains("Method not found"));
    }
}
