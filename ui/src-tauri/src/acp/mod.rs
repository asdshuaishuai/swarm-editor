//! ACP (Agent Communication Protocol) client
//!
//! This module implements the ACP client for communication with Go backend,
//! corresponding to the Go implementation in internal/acp/

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use thiserror::Error;
use tokio::process::Child;
use tokio::sync::{mpsc, oneshot, Mutex, RwLock};

use crate::acp::transport::{spawn_agent_process, StdioTransport, Transport, TransportError};
use crate::acp::types::*;

/// Client errors
#[derive(Error, Debug)]
pub enum ClientError {
    #[error("Transport error: {0}")]
    Transport(#[from] TransportError),
    #[error("RPC error: {0}")]
    Rpc(RpcError),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Client not initialized")]
    NotInitialized,
    #[error("Connection closed")]
    ConnectionClosed,
    #[error("Request timeout")]
    Timeout,
    #[error("Request cancelled")]
    Cancelled,
    #[error("Invalid response: {0}")]
    InvalidResponse(String),
    #[error("Process error: {0}")]
    ProcessError(String),
}

/// Type alias for pending request handlers
pub type PendingRequest = oneshot::Sender<Result<Value, RpcError>>;

/// Type alias for notification handler
pub type NotificationHandler = Box<dyn Fn(&str, Option<&Value>) + Send + Sync>;

/// ACP Client for agent communication
pub struct Client {
    /// Child process handle
    process: Arc<Mutex<Child>>,
    /// Transport layer
    transport: Arc<dyn Transport>,
    /// Pending requests map
    pending: Arc<RwLock<HashMap<u64, PendingRequest>>>,
    /// Next request ID
    next_id: Arc<AtomicU64>,
    /// Receiver shutdown channel
    shutdown_tx: mpsc::Sender<()>,
    /// Connection state
    connected: Arc<AtomicBool>,
    /// Notification handler
    notification_handler: Arc<Mutex<Option<NotificationHandler>>>,
}

impl Client {
    /// Connect to an agent process and create ACP client
    pub async fn connect(
        binary_path: &str,
        args: &[String],
        envs: &[(String, String)],
    ) -> Result<Self, ClientError> {
        // Spawn agent process with stdio transport
        let (mut process, transport) = spawn_agent_process(binary_path, args, envs).await?;

        let pending: Arc<RwLock<HashMap<u64, PendingRequest>>> =
            Arc::new(RwLock::new(HashMap::new()));
        let next_id = Arc::new(AtomicU64::new(1));
        let transport: Arc<dyn Transport> = Arc::new(transport);
        let connected = Arc::new(AtomicBool::new(true));

        // Create shutdown channel
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel(1);

        // Start message receiver task
        let transport_clone = Arc::clone(&transport);
        let pending_clone = Arc::clone(&pending);
        let connected_clone = Arc::clone(&connected);
        let notification_handler: Arc<Mutex<Option<NotificationHandler>>> =
            Arc::new(Mutex::new(None));
        let notification_handler_clone = Arc::clone(&notification_handler);

        tokio::spawn(async move {
            loop {
                // Check for shutdown signal
                if let Ok(()) = shutdown_rx.try_recv() {
                    break;
                }

                // Receive message with timeout
                match tokio::time::timeout(
                    tokio::time::Duration::from_secs(1),
                    transport_clone.receive(),
                )
                .await
                {
                    Ok(Ok(msg)) => {
                        // Handle received message
                        Self::handle_incoming_message(
                            msg,
                            &pending_clone,
                            &notification_handler_clone,
                        )
                        .await;
                    }
                    Ok(Err(e)) => {
                        log::error!("Transport error: {}", e);
                        connected_clone.store(false, Ordering::SeqCst);
                        break;
                    }
                    Err(_) => {
                        // Timeout, continue loop
                    }
                }
            }

            // Mark as disconnected
            connected_clone.store(false, Ordering::SeqCst);
            log::info!("ACP message receiver stopped");
        });

        let client = Self {
            process: Arc::new(Mutex::new(process)),
            transport,
            pending,
            next_id,
            shutdown_tx,
            connected,
            notification_handler,
        };

        Ok(client)
    }

