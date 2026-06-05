// Services entry point — uses Tauri IPC → Unix Socket for backend communication
// Re-exports from api.ts for backward compatibility

export * from './api'
export * from './websocket'  // Legacy WebSocket types (WSError, WSErrorCode, etc.)
export * from './scheduling'
export * from './byzantine'

// Re-export specific items from api.ts for backward compatibility
export {
  api,
  agentApi,
  swarmApi,
  teamApi,
  mcpApi,
  backendApi,
  events,
} from './api'

// Re-export LSP API
export { lspApi } from './lspApi'

// Re-export IPC client (primary communication path)
export { getIPCClient, initializeIPCClient, createIPCClient, IPCError } from './ipcClient'
export type { IPCClient } from './ipcClient'

// Re-export WebSocket utilities (legacy, kept for type compatibility)
export { getWebSocketClient, initializeWebSocket } from './websocket'

export type {
  AgentInfo,
  SwarmInfo,
  TeamInfo,
  TaskInfo,
  SessionInfo,
  MCPServerInfo,
  EmergenceData,
  SupervisorStats,
  PermissionRequest,
} from './api'
