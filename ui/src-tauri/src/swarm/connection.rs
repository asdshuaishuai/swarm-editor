//! Connection Manager for Go Backend
//!
//! Manages automatic startup, connection, and reconnection to the Go sidecar process.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tokio::sync::Mutex;

use crate::swarm::bridge::SwarmBridge;

/// Connection state for UI feedback
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Failed,
}

impl ConnectionState {
    pub fn as_str(&self) -> &'static str {
        match self {
            ConnectionState::Disconnected => "disconnected",
            ConnectionState::Connecting => "connecting",
            ConnectionState::Connected => "connected",
            ConnectionState::Reconnecting => "reconnecting",
            ConnectionState::Failed => "failed",
        }
    }
}

/// Reconnection configuration
#[derive(Debug, Clone)]
pub struct ReconnectConfig {
    /// Initial backoff duration
    pub initial_backoff: Duration,
    /// Maximum backoff duration
    pub max_backoff: Duration,
    /// Backoff multiplier
    pub multiplier: f64,
    /// Maximum number of retry attempts (None = infinite)
    pub max_retries: Option<u64>,
}

impl Default for ReconnectConfig {
    fn default() -> Self {
        Self {
            initial_backoff: Duration::from_secs(1),
            max_backoff: Duration::from_secs(30),
            multiplier: 1.5,
            max_retries: None, // Infinite retries
        }
    }
}

/// Connection manager state
struct ConnectionManagerState {
    current_state: ConnectionState,
    retry_count: u64,
    current_backoff: Duration,
}

/// Connection manager for Go backend
pub struct ConnectionManager {
    /// Swarm bridge instance
    bridge: Arc<SwarmBridge>,
    /// Connection state
    state: Arc<Mutex<ConnectionManagerState>>,
    /// Whether reconnection is enabled
    reconnect_enabled: Arc<AtomicBool>,
    /// Whether shutdown has been requested
    shutdown_requested: Arc<AtomicBool>,
    /// Reconnection configuration
    config: ReconnectConfig,
}

impl ConnectionManager {
    /// Create a new connection manager
    pub fn new(bridge: Arc<SwarmBridge>) -> Self {
        Self {
            bridge,
            state: Arc::new(Mutex::new(ConnectionManagerState {
                current_state: ConnectionState::Disconnected,
                retry_count: 0,
                current_backoff: Duration::from_secs(0),
            })),
            reconnect_enabled: Arc::new(AtomicBool::new(true)),
            shutdown_requested: Arc::new(AtomicBool::new(false)),
            config: ReconnectConfig::default(),
        }
    }

    /// Create a new connection manager with custom reconnection config
    pub fn with_config(bridge: Arc<SwarmBridge>, config: ReconnectConfig) -> Self {
        Self {
            bridge,
            state: Arc::new(Mutex::new(ConnectionManagerState {
                current_state: ConnectionState::Disconnected,
                retry_count: 0,
                current_backoff: Duration::from_secs(0),
            })),
            reconnect_enabled: Arc::new(AtomicBool::new(true)),
            shutdown_requested: Arc::new(AtomicBool::new(false)),
            config,
        }
    }

    /// Get current connection state
    pub async fn state(&self) -> ConnectionState {
        let state = self.state.lock().await;
        state.current_state
    }

    /// Check if connected
    pub async fn is_connected(&self) -> bool {
        self.state().await == ConnectionState::Connected
    }

    /// Get retry count
    pub async fn retry_count(&self) -> u64 {
        let state = self.state.lock().await;
        state.retry_count
    }

    /// Enable reconnection
    pub fn enable_reconnect(&self) {
        self.reconnect_enabled.store(true, Ordering::SeqCst);
    }

    /// Disable reconnection
    pub fn disable_reconnect(&self) {
        self.reconnect_enabled.store(false, Ordering::SeqCst);
    }

    /// Check if reconnection is enabled
    pub fn is_reconnect_enabled(&self) -> bool {
        self.reconnect_enabled.load(Ordering::SeqCst)
    }

    /// Request shutdown
    pub fn shutdown(&self) {
        self.shutdown_requested.store(true, Ordering::SeqCst);
    }

    /// Check if shutdown was requested
    pub fn is_shutdown_requested(&self) -> bool {
        self.shutdown_requested.load(Ordering::SeqCst)
    }

    /// Update connection state
    async fn set_state(&self, new_state: ConnectionState) {
        let mut state = self.state.lock().await;
        state.current_state = new_state;

        log::debug!(
            "Connection state changed: {} -> {}",
            state.current_state.as_str(),
            new_state.as_str()
        );
    }

    /// Calculate next backoff duration with exponential backoff
    fn calculate_backoff(&self, previous: Duration) -> Duration {
        let next = (previous.as_secs_f64() * self.config.multiplier).floor() as u64;
        let next = Duration::from_secs(next);
        std::cmp::min(next, self.config.max_backoff)
    }

