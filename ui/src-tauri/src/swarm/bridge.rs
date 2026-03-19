//! Swarm Bridge Implementation
//!
//! Bridges Tauri commands to Go backend via ACP protocol.
//! This replaces the mock implementations with real Go backend calls.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::Mutex;

use crate::acp::types::{
    ContentBlock, SwarmCreateParams, SwarmCreateResult, SwarmExecuteTaskParams,
    SwarmGetStatusParams, SwarmStartParams, SwarmStatusResult, SwarmStopParams,
    SwarmSubmitTaskParams, SwarmSubmitTaskResult, SwarmTaskResult,
};
use crate::acp::{Client, ClientBuilder, ClientError};

/// Swarm bridge errors
#[derive(Error, Debug)]
pub enum SwarmBridgeError {
    #[error("Not connected to Go backend")]
    NotConnected,
    #[error("Client error: {0}")]
    Client(#[from] ClientError),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Swarm not found: {0}")]
    SwarmNotFound(String),
    #[error("Task not found: {0}")]
    TaskNotFound(String),
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
}

/// Swarm topology types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SwarmTopology {
    Star,
    Mesh,
    Tree,
    Ring,
    Hybrid,
}

impl Default for SwarmTopology {
    fn default() -> Self {
        Self::Star
    }
}

impl std::fmt::Display for SwarmTopology {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SwarmTopology::Star => write!(f, "star"),
            SwarmTopology::Mesh => write!(f, "mesh"),
            SwarmTopology::Tree => write!(f, "tree"),
            SwarmTopology::Ring => write!(f, "ring"),
            SwarmTopology::Hybrid => write!(f, "hybrid"),
        }
    }
}

/// Task scheduling strategy
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStrategy {
    Parallel,
    Sequential,
    Pipeline,
    MapReduce,
}

impl Default for TaskStrategy {
    fn default() -> Self {
        Self::Parallel
    }
}

impl std::fmt::Display for TaskStrategy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStrategy::Parallel => write!(f, "parallel"),
            TaskStrategy::Sequential => write!(f, "sequential"),
            TaskStrategy::Pipeline => write!(f, "pipeline"),
            TaskStrategy::MapReduce => write!(f, "mapreduce"),
        }
    }
}

/// Swarm information for frontend display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmInfo {
    pub id: String,
    pub name: String,
    pub topology: String,
    pub strategy: String,
    pub state: String,
    pub agent_count: usize,
    pub created_at: u64,
}

/// Task information for frontend display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskInfo {
    pub id: String,
    pub swarm_id: String,
    pub title: String,
    pub status: String,
    pub output: Option<String>,
    pub error: Option<String>,
    pub created_at: u64,
    pub completed_at: Option<u64>,
}

/// Swarm configuration for creating swarms
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmConfig {
    pub name: String,
    pub topology: SwarmTopology,
    pub strategy: TaskStrategy,
    pub agent_ids: Vec<String>,
}

impl Default for SwarmConfig {
    fn default() -> Self {
        Self {
            name: "New Swarm".to_string(),
            topology: SwarmTopology::default(),
            strategy: TaskStrategy::default(),
            agent_ids: Vec::new(),
        }
    }
}

/// Task configuration for submitting tasks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskConfig {
    pub title: String,
    pub prompt: String,
    pub priority: Option<i32>,
}

/// Swarm Bridge - connects Tauri to Go backend via ACP
pub struct SwarmBridge {
    /// ACP client for Go backend communication
    client: Arc<Mutex<Option<Client>>>,
    /// Binary path to Go backend
    binary_path: String,
    /// Arguments for Go backend
    args: Vec<String>,
    /// Environment variables for Go backend
    envs: Vec<(String, String)>,
    /// Connection state
    connected: Arc<AtomicBool>,
}

impl SwarmBridge {
    /// Create a new SwarmBridge
    pub fn new(binary_path: &str) -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
            binary_path: binary_path.to_string(),
            args: Vec::new(),
            envs: Vec::new(),
            connected: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Create a SwarmBridge with custom configuration
    pub fn with_config(binary_path: &str, args: Vec<String>, envs: Vec<(String, String)>) -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
            binary_path: binary_path.to_string(),
            args,
            envs,
            connected: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Add an argument to the Go backend command
    pub fn arg(mut self, arg: &str) -> Self {
        self.args.push(arg.to_string());
        self
    }

