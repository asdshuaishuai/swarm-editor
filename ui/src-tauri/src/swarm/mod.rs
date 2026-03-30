//! Swarm Bridge Module
//!
//! Provides the bridge between Tauri commands and the Go backend via ACP protocol,
//! including automatic connection management and reconnection logic.

mod bridge;
mod connection;

pub use bridge::{
    SwarmBridge, SwarmBridgeError, SwarmConfig, SwarmInfo, SwarmTopology, TaskConfig,
    TaskInfo, TaskStrategy,
};
pub use connection::{ConnectionManager, ConnectionState, ReconnectConfig};