    /// Connect to the Go backend with automatic retry
    pub async fn connect(&self) -> Result<(), String> {
        self.set_state(ConnectionState::Connecting).await;

        let mut backoff = self.config.initial_backoff;

        loop {
            // Check for shutdown
            if self.is_shutdown_requested() {
                log::info!("Shutdown requested, aborting connection attempt");
                self.set_state(ConnectionState::Disconnected).await;
                return Err("Shutdown requested".to_string());
            }

            // Attempt connection
            match self.bridge.connect().await {
                Ok(_) => {
                    // Connection successful
                    self.set_state(ConnectionState::Connected).await;

                    // Reset retry count on success
                    let mut state = self.state.lock().await;
                    state.retry_count = 0;
                    state.current_backoff = Duration::from_secs(0);

                    log::info!("Successfully connected to Go backend");
                    return Ok(());
                }
                Err(e) => {
                    let mut state = self.state.lock().await;
                    state.retry_count += 1;
                    let retry_count = state.retry_count;

                    // Check max retries
                    if let Some(max) = self.config.max_retries {
                        if retry_count >= max {
                            self.set_state(ConnectionState::Failed).await;
                            return Err(format!(
                                "Max retries ({}) reached. Last error: {}",
                                max, e
                            ));
                        }
                    }

                    // Update state for reconnection
                    drop(state);
                    self.set_state(ConnectionState::Reconnecting).await;

                    log::warn!(
                        "Connection attempt {} failed: {}. Retrying in {:?}",
                        retry_count,
                        e,
                        backoff
                    );

                    // Wait before retry
                    tokio::time::sleep(backoff).await;

                    // Calculate next backoff
                    backoff = self.calculate_backoff(backoff);
                }
            }
        }
    }

    /// Disconnect from the Go backend
    pub async fn disconnect(&self) -> Result<(), String> {
        log::info!("Disconnecting from Go backend");
        self.set_state(ConnectionState::Disconnected).await;

        self.bridge
            .disconnect()
            .await
            .map_err(|e| format!("Failed to disconnect: {}", e))?;

        Ok(())
    }

    /// Start the connection manager task
    ///
    /// This spawns a background task that maintains the connection
    /// and automatically reconnects on failure.
    pub async fn start(&self) -> tokio::task::JoinHandle<()> {
        let bridge = Arc::clone(&self.bridge);
        let state = Arc::clone(&self.state);
        let reconnect_enabled = Arc::clone(&self.reconnect_enabled);
        let shutdown_requested = Arc::clone(&self.shutdown_requested);
        let config = self.config.clone();

        tokio::spawn(async move {
            let mut backoff = config.initial_backoff;

            loop {
                // Check for shutdown
                if shutdown_requested.load(Ordering::SeqCst) {
                    log::info!("Connection manager shutdown requested");
                    break;
                }

                // Check if bridge is still connected
                let is_connected = bridge.is_connected();

                if !is_connected && reconnect_enabled.load(Ordering::SeqCst) {
                    // Update state
                    let mut state_guard = state.lock().await;
                    if state_guard.current_state == ConnectionState::Connected {
                        state_guard.current_state = ConnectionState::Reconnecting;
                    }
                    state_guard.retry_count += 1;
                    let retry_count = state_guard.retry_count;
                    state_guard.current_backoff = backoff;
                    drop(state_guard);

                    log::info!(
                        "Connection lost, attempting reconnection #{}, waiting {:?}",
                        retry_count,
                        backoff
                    );

                    // Wait before reconnecting
                    tokio::time::sleep(backoff).await;

                    // Attempt reconnection
                    match bridge.connect().await {
                        Ok(_) => {
                            log::info!("Reconnection successful");
                            let mut state_guard = state.lock().await;
                            state_guard.current_state = ConnectionState::Connected;
                            state_guard.retry_count = 0;
                            backoff = config.initial_backoff;
                        }
                        Err(e) => {
                            log::warn!("Reconnection failed: {}", e);
                            backoff = Self::calculate_backoff_static(&config, backoff);
                        }
                    }
                } else if is_connected {
                    // Connection is healthy, reset backoff
                    let mut state_guard = state.lock().await;
                    state_guard.current_state = ConnectionState::Connected;
                    state_guard.retry_count = 0;
                    backoff = config.initial_backoff;
                }

                // Wait before next check
                tokio::time::sleep(Duration::from_secs(5)).await;
            }

            log::info!("Connection manager task stopped");
        })
    }

    fn calculate_backoff_static(config: &ReconnectConfig, previous: Duration) -> Duration {
        let next = (previous.as_secs_f64() * config.multiplier).floor() as u64;
        let next = Duration::from_secs(next);
        std::cmp::min(next, config.max_backoff)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connection_state_display() {
        assert_eq!(ConnectionState::Disconnected.as_str(), "disconnected");
        assert_eq!(ConnectionState::Connecting.as_str(), "connecting");
        assert_eq!(ConnectionState::Connected.as_str(), "connected");
        assert_eq!(ConnectionState::Reconnecting.as_str(), "reconnecting");
        assert_eq!(ConnectionState::Failed.as_str(), "failed");
    }

    #[test]
    fn test_reconnect_config_default() {
        let config = ReconnectConfig::default();
        assert_eq!(config.initial_backoff, Duration::from_secs(1));
        assert_eq!(config.max_backoff, Duration::from_secs(30));
        assert_eq!(config.multiplier, 1.5);
        assert_eq!(config.max_retries, None);
    }

    #[test]
    fn test_connection_state_serialization() {
        let state = ConnectionState::Connected;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, "\"connected\"");
    }
}
