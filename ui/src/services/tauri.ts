import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// Re-export UnlistenFn for use in hooks
export type { UnlistenFn } from '@tauri-apps/api/event'

// ============================================
// 类型定义
// ============================================

export interface AgentInfo {
  id: string
  name: string
  type: string
  status: string
  command: string
  capabilities: string[]
  lastActive: string | null
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

export interface SwarmConfig {
  name: string
  topology: string
  strategy: string
  agentIds: string[]
  consensusThreshold: number
}

export interface ExecuteResult {
  success: boolean
  output: string
  error?: string
}

// ============================================
// Event Types (matching Rust events.rs)
// ============================================

/** Agent result data in task update */
export interface AgentResultData {
  agent_id: string
  content: string
  success: boolean
  duration_ms: number
}

/** Swarm task update event */
export interface SwarmTaskUpdateEvent {
  task_id: string
  swarm_id: string
  status: string
  progress: number
  output?: string
  error?: string
  agent_results: Record<string, AgentResultData>
}

/** Swarm status change event */
export interface SwarmStatusEvent {
  swarm_id: string
  old_state: string
  new_state: string
  reason?: string
}

/** Agent status change event */
export interface AgentStatusEvent {
  agent_id: string
  status: string
  pid?: number
}

/** Permission option data */
export interface PermissionOptionData {
  option_id: string
  name: string
  kind: string
}

/** Permission request event (requires user interaction) */
export interface PermissionRequestEvent {
  request_id: string
  session_id: string
  tool_call_id: string
  tool_name: string
  description: string
  options: PermissionOptionData[]
}

/** Log event for streaming logs to frontend */
export interface LogEvent {
  level: string
  source: string
  message: string
  timestamp: number
}

// ============================================
// Event Listener Types
// ============================================

export type SwarmTaskUpdateHandler = (event: SwarmTaskUpdateEvent) => void
export type SwarmStatusHandler = (event: SwarmStatusEvent) => void
export type AgentStatusHandler = (event: AgentStatusEvent) => void
export type PermissionRequestHandler = (event: PermissionRequestEvent) => void
export type LogHandler = (event: LogEvent) => void

// ============================================
// Event Listener API
// ============================================

export const eventApi = {
  /**
   * Subscribe to swarm task update events
   * Returns an unlisten function to unsubscribe
   */
  onSwarmTaskUpdate(handler: SwarmTaskUpdateHandler): Promise<UnlistenFn> {
    return listen<SwarmTaskUpdateEvent>('swarm-task-update', (event) => {
      handler(event.payload)
    })
  },

  /**
   * Subscribe to swarm status change events
   * Returns an unlisten function to unsubscribe
   */
  onSwarmStatusChange(handler: SwarmStatusHandler): Promise<UnlistenFn> {
    return listen<SwarmStatusEvent>('swarm-status-change', (event) => {
      handler(event.payload)
    })
  },

  /**
   * Subscribe to agent status change events
   * Returns an unlisten function to unsubscribe
   */
  onAgentStatusChange(handler: AgentStatusHandler): Promise<UnlistenFn> {
    return listen<AgentStatusEvent>('agent-status-change', (event) => {
      handler(event.payload)
    })
  },

  /**
   * Subscribe to permission request events
   * Returns an unlisten function to unsubscribe
   */
  onPermissionRequest(handler: PermissionRequestHandler): Promise<UnlistenFn> {
    return listen<PermissionRequestEvent>('permission-request', (event) => {
      handler(event.payload)
    })
  },

  /**
   * Subscribe to log events
   * Returns an unlisten function to unsubscribe
   */
  onLog(handler: LogHandler): Promise<UnlistenFn> {
    return listen<LogEvent>('log', (event) => {
      handler(event.payload)
    })
  },
}

// ============================================
// Tauri Environment Detection
// ============================================

export function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

// Agent API
export const agentApi = {
  async getAgents(): Promise<AgentInfo[]> {
    return invoke('get_agents')
  },

  async startAgent(id: string): Promise<AgentInfo> {
    return invoke('start_agent', { id })
  },

  async stopAgent(id: string): Promise<AgentInfo> {
    return invoke('stop_agent', { id })
  },
}

// 文件系统 API
export const fsApi = {
  async listDir(path: string): Promise<FileEntry[]> {
    return invoke('list_dir', { path })
  },

  async readFile(path: string): Promise<string> {
    return invoke('read_file', { path })
  },

  async writeFile(path: string, content: string): Promise<void> {
    return invoke('write_file', { path, content })
  },

  async getWorkspace(): Promise<string> {
    return invoke('get_workspace')
  },
}

// 执行 API
export const executeApi = {
  async executeCode(
    filePath: string,
    content: string,
    language: string,
    agentId?: string
  ): Promise<ExecuteResult> {
    return invoke('execute_code', {
      filePath,
      content,
      language,
      agentId,
    })
  },
}

// 统一导出
export const tauri = {
  isTauriEnv,
  agent: agentApi,
  fs: fsApi,
  execute: executeApi,
  events: eventApi,
}