    /// Add multiple arguments
    pub fn args(mut self, args: &[String]) -> Self {
        self.args.extend(args.iter().cloned());
        self
    }

    /// Add an environment variable
    pub fn env(mut self, key: &str, value: &str) -> Self {
        self.envs.push((key.to_string(), value.to_string()));
        self
    }

    /// Connect to the Go backend
    pub async fn connect(&self) -> Result<(), SwarmBridgeError> {
        let mut client_guard = self.client.lock().await;

        if client_guard.is_some() {
            log::info!("Already connected to Go backend");
            return Ok(());
        }

        log::info!("Connecting to Go backend: {}", self.binary_path);

        let mut builder = ClientBuilder::new(&self.binary_path);

        for arg in &self.args {
            builder = builder.arg(arg);
        }

        for (key, value) in &self.envs {
            builder = builder.env(key, value);
        }

        let client = builder.connect().await?;

        // Initialize the ACP connection
        let init_result = client.initialize().await?;
        log::info!(
            "Connected to Go backend: {} (protocol {})",
            init_result.agent_info.name,
            init_result.protocol_version
        );

        *client_guard = Some(client);
        self.connected.store(true, Ordering::SeqCst);

        Ok(())
    }

    /// Disconnect from the Go backend
    pub async fn disconnect(&self) -> Result<(), SwarmBridgeError> {
        let mut client_guard = self.client.lock().await;

        if let Some(client) = client_guard.take() {
            client.close().await?;
            self.connected.store(false, Ordering::SeqCst);
            log::info!("Disconnected from Go backend");
        }

        Ok(())
    }

    /// Check if connected to Go backend
    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }

    /// Set up notification handler for backend events
    pub async fn set_notification_handler<F>(&self, handler: F)
    where
        F: Fn(&str, Option<&serde_json::Value>) + Send + Sync + 'static,
    {
        let client_guard = self.client.lock().await;
        if let Some(client) = client_guard.as_ref() {
            client.set_notification_handler(handler).await;
        }
    }

    /// Get the ACP client (internal helper)
    async fn get_client(&self) -> Result<Client, SwarmBridgeError> {
        let client_guard = self.client.lock().await;
        client_guard.clone().ok_or(SwarmBridgeError::NotConnected)
    }

    /// Create a new swarm
    pub async fn create_swarm(&self, config: SwarmConfig) -> Result<SwarmInfo, SwarmBridgeError> {
        let client = self.get_client().await?;

        let params = SwarmCreateParams {
            name: config.name.clone(),
            topology: config.topology.to_string(),
            strategy: config.strategy.to_string(),
            agent_ids: config.agent_ids.clone(),
        };

        let result: SwarmCreateResult = client.request("swarm/create", params).await?;

        log::info!("Created swarm: {} ({})", result.swarm_id, config.name);

        Ok(SwarmInfo {
            id: result.swarm_id,
            name: config.name,
            topology: config.topology.to_string(),
            strategy: config.strategy.to_string(),
            state: "created".to_string(),
            agent_count: config.agent_ids.len(),
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        })
    }

    /// Start a swarm
    pub async fn start_swarm(&self, swarm_id: &str) -> Result<(), SwarmBridgeError> {
        let client = self.get_client().await?;

        let params = SwarmStartParams {
            swarm_id: swarm_id.to_string(),
        };

        client
            .request::<_, serde_json::Value>("swarm/start", params)
            .await?;

        log::info!("Started swarm: {}", swarm_id);
        Ok(())
    }

    /// Stop a swarm
    pub async fn stop_swarm(&self, swarm_id: &str) -> Result<(), SwarmBridgeError> {
        let client = self.get_client().await?;

        let params = SwarmStopParams {
            swarm_id: swarm_id.to_string(),
        };

        client
            .request::<_, serde_json::Value>("swarm/stop", params)
            .await?;

        log::info!("Stopped swarm: {}", swarm_id);
        Ok(())
    }

    /// Submit a task to a swarm
    pub async fn submit_task(
        &self,
        swarm_id: &str,
        config: TaskConfig,
    ) -> Result<TaskInfo, SwarmBridgeError> {
        let client = self.get_client().await?;

        let params = SwarmSubmitTaskParams {
            swarm_id: swarm_id.to_string(),
            title: config.title.clone(),
            description: None,
            prompt: vec![ContentBlock {
                content_type: "text".to_string(),
                text: Some(config.prompt.clone()),
                image: None,
                audio: None,
                resource: None,
                resource_link: None,
            }],
            priority: config.priority,
        };

        let result: SwarmSubmitTaskResult = client.request("swarm/submitTask", params).await?;

        log::info!("Submitted task {} to swarm {}", result.task_id, swarm_id);

        Ok(TaskInfo {
            id: result.task_id,
            swarm_id: swarm_id.to_string(),
            title: config.title,
            status: "pending".to_string(),
            output: None,
            error: None,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            completed_at: None,
        })
    }

    /// Execute a task in a swarm
    pub async fn execute_task(
        &self,
        swarm_id: &str,
        task_id: &str,
    ) -> Result<SwarmTaskResult, SwarmBridgeError> {
        let client = self.get_client().await?;

        let params = SwarmExecuteTaskParams {
            swarm_id: swarm_id.to_string(),
            task_id: task_id.to_string(),
        };

        let result: SwarmTaskResult = client.request("swarm/executeTask", params).await?;

        log::info!(
            "Executed task {} in swarm {}: {}",
            task_id,
            swarm_id,
            result.status
        );

        Ok(result)
    }

    /// Get swarm status
    pub async fn get_swarm_status(
        &self,
        swarm_id: &str,
    ) -> Result<SwarmStatusResult, SwarmBridgeError> {
        let client = self.get_client().await?;

        let params = SwarmGetStatusParams {
            swarm_id: swarm_id.to_string(),
        };

        let result: SwarmStatusResult = client.request("swarm/getStatus", params).await?;

        Ok(result)
    }

    /// Get the process ID of the Go backend
    pub async fn process_id(&self) -> Option<u32> {
        let client_guard = self.client.lock().await;
        if let Some(client) = client_guard.as_ref() {
            client.process_id().await
        } else {
            None
        }
    }
}

