//! Event definitions for frontend communication
//!
//! These events are emitted by the backend and can be listened to in the frontend.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Swarm task update event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmTaskUpdateEvent {
    pub task_id: String,
    pub swarm_id: String,
    pub status: String,
    pub progress: f64,
    pub output: Option<String>,
    pub error: Option<String>,
    pub agent_results: HashMap<String, AgentResultData>,
}

/// Agent result data in task update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResultData {
    pub agent_id: String,
    pub content: String,
    pub success: bool,
    pub duration_ms: u64,
}

/// Swarm status change event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmStatusEvent {
    pub swarm_id: String,
    pub old_state: String,
    pub new_state: String,
    pub reason: Option<String>,
}

/// Agent status change event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatusEvent {
    pub agent_id: String,
    pub status: String,
    pub pid: Option<u32>,
}

/// Permission request event (requires user interaction)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequestEvent {
    pub request_id: String,
    pub session_id: String,
    pub tool_call_id: String,
    pub tool_name: String,
    pub description: String,
    pub options: Vec<PermissionOptionData>,
}

/// Permission option data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionOptionData {
    pub option_id: String,
    pub name: String,
    pub kind: String,
}

/// Log event for streaming logs to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEvent {
    pub level: String,
    pub source: String,
    pub message: String,
    pub timestamp: u64,
}

/// Event types that can be emitted
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EventType {
    SwarmTaskUpdate(SwarmTaskUpdateEvent),
    SwarmStatusChange(SwarmStatusEvent),
    AgentStatusChange(AgentStatusEvent),
    PermissionRequest(PermissionRequestEvent),
    Log(LogEvent),
}

/// Helper to emit events via Tauri
#[cfg(feature = "tauri")]
pub mod emitter {
    use tauri::{AppHandle, Emitter};
    use super::*;

    /// Emit a swarm task update event
    pub fn emit_task_update(app: &AppHandle, event: SwarmTaskUpdateEvent) {
        if let Err(e) = app.emit("swarm-task-update", &event) {
            log::error!("Failed to emit task update: {}", e);
        }
    }

    /// Emit a swarm status change event
    pub fn emit_swarm_status(app: &AppHandle, event: SwarmStatusEvent) {
        if let Err(e) = app.emit("swarm-status-change", &event) {
            log::error!("Failed to emit swarm status: {}", e);
        }
    }

    /// Emit an agent status change event
    pub fn emit_agent_status(app: &AppHandle, event: AgentStatusEvent) {
        if let Err(e) = app.emit("agent-status-change", &event) {
            log::error!("Failed to emit agent status: {}", e);
        }
    }

    /// Emit a permission request event
    pub fn emit_permission_request(app: &AppHandle, event: PermissionRequestEvent) {
        if let Err(e) = app.emit("permission-request", &event) {
            log::error!("Failed to emit permission request: {}", e);
        }
    }

    /// Emit a log event
    pub fn emit_log(app: &AppHandle, event: LogEvent) {
        if let Err(e) = app.emit("log", &event) {
            log::error!("Failed to emit log: {}", e);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_update_serialization() {
        let event = SwarmTaskUpdateEvent {
            task_id: "task-123".to_string(),
            swarm_id: "swarm-456".to_string(),
            status: "running".to_string(),
            progress: 0.5,
            output: Some("Working...".to_string()),
            error: None,
            agent_results: HashMap::new(),
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("task-123"));
        assert!(json.contains("running"));
        assert!(json.contains("0.5"));
    }

    #[test]
    fn test_swarm_status_event() {
        let event = SwarmStatusEvent {
            swarm_id: "swarm-1".to_string(),
            old_state: "stopped".to_string(),
            new_state: "active".to_string(),
            reason: Some("User started swarm".to_string()),
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("swarm-1"));
        assert!(json.contains("stopped"));
        assert!(json.contains("active"));
    }

    #[test]
    fn test_permission_request_event() {
        let event = PermissionRequestEvent {
            request_id: "req-123".to_string(),
            session_id: "session-1".to_string(),
            tool_call_id: "call-456".to_string(),
            tool_name: "execute".to_string(),
            description: "Run command".to_string(),
            options: vec![PermissionOptionData {
                option_id: "allow".to_string(),
                name: "Allow".to_string(),
                kind: "allow_once".to_string(),
            }],
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("req-123"));
        assert!(json.contains("execute"));
    }
}