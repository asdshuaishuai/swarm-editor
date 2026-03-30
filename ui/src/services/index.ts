// Services entry point - uses WebSocket for backend communication
// Re-exports from api.ts for backward compatibility

export * from './api'
export * from './websocket'
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

// Re-export WebSocket utilities from websocket.ts
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
