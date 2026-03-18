import { invoke } from '@tauri-apps/api/core'

export * from './tauri'

// 类型定义
export interface AgentInfo {
  id: string
  name: string
  type: string
  status: string
  command: string
  capabilities: string[]
  lastActive: string | null
  description?: string
  enabled: boolean
  pid?: number
}

export interface AgentConfig {
  id: string
  name: string
  description?: string
  enabled: boolean
  command: string
  args?: string[]
  env?: Record<string, string>
  mcpSettings?: MCPSettings
  expectedCapabilities?: AgentCapabilitiesConfig
  swarmConfig?: AgentSwarmConfig
  tags?: string[]
  timeout?: number
}

export interface MCPSettings {
  useCustomMcp: boolean
  useEditorMcp: boolean
  allowedTools?: string[]
  customMcpServers?: MCPServerConfig[]
}

export interface MCPServerConfig {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface AgentCapabilitiesConfig {
  loadSession?: boolean
  promptCapabilities?: {
    image: boolean
    audio: boolean
    embeddedContext: boolean
  }
  mcp?: {
    http: boolean
    sse: boolean
  }
  pairProgramming?: boolean
  teamCollaboration?: boolean
}

export interface AgentSwarmConfig {
  canBeCoordinator: boolean
  canBeWorker: boolean
  preferredRoles?: string[]
  maxConcurrent?: number
  priority?: number
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

export interface SwarmStats {
  agentCount: number
  idleAgents: number
  executingAgents: number
  pendingTasks: number
  completedTasks: number
}

export interface SwarmInfo {
  id: string
  name: string
  topology: string
  strategy: string
  state: string
  agents: string[]
  stats: SwarmStats
  createdAt: string
  coordinatorId?: string
}

export interface SwarmCreateRequest {
  name: string
  topology: string
  strategy: string
  agentIds: string[]
}

export interface SwarmTaskRequest {
  swarmId: string
  title: string
  description?: string
  prompt: string
  priority?: number
}

export interface SwarmTaskResult {
  taskId: string
  status: string
  output?: string
  error?: string
  agentResults: Record<string, AgentTaskResult>
}

export interface AgentTaskResult {
  agentId: string
  content: string
  success: boolean
  durationMs: number
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
    if (!isTauriEnv()) return mockApi.agent.getAgents()
    return invoke('get_agents')
  },

  async refreshAgents(): Promise<AgentInfo[]> {
    if (!isTauriEnv()) return mockApi.agent.getAgents()
    return invoke('refresh_agents')
  },

  async getAgent(id: string): Promise<AgentInfo> {
    if (!isTauriEnv()) {
      const agents = await mockApi.agent.getAgents()
      const agent = agents.find(a => a.id === id)
      if (!agent) throw new Error(`Agent not found: ${id}`)
      return agent
    }
    return invoke('get_agent', { id })
  },

  async startAgent(id: string): Promise<AgentInfo> {
    if (!isTauriEnv()) return mockApi.agent.startAgent(id)
    return invoke('start_agent', { id })
  },

  async stopAgent(id: string): Promise<AgentInfo> {
    if (!isTauriEnv()) return mockApi.agent.stopAgent(id)
    return invoke('stop_agent', { id })
  },

  async addAgent(config: AgentConfig): Promise<AgentInfo> {
    if (!isTauriEnv()) throw new Error('Not available in mock mode')
    return invoke('add_agent', { config })
  },

  async updateAgent(config: AgentConfig): Promise<AgentInfo> {
    if (!isTauriEnv()) throw new Error('Not available in mock mode')
    return invoke('update_agent', { config })
  },

  async deleteAgent(id: string): Promise<void> {
    if (!isTauriEnv()) throw new Error('Not available in mock mode')
    return invoke('delete_agent', { id })
  },