    /// Handle incoming message from agent
    async fn handle_incoming_message(
        msg: Message,
        pending: &Arc<RwLock<HashMap<u64, PendingRequest>>>,
        notification_handler: &Arc<Mutex<Option<NotificationHandler>>>,
    ) {
        // Get the request ID
        let id = match &msg.id {
            Some(RequestId::Number(n)) => *n as u64,
            Some(RequestId::String(s)) => s.parse::<u64>().unwrap_or(0),
            None => {
                // Notification - no ID, call notification handler
                if let Some(method) = &msg.method {
                    log::info!("Received notification: {}", method);

                    // Call notification handler if set
                    let handler = notification_handler.lock().await;
                    if let Some(handler) = handler.as_ref() {
                        handler(method, msg.params.as_ref());
                    }
                }
                return;
            }
        };

        // Find and remove pending request
        let sender = {
            let mut pending_map = pending.write().await;
            pending_map.remove(&id)
        };

        match sender {
            Some(tx) => {
                // Send result back to caller
                if let Some(error) = msg.error {
                    let _ = tx.send(Err(error));
                } else if let Some(result) = msg.result {
                    let _ = tx.send(Ok(result));
                } else {
                    let _ = tx.send(Err(RpcError {
                        code: INTERNAL_ERROR,
                        message: "Response missing both result and error".to_string(),
                        data: None,
                    }));
                }
            }
            None => {
                log::warn!("Received response for unknown request ID: {}", id);
            }
        }
    }

    /// Generate next request ID
    fn next_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::SeqCst)
    }

    /// Check if client is connected
    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }

    /// Set notification handler for incoming notifications
    pub async fn set_notification_handler<F>(&self, handler: F)
    where
        F: Fn(&str, Option<&Value>) + Send + Sync + 'static,
    {
        let mut h = self.notification_handler.lock().await;
        *h = Some(Box::new(handler));
    }

    /// Clear notification handler
    pub async fn clear_notification_handler(&self) {
        let mut h = self.notification_handler.lock().await;
        *h = None;
    }

    /// Make a request and wait for response
    async fn request<T, R>(&self, method: &str, params: T) -> Result<R, ClientError>
    where
        T: Serialize,
        R: DeserializeOwned,
    {
        if !self.is_connected() {
            return Err(ClientError::ConnectionClosed);
        }

        let id = self.next_id();
        let request_id = RequestId::Number(id as i64);

        // Serialize params
        let params_value = serde_json::to_value(params)?;

        // Create request message
        let msg = Message::new_request(request_id, method, Some(params_value));

        // Create oneshot channel for response
        let (tx, rx) = oneshot::channel::<Result<Value, RpcError>>();

        // Store pending request
        {
            let mut pending = self.pending.write().await;
            pending.insert(id, tx);
        }

        // Send request
        if let Err(e) = self.transport.send(&msg).await {
            // Remove pending request on send failure
            let mut pending = self.pending.write().await;
            pending.remove(&id);
            return Err(ClientError::Transport(e));
        }

        // Wait for response with timeout
        let result = match tokio::time::timeout(tokio::time::Duration::from_secs(60), rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => {
                return Err(ClientError::Cancelled);
            }
            Err(_) => {
                // Remove pending request on timeout
                let mut pending = self.pending.write().await;
                pending.remove(&id);
                return Err(ClientError::Timeout);
            }
        };

        match result {
            Ok(value) => {
                let response = serde_json::from_value(value)?;
                Ok(response)
            }
            Err(e) => Err(ClientError::Rpc(e)),
        }
    }

    /// Send a notification (no response expected)
    async fn notify<T>(&self, method: &str, params: T) -> Result<(), ClientError>
    where
        T: Serialize,
    {
        if !self.is_connected() {
            return Err(ClientError::ConnectionClosed);
        }

        let params_value = serde_json::to_value(params)?;
        let msg = Message::new_notification(method, Some(params_value));

        self.transport.send(&msg).await?;
        Ok(())
    }

    /// Initialize the ACP connection
    pub async fn initialize(&self) -> Result<InitializeResult, ClientError> {
        let params = InitializeParams {
            protocol_version: PROTOCOL_VERSION,
            client_capabilities: ClientCapabilities {
                fs: Some(FileSystemCapabilities {
                    read_text_file: true,
                    write_text_file: true,
                }),
                terminal: Some(true),
            },
            client_info: ImplementationInfo {
                name: "swarm-editor".to_string(),
                title: Some("Swarm Editor".to_string()),
                version: "0.1.0".to_string(),
            },
        };

        self.request("initialize", params).await
    }

    /// Create a new session
    pub async fn session_new(
        &self,
        params: SessionNewParams,
    ) -> Result<SessionNewResult, ClientError> {
        self.request("session/new", params).await
    }

    /// Load an existing session
    pub async fn session_load(&self, session_id: &str) -> Result<Value, ClientError> {
        self.request(
            "session/load",
            serde_json::json!({
                "sessionId": session_id
            }),
        )
        .await
    }

    /// Send a prompt to a session
    pub async fn session_prompt(
        &self,
        params: SessionPromptParams,
    ) -> Result<SessionPromptResult, ClientError> {
        self.request("session/prompt", params).await
    }

    /// Cancel an ongoing prompt turn
    pub async fn session_cancel(&self, session_id: &str) -> Result<(), ClientError> {
        self.request(
            "session/cancel",
            serde_json::json!({
                "sessionId": session_id
            }),
        )
        .await
    }

    /// Set session mode
    pub async fn session_set_mode(
        &self,
        session_id: &str,
        mode: SessionMode,
    ) -> Result<(), ClientError> {
        self.request(
            "session/setMode",
            serde_json::json!({
                "sessionId": session_id,
                "mode": mode
            }),
        )
        .await
    }

    /// Respond to a permission request
    pub async fn session_respond_permission(
        &self,
        session_id: &str,
        tool_call_id: &str,
        outcome: &PermissionOutcome,
    ) -> Result<(), ClientError> {
        self.request(
            "session/respondPermission",
            serde_json::json!({
                "sessionId": session_id,
                "toolCallId": tool_call_id,
                "outcome": outcome
            }),
        )
        .await
    }

    /// Report an update to the agent (notification)
    pub async fn session_report_update(
        &self,
        params: SessionUpdateParams,
    ) -> Result<(), ClientError> {
        self.notify("session/reportUpdate", params).await
    }

    /// Close the client connection
    pub async fn close(&self) -> Result<(), ClientError> {
        // Signal receiver to stop
        let _ = self.shutdown_tx.send(()).await;

        // Mark as disconnected
        self.connected.store(false, Ordering::SeqCst);

        // Close transport
        self.transport.close();

        // Kill process
        let mut process = self.process.lock().await;
        let _ = process.kill().await;

        log::info!("ACP client closed");
        Ok(())
    }

    /// Get process ID
    pub async fn process_id(&self) -> Option<u32> {
        let process = self.process.lock().await;
        process.id()
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        // Signal shutdown
        let _ = self.shutdown_tx.try_send(());

        // Close transport
        self.transport.close();
    }
}

