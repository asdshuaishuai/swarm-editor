//! ACP (Agent Communication Protocol) transport layer
//!
//! This module implements the stdio transport for ACP communication,
//! corresponding to the Go implementation in internal/acp/transport.go

use crate::acp::types::Message;
use std::process::Stdio;
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;

/// Transport errors
#[derive(Error, Debug)]
pub enum TransportError {
    #[error("Transport is closed")]
    Closed,
    #[error("Failed to marshal message: {0}")]
    SerializationError(#[from] serde_json::Error),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Connection lost: {0}")]
    ConnectionLost(String),
}

/// Stdio transport implementation for ACP
pub struct StdioTransport {
    stdin: tokio::sync::Mutex<ChildStdin>,
    stdout: tokio::sync::Mutex<BufReader<ChildStdout>>,
    closed: std::sync::atomic::AtomicBool,
}

impl StdioTransport {
    /// Create a new stdio transport from an existing child process
    pub fn from_child(child: &mut Child) -> Result<Self, TransportError> {
        let stdin = child.stdin.take().ok_or_else(|| {
            TransportError::IoError(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Failed to capture stdin",
            ))
        })?;

        let stdout = child.stdout.take().ok_or_else(|| {
            TransportError::IoError(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Failed to capture stdout",
            ))
        })?;

        Ok(Self {
            stdin: Mutex::new(stdin),
            stdout: Mutex::new(BufReader::new(stdout)),
            closed: std::sync::atomic::AtomicBool::new(false),
        })
    }

    /// Check if transport is closed
    pub fn is_closed(&self) -> bool {
        self.closed.load(std::sync::atomic::Ordering::SeqCst)
    }

    /// Send a message over the transport
    pub async fn send(&self, msg: &Message) -> Result<(), TransportError> {
        if self.is_closed() {
            return Err(TransportError::Closed);
        }

        // Serialize message
        let data = serde_json::to_vec(msg)?;

        // Lock stdin and write message followed by newline
        let mut stdin = self.stdin.lock().await;
        stdin.write_all(&data).await?;
        stdin.write_all(b"\n").await?;
        stdin.flush().await?;

        Ok(())
    }

    /// Receive a message from the transport
    pub async fn receive(&self) -> Result<Message, TransportError> {
        if self.is_closed() {
            return Err(TransportError::Closed);
        }

        let mut line = String::new();

        // Lock stdout and read line
        let mut stdout = self.stdout.lock().await;
        let bytes_read = stdout.read_line(&mut line).await?;

        if bytes_read == 0 {
            // EOF reached - connection closed
            self.closed.store(true, std::sync::atomic::Ordering::SeqCst);
            return Err(TransportError::ConnectionLost(
                "EOF while reading message".to_string(),
            ));
        }

        // Parse JSON message
        let msg = serde_json::from_str(&line).map_err(|e| TransportError::SerializationError(e))?;

        Ok(msg)
    }

    /// Close the transport
    pub fn close(&self) {
        self.closed.store(true, std::sync::atomic::Ordering::SeqCst);
    }
}

/// Spawn a new agent process and create stdio transport
pub async fn spawn_agent_process(
    binary_path: &str,
    args: &[String],
    envs: &[(String, String)],
) -> Result<(Child, StdioTransport), TransportError> {
    // Validate binary_path to prevent command injection
    if binary_path.is_empty() {
        return Err(TransportError::IoError(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "binary_path cannot be empty",
        )));
    }

    // Check for path traversal attempts
    if binary_path.contains("..") {
        return Err(TransportError::IoError(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "binary_path cannot contain path traversal sequences",
        )));
    }

    let mut cmd = Command::new(binary_path);
    cmd.args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Set environment variables
    for (key, value) in envs {
        cmd.env(key, value);
    }

    let mut child = cmd.spawn().map_err(|e| TransportError::IoError(e))?;

    let transport = StdioTransport::from_child(&mut child)?;

    Ok((child, transport))
}

/// Transport trait for extensibility
#[async_trait::async_trait]
pub trait Transport: Send + Sync {
    async fn send(&self, msg: &Message) -> Result<(), TransportError>;
    async fn receive(&self) -> Result<Message, TransportError>;
    fn close(&self);
    fn is_closed(&self) -> bool;
}

#[async_trait::async_trait]
impl Transport for StdioTransport {
    async fn send(&self, msg: &Message) -> Result<(), TransportError> {
        self.send(msg).await
    }

    async fn receive(&self) -> Result<Message, TransportError> {
        self.receive().await
    }

    fn close(&self) {
        self.close();
    }

    fn is_closed(&self) -> bool {
        self.is_closed()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acp::types::{RequestId, JSONRPC_VERSION};

    #[test]
    fn test_transport_error_display() {
        let err = TransportError::Closed;
        assert_eq!(err.to_string(), "Transport is closed");
    }

    #[tokio::test]
    async fn test_message_roundtrip() {
        // Create a message
        let msg = Message {
            jsonrpc: JSONRPC_VERSION.to_string(),
            id: Some(RequestId::Number(1)),
            method: Some("test".to_string()),
            params: Some(serde_json::json!({"key": "value"})),
            result: None,
            error: None,
        };

        // Serialize and deserialize
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: Message = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.jsonrpc, JSONRPC_VERSION);
        assert_eq!(parsed.id, Some(RequestId::Number(1)));
        assert_eq!(parsed.method, Some("test".to_string()));
    }
}