impl Drop for SwarmBridge {
    fn drop(&mut self) {
        // Try to disconnect gracefully
        if self.connected.load(Ordering::SeqCst) {
            log::info!("SwarmBridge dropped, cleaning up connection");
            // Note: We can't do async cleanup in Drop, so we just mark as disconnected
            // The actual cleanup will happen when the Client is dropped
            self.connected.store(false, Ordering::SeqCst);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_topology_display() {
        assert_eq!(SwarmTopology::Star.to_string(), "star");
        assert_eq!(SwarmTopology::Mesh.to_string(), "mesh");
        assert_eq!(SwarmTopology::Tree.to_string(), "tree");
        assert_eq!(SwarmTopology::Ring.to_string(), "ring");
        assert_eq!(SwarmTopology::Hybrid.to_string(), "hybrid");
    }

    #[test]
    fn test_strategy_display() {
        assert_eq!(TaskStrategy::Parallel.to_string(), "parallel");
        assert_eq!(TaskStrategy::Sequential.to_string(), "sequential");
        assert_eq!(TaskStrategy::Pipeline.to_string(), "pipeline");
        assert_eq!(TaskStrategy::MapReduce.to_string(), "mapreduce");
    }

    #[test]
    fn test_swarm_config_default() {
        let config = SwarmConfig::default();
        assert_eq!(config.name, "New Swarm");
        assert_eq!(config.topology, SwarmTopology::Star);
        assert_eq!(config.strategy, TaskStrategy::Parallel);
        assert!(config.agent_ids.is_empty());
    }

    #[test]
    fn test_swarm_bridge_creation() {
        let bridge = SwarmBridge::new("/usr/local/bin/swarm-editor");
        assert!(!bridge.is_connected());
        assert_eq!(bridge.binary_path, "/usr/local/bin/swarm-editor");
    }

    #[test]
    fn test_swarm_bridge_with_args() {
        let bridge = SwarmBridge::new("/usr/local/bin/swarm-editor")
            .arg("--verbose")
            .arg("--config")
            .env("LOG_LEVEL", "debug");

        assert_eq!(bridge.args, vec!["--verbose", "--config"]);
        assert_eq!(
            bridge.envs,
            vec![("LOG_LEVEL".to_string(), "debug".to_string())]
        );
    }

    #[test]
    fn test_swarm_bridge_error_display() {
        let err = SwarmBridgeError::NotConnected;
        assert_eq!(err.to_string(), "Not connected to Go backend");

        let err = SwarmBridgeError::SwarmNotFound("test-id".to_string());
        assert!(err.to_string().contains("test-id"));
    }
}