/// Client builder for creating ACP clients
pub struct ClientBuilder {
    binary_path: String,
    args: Vec<String>,
    envs: Vec<(String, String)>,
}

impl ClientBuilder {
    /// Create a new client builder
    pub fn new(binary_path: &str) -> Self {
        Self {
            binary_path: binary_path.to_string(),
            args: Vec::new(),
            envs: Vec::new(),
        }
    }

    /// Add argument to the command
    pub fn arg(mut self, arg: &str) -> Self {
        self.args.push(arg.to_string());
        self
    }

    /// Add multiple arguments
    pub fn args(mut self, args: &[String]) -> Self {
        self.args.extend(args.iter().cloned());
        self
    }

    /// Add environment variable
    pub fn env(mut self, key: &str, value: &str) -> Self {
        self.envs.push((key.to_string(), value.to_string()));
        self
    }

    /// Build and connect the client
    pub async fn connect(self) -> Result<Client, ClientError> {
        Client::connect(&self.binary_path, &self.args, &self.envs).await
    }
}

use std::sync::atomic::AtomicBool;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_error_display() {
        let err = ClientError::ConnectionClosed;
        assert_eq!(err.to_string(), "Connection closed");

        let rpc_err = RpcError {
            code: METHOD_NOT_FOUND,
            message: "Method not found".to_string(),
            data: None,
        };
        let err = ClientError::Rpc(rpc_err);
        assert!(err.to_string().contains("RPC error"));
    }

    #[test]
    fn test_client_builder() {
        let builder = ClientBuilder::new("/usr/bin/test")
            .arg("arg1")
            .arg("arg2")
            .env("KEY", "VALUE");

        assert_eq!(builder.binary_path, "/usr/bin/test");
        assert_eq!(builder.args, vec!["arg1", "arg2"]);
        assert_eq!(builder.envs, vec![("KEY".to_string(), "VALUE".to_string())]);
    }
}
