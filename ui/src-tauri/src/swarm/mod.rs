//! Swarm Bridge Module
//!
//! Provides the bridge between Tauri commands and the Go backend via ACP protocol.

mod bridge;

pub use bridge::{SwarmBridge, SwarmBridgeError, SwarmInfo, TaskInfo};