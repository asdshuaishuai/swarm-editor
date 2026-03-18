import { invoke } from '@tauri-apps/api/core'

// 类型定义
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

// 检测是否在 Tauri 环境中运行
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
}