  async getConfigPath(): Promise<string> {
    if (!isTauriEnv()) return '~/.swarm-editor/agents.json'
    return invoke('get_config_path')
  },
}

// 文件系统 API
export const fsApi = {
  async listDir(path: string): Promise<FileEntry[]> {
    if (!isTauriEnv()) return mockApi.fs.listDir(path)
    return invoke('list_dir', { path })
  },

  async readFile(path: string): Promise<string> {
    if (!isTauriEnv()) return mockApi.fs.readFile(path)
    return invoke('read_file', { path })
  },

  async writeFile(path: string, content: string): Promise<void> {
    if (!isTauriEnv()) return mockApi.fs.writeFile(path, content)
    return invoke('write_file', { path, content })
  },

  async getWorkspace(): Promise<string> {
    if (!isTauriEnv()) return mockApi.fs.getWorkspace()
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
    if (!isTauriEnv()) return mockApi.execute.executeCode(filePath, content, language, agentId)
    return invoke('execute_code', {
      filePath,
      content,
      language,
      agentId,
    })
  },
}

// 蜂群 API
export const swarmApi = {
  async createSwarm(request: SwarmCreateRequest): Promise<SwarmInfo> {
    if (!isTauriEnv()) return mockApi.swarm.createSwarm(request)
    return invoke('create_swarm', { request })
  },

  async getSwarms(): Promise<SwarmInfo[]> {
    if (!isTauriEnv()) return mockApi.swarm.getSwarms()
    return invoke('get_swarms')
  },

  async getSwarm(id: string): Promise<SwarmInfo> {
    if (!isTauriEnv()) {
      const swarms = await mockApi.swarm.getSwarms()
      const swarm = swarms.find(s => s.id === id)
      if (!swarm) throw new Error(`Swarm not found: ${id}`)
      return swarm
    }
    return invoke('get_swarm', { id })
  },

  async startSwarm(id: string): Promise<SwarmInfo> {
    if (!isTauriEnv()) return mockApi.swarm.startSwarm(id)
    return invoke('start_swarm', { id })
  },

  async stopSwarm(id: string): Promise<SwarmInfo> {
    if (!isTauriEnv()) return mockApi.swarm.stopSwarm(id)
    return invoke('stop_swarm', { id })
  },

  async deleteSwarm(id: string): Promise<void> {
    if (!isTauriEnv()) return mockApi.swarm.deleteSwarm(id)
    return invoke('delete_swarm', { id })
  },

  async submitTask(request: SwarmTaskRequest): Promise<string> {
    if (!isTauriEnv()) return mockApi.swarm.submitTask(request)
    return invoke('submit_swarm_task', { request })
  },

  async executeTask(swarmId: string, taskId: string): Promise<SwarmTaskResult> {
    if (!isTauriEnv()) return mockApi.swarm.executeTask(swarmId, taskId)
    return invoke('execute_swarm_task', { swarmId, taskId })
  },
}

// Mock 服务 - 用于非 Tauri 环境开发和测试
export const mockApi = {
  agent: {
    async getAgents(): Promise<AgentInfo[]> {
      return [
        {
          id: 'claude-code',
          name: 'Claude Code',
          type: 'coder',
          status: 'stopped',
          command: 'claude',
          capabilities: ['role:coder', 'role:architect', 'coordinator', 'worker', 'tag:primary', 'tag:coding'],
          lastActive: null,
          description: 'Claude-powered coding assistant',
          enabled: true,
        },
        {
          id: 'code-reviewer',
          name: 'Code Reviewer',
          type: 'reviewer',
          status: 'stopped',
          command: 'claude',
          capabilities: ['role:reviewer', 'worker', 'tag:review', 'tag:quality'],
          lastActive: null,
          description: 'Specialized code review agent',
          enabled: true,
        },
        {
          id: 'test-generator',
          name: 'Test Generator',
          type: 'tester',
          status: 'stopped',
          command: 'claude',
          capabilities: ['role:tester', 'worker', 'tag:testing', 'tag:automation'],
          lastActive: null,
          description: 'Automated test generation agent',
          enabled: true,
        },
      ]
    },

    async startAgent(id: string): Promise<AgentInfo> {
      const agents = await this.getAgents()
      const agent = agents.find(a => a.id === id)
      if (!agent) throw new Error(`Agent not found: ${id}`)
      return { ...agent, status: 'running', lastActive: new Date().toISOString(), pid: Math.floor(Math.random() * 10000) }
    },

    async stopAgent(id: string): Promise<AgentInfo> {
      const agents = await this.getAgents()
      const agent = agents.find(a => a.id === id)
      if (!agent) throw new Error(`Agent not found: ${id}`)
      return { ...agent, status: 'stopped', pid: undefined }
    },
  },

  fs: {
    async listDir(path: string): Promise<FileEntry[]> {
      return [
        { name: 'src', path: `${path}/src`, isDirectory: true, children: [
          { name: 'main.ts', path: `${path}/src/main.ts`, isDirectory: false },
          { name: 'utils.ts', path: `${path}/src/utils.ts`, isDirectory: false },
          { name: 'types.ts', path: `${path}/src/types.ts`, isDirectory: false },
        ]},
        { name: 'package.json', path: `${path}/package.json`, isDirectory: false },
        { name: 'README.md', path: `${path}/README.md`, isDirectory: false },
      ]
    },

    async readFile(path: string): Promise<string> {
      return `// File: ${path}\n// Content not available in mock mode\n`
    },

    async writeFile(_path: string, _content: string): Promise<void> {
      // Mock write operation
    },

    async getWorkspace(): Promise<string> {
      return '/home/user/project'
    },
  },

  execute: {
    async executeCode(
      _filePath: string,
      _content: string,
      language: string,
      agentId?: string
    ): Promise<ExecuteResult> {
      return {
        success: true,
        output: `// Mock execution\n// Language: ${language}\n// Agent: ${agentId || 'default'}\n// Output would appear here\n`,
      }
    },
  },

  swarm: {
    async createSwarm(request: SwarmCreateRequest): Promise<SwarmInfo> {
      const id = `swarm-${Date.now()}`
      return {
        id,
        name: request.name,
        topology: request.topology,
        strategy: request.strategy,
        state: 'stopped',
        agents: request.agentIds,
        stats: {
          agentCount: request.agentIds.length,
          idleAgents: request.agentIds.length,
          executingAgents: 0,
          pendingTasks: 0,
          completedTasks: 0,
        },
        createdAt: new Date().toISOString(),
      }
    },

    async getSwarms(): Promise<SwarmInfo[]> {
      return []
    },

    async startSwarm(id: string): Promise<SwarmInfo> {
      return {
        id,
        name: 'Mock Swarm',
        topology: 'star',
        strategy: 'parallel',
        state: 'active',
        agents: ['claude-code'],
        stats: {
          agentCount: 1,
          idleAgents: 1,
          executingAgents: 0,
          pendingTasks: 0,
          completedTasks: 0,
        },
        createdAt: new Date().toISOString(),
      }
    },

    async stopSwarm(id: string): Promise<SwarmInfo> {
      return {
        id,
        name: 'Mock Swarm',
        topology: 'star',
        strategy: 'parallel',
        state: 'stopped',
        agents: ['claude-code'],
        stats: {
          agentCount: 1,
          idleAgents: 1,
          executingAgents: 0,
          pendingTasks: 0,
          completedTasks: 0,
        },
        createdAt: new Date().toISOString(),
      }
    },

    async deleteSwarm(_id: string): Promise<void> {
      // Mock delete
    },

    async submitTask(_request: SwarmTaskRequest): Promise<string> {
      return `task-${Date.now()}`
    },

    async executeTask(swarmId: string, taskId: string): Promise<SwarmTaskResult> {
      return {
        taskId,
        status: 'completed',
        output: `Mock task execution for swarm ${swarmId}`,
        agentResults: {
          'claude-code': {
            agentId: 'claude-code',
            content: 'Mock agent result',
            success: true,
            durationMs: 100,
          },
        },
      }
    },
  },
}

// 统一导出
export const api = {
  isTauriEnv,
  agent: agentApi,
  fs: fsApi,
  execute: executeApi,
  swarm: swarmApi,
}
