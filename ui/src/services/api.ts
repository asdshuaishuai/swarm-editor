// API client using WebSocket communication

import { getWebSocketClient, WebSocketClient } from './websocket'

export * from './scheduling'
export * from './byzantine'

// 类型定义
export interface AgentInfo {
  id: string
  name: string
  type: string
  state: string
  status?: string  // backward compatibility
  command?: string
  capabilities?: string[]
  lastActive?: string | null
  description?: string
  enabled?: boolean
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
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

export interface SwarmInfo {
  id: string
  name: string
  topology: string
  strategy: string
  status: string
  state?: string  // backward compatibility
  agentCount: number
  taskCount: number
  agents?: string[]  // backward compatibility
  stats?: SwarmTaskStats  // backward compatibility
  createdAt?: string
  coordinatorId?: string
}

export interface SwarmTaskStats {
  agentCount: number
  idleAgents: number
  executingAgents: number
  pendingTasks: number
  completedTasks: number
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
  priority?: string
}

export interface TaskInfo {
  id: string
  title: string
  description: string
  status: string
  priority: number
  assignedTo?: string[]
  createdAt: string
}

export interface TeamInfo {
  id: string
  name: string
  description?: string
  ownerId: string
  members: TeamMemberInfo[]
  agents: string[]
  createdAt: string
}

export interface TeamMemberInfo {
  id: string
  name: string
  role: string
  online: boolean
}

export interface SessionInfo {
  id: string
  sessionId?: string  // backward compatibility
  agentId: string
  agentName?: string  // backward compatibility
  mode: string
  messages: MessageInfo[]
  createdAt: string
  updatedAt: string
}

export interface MessageInfo {
  role: string
  content: string
  timestamp: string
}

export interface MCPServerInfo {
  id: string
  name: string
  status: string
  tools?: MCPToolInfo[]
}

export interface MCPToolInfo {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
}

export interface EmergenceData {
  health: SwarmHealth
  signals: EmergentSignal[]
  agents: AgentNode[]
  flows: TaskFlow[]
}

export interface SwarmHealth {
  overallScore: number
  congestionLevel: number
  collaborationIndex: number
  innovationRate: number
  agentUtilization: number
}

export interface EmergentSignal {
  id: string
  type: string
  severity: string
  message: string
  timestamp: string
}

export interface AgentNode {
  id: string
  name: string
  type: string
  load: number
  x: number
  y: number
}

export interface TaskFlow {
  id: string
  fromAgent: string
  toAgent: string
  taskType: string
  status: string
  startedAt: string
}

export interface SupervisorStats {
  totalAgents: number
  healthyAgents: number
  degradedAgents: number
  unhealthyAgents: number
  busyAgents: number
  avgResponseTime: number
  throughput: number
}

export interface PermissionRequest {
  id: string
  sessionId: string
  type: string
  description: string
  options?: PermissionOption[]
  metadata?: Record<string, unknown>
}

export interface PermissionOption {
  id: string
  label: string
  description: string
}

// Helper to get WebSocket client
function getClient(): WebSocketClient {
  return getWebSocketClient()
}

// Agent API
export const agentApi = {
  async getAgents(): Promise<AgentInfo[]> {
    return getClient().invoke<AgentInfo[]>('get_agents')
  },

  async refreshAgents(): Promise<AgentInfo[]> {
    return getClient().invoke<AgentInfo[]>('refresh_agents')
  },

  async getAgent(id: string): Promise<AgentInfo> {
    return getClient().invoke<AgentInfo>('get_agent', { id })
  },

  async startAgent(id: string): Promise<AgentInfo> {
    await getClient().invoke('start_agent', { id })
    return this.getAgent(id)
  },

  async stopAgent(id: string): Promise<AgentInfo> {
    await getClient().invoke('stop_agent', { id })
    return this.getAgent(id)
  },

  async addAgent(config: AgentConfig): Promise<AgentInfo> {
    return getClient().invoke<AgentInfo>('add_agent', { config })
  },

  async updateAgent(config: AgentConfig): Promise<AgentInfo> {
    return getClient().invoke<AgentInfo>('update_agent', { config })
  },

  async deleteAgent(id: string): Promise<void> {
    await getClient().invoke('delete_agent', { id })
  },

  async getConfigPath(): Promise<string> {
    return getClient().invoke<string>('get_config_path')
  },

  async createSession(agentId: string, mode?: string): Promise<SessionInfo & { agentName?: string }> {
    const result = await getClient().invoke<SessionInfo>('create_session', { agentId, mode: mode || 'default' })
    return { ...result, sessionId: result.id, agentName: '' }
  },

  async sendMessage(sessionId: string, message: string): Promise<{ sessionId: string; stopReason: string; content?: string }> {
    await getClient().invoke<{ status: string; timestamp: string }>('send_message', { sessionId, message })
    return { sessionId, stopReason: 'complete', content: '' }
  },

  async closeSession(sessionId: string): Promise<void> {
    await getClient().invoke('close_session', { sessionId })
  },
}

// Swarm API
export const swarmApi = {
  async getSwarms(): Promise<SwarmInfo[]> {
    const swarms = await getClient().invoke<SwarmInfo[]>('get_swarms')
    // Add backward compatibility fields
    return swarms.map(s => ({
      ...s,
      state: s.status,
      agents: [],
      stats: {
        agentCount: s.agentCount,
        idleAgents: 0,
        executingAgents: 0,
        pendingTasks: s.taskCount,
        completedTasks: 0,
      } as SwarmTaskStats,
    }))
  },

  async getSwarm(id: string): Promise<SwarmInfo> {
    const swarm = await getClient().invoke<SwarmInfo>('get_swarm', { id })
    // Add backward compatibility fields
    return {
      ...swarm,
      state: swarm.status,
      agents: [],
      stats: {
        agentCount: swarm.agentCount,
        idleAgents: 0,
        executingAgents: 0,
        pendingTasks: swarm.taskCount,
        completedTasks: 0,
      } as SwarmTaskStats,
    }
  },

  async createSwarm(request: SwarmCreateRequest): Promise<SwarmInfo> {
    const swarm = await getClient().invoke<SwarmInfo>('create_swarm', request)
    return {
      ...swarm,
      state: swarm.status,
      agents: request.agentIds,
      stats: {
        agentCount: request.agentIds.length,
        idleAgents: request.agentIds.length,
        executingAgents: 0,
        pendingTasks: 0,
        completedTasks: 0,
      } as SwarmTaskStats,
    }
  },

  async startSwarm(id: string): Promise<SwarmInfo> {
    await getClient().invoke('start_swarm', { id })
    return this.getSwarm(id)
  },

  async stopSwarm(id: string): Promise<SwarmInfo> {
    await getClient().invoke('stop_swarm', { id })
    return this.getSwarm(id)
  },

  async deleteSwarm(id: string): Promise<void> {
    await getClient().invoke('delete_swarm', { id })
  },

  async submitTask(request: SwarmTaskRequest): Promise<string> {
    const task = await getClient().invoke<TaskInfo>('submit_task', {
      swarmId: request.swarmId,
      title: request.title,
      description: request.description,
      priority: request.priority,
    })
    return task.id
  },

  async executeTask(_swarmId: string, taskId: string): Promise<SwarmTaskResult> {
    return getClient().invoke<SwarmTaskResult>('execute_task', { swarmId: _swarmId, taskId })
  },

  async getSwarmTasks(swarmId: string): Promise<Record<string, number>> {
    return getClient().invoke('get_swarm_tasks', { swarmId })
  },
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

// Team API
export const teamApi = {
  async getTeams(): Promise<TeamInfo[]> {
    return getClient().invoke<TeamInfo[]>('get_teams')
  },

  async createTeam(name: string, ownerId: string): Promise<TeamInfo> {
    return getClient().invoke<TeamInfo>('create_team', { name, ownerId })
  },

  async deleteTeam(id: string): Promise<{ status: string }> {
    return getClient().invoke('delete_team', { id })
  },

  async addAgentToTeam(teamId: string, agentId: string): Promise<{ status: string }> {
    return getClient().invoke('add_agent_to_team', { teamId, agentId })
  },

  async removeAgentFromTeam(teamId: string, agentId: string): Promise<{ status: string }> {
    return getClient().invoke('remove_agent_from_team', { teamId, agentId })
  },
}

// MCP API
export const mcpApi = {
  async getServers(): Promise<MCPServerInfo[]> {
    const servers = await getClient().invoke<MCPServerInfo[]>('get_mcp_servers')
    // Add backward compatibility fields
    return servers.map(s => ({
      ...s,
      resources: [],
      status: s.status as 'connected' | 'disconnected' | 'connecting' | 'error',
    }))
  },

  async startServer(serverId: string): Promise<MCPServerInfo> {
    await getClient().invoke('start_mcp_server', { serverId })
    const servers = await this.getServers()
    const server = servers.find(s => s.id === serverId)
    if (!server) throw new Error(`Server not found: ${serverId}`)
    return server
  },

  async stopServer(serverId: string): Promise<MCPServerInfo> {
    await getClient().invoke('stop_mcp_server', { serverId })
    const servers = await this.getServers()
    const server = servers.find(s => s.id === serverId)
    if (!server) throw new Error(`Server not found: ${serverId}`)
    return server
  },

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return getClient().invoke('call_mcp_tool', { serverId, toolName, arguments: args })
  },

  async addServer(config: { name: string; command: string; args?: string[]; env?: Record<string, string> }): Promise<MCPServerInfo> {
    return getClient().invoke('add_mcp_server', { config })
  },

  async removeServer(serverId: string): Promise<void> {
    await getClient().invoke('remove_mcp_server', { serverId })
  },
}

// Monitoring API
export const monitoringApi = {
  async getSupervisorStats(): Promise<SupervisorStats> {
    return getClient().invoke<SupervisorStats>('get_supervisor_stats')
  },

  async getEmergenceData(): Promise<EmergenceData> {
    return getClient().invoke<EmergenceData>('get_emergence_data')
  },
}

// File System API
export const fsApi = {
  async listDir(path: string): Promise<FileEntry[]> {
    return getClient().invoke<FileEntry[]>('list_dir', { path })
  },

  async readFile(path: string): Promise<string> {
    const result = await getClient().invoke<{ content: string }>('read_file', { path })
    return result.content
  },

  async writeFile(path: string, content: string): Promise<void> {
    await getClient().invoke('write_file', { path, content })
  },

  async getWorkspace(): Promise<string> {
    // Return default workspace path (browser-safe)
    return '.'
  },
}

// Execute API
export const executeApi = {
  async executeCode(
    filePath: string,
    content: string,
    language: string,
    agentId?: string
  ): Promise<{ success: boolean; output: string; error?: string }> {
    return getClient().invoke('execute_code', { filePath, content, language, agentId })
  },
}

// Backend API (connection management)
export const backendApi = {
  async getStatus(): Promise<BackendStatus> {
    return {
      connected: getClient().isConnected(),
      state: getClient().isConnected() ? 'connected' : 'disconnected',
      retryCount: 0,
      reconnectEnabled: true,
      backendType: 'websocket',
    }
  },

  async connect(): Promise<string> {
    await getClient().connect()
    return 'connected'
  },

  async disconnect(): Promise<string> {
    getClient().disconnect()
    return 'disconnected'
  },

  async enableReconnect(): Promise<void> {
    // No-op for WebSocket - always enabled
  },

  async disableReconnect(): Promise<void> {
    // No-op for WebSocket - always enabled
  },
}

export interface BackendStatus {
  connected: boolean
  state: string
  retryCount: number
  reconnectEnabled: boolean
  backendType: string
}

// Event subscription helpers
export const events = {
  subscribe(eventType: string, handler: (payload: unknown) => void): () => void {
    return getClient().subscribe(eventType, handler)
  },

  onAgentStatusChange(handler: (payload: { agentId: string; state: string }) => void): () => void {
    return getClient().subscribe('agent_status_change', handler as (payload: unknown) => void)
  },

  onSwarmTaskUpdate(handler: (payload: { swarmId: string; taskId: string; status: string; progress: number }) => void): () => void {
    return getClient().subscribe('swarm_task_update', handler as (payload: unknown) => void)
  },

  onSwarmStatusChange(handler: (payload: { swarmId: string; status: string }) => void): () => void {
    return getClient().subscribe('swarm_status_change', handler as (payload: unknown) => void)
  },

  onPermissionRequest(handler: (payload: PermissionRequest) => void): () => void {
    return getClient().subscribe('permission_request', handler as (payload: unknown) => void)
  },

  onAgentMessage(handler: (payload: { sessionId: string; content: string }) => void): () => void {
    return getClient().subscribe('agent_message', handler as (payload: unknown) => void)
  },

  onAgentStats(handler: (payload: AgentInfo[]) => void): () => void {
    return getClient().subscribe('agent_stats', handler as (payload: unknown) => void)
  },

  onSwarmStats(handler: (payload: SwarmInfo[]) => void): () => void {
    return getClient().subscribe('swarm_stats', handler as (payload: unknown) => void)
  },

  // Workflow streaming events (LangGraph multi-mode streaming pattern)
  onWorkflowNodeStart(handler: (payload: { workflowId: string; nodeId: string; nodeName: string; nodeType: string; agentId: string }) => void): () => void {
    return getClient().subscribe('workflow_node_start', handler as (payload: unknown) => void)
  },

  onWorkflowNodeComplete(handler: (payload: { workflowId: string; nodeId: string; nodeName: string; nodeType: string; durationMs: number; cached: boolean }) => void): () => void {
    return getClient().subscribe('workflow_node_complete', handler as (payload: unknown) => void)
  },

  onWorkflowNodeCached(handler: (payload: { workflowId: string; nodeId: string; nodeName: string; durationMs: number }) => void): () => void {
    return getClient().subscribe('workflow_node_cached', handler as (payload: unknown) => void)
  },

  onWorkflowStatusChange(handler: (payload: { workflowId: string; status: string; interruptedNodeId?: string; interruptPhase?: string }) => void): () => void {
    return getClient().subscribe('workflow_status_change', handler as (payload: unknown) => void)
  },
}

// Workflow API
export interface WorkflowInfo {
  id: string
  name: string
  description: string
  mode: string
  status: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: string
  updatedAt: string
  // Interrupt state (LangGraph pattern)
  interruptedNodeId?: string
  interruptPhase?: 'before' | 'after'
  // Workflow chaining (CrewAI Flows pattern)
  onComplete?: WorkflowChainLink[]
}

// WorkflowChainLink defines a downstream workflow to trigger on completion.
export interface WorkflowChainLink {
  workflowId: string
  input?: Record<string, any>
  condition?: 'always' | 'on_success' | 'on_failure'
}

export interface WorkflowNode {
  id: string
  name: string
  agentId: string
  type: string
  status: string
  position: { x: number; y: number }
  // Interrupt fields for human-in-the-loop (LangGraph pattern)
  interrupt?: boolean
  interruptBefore?: boolean
  interruptAfter?: boolean
  resumeInput?: unknown
  // Action-based routing (Dify HITL pattern)
  interruptActions?: InterruptAction[]
  chosenAction?: string
}

export interface InterruptAction {
  id: string
  label: string
  style?: 'primary' | 'danger' | 'warning' | 'default'
}

// HTTP Request Node (Dify/n8n pattern)
export interface HTTPRequestResult {
  statusCode: number
  status: string
  headers: Record<string, string>
  body: string
  durationMs: number
  url: string
  method: string
  json?: unknown
}

// Iterator Node (Dify Iterator pattern)
export interface IteratorResult {
  outputs: Record<string, unknown>[]
  errors: { index: number; item: unknown; error: string }[]
  totalItems: number
  failed: number
  succeeded: number
  skipped: number
}

// Condition/IF Node (Dify IF node pattern)
export interface ConditionResult {
  result: boolean
  left: unknown
  right: unknown
  operator: string
}

// Template/Transform Node (Dify Template Transform / n8n Set node pattern)
export interface TemplateResult {
  output: Record<string, unknown>
  variables?: Record<string, string>
  raw?: string
}

// Merge Node (n8n Merge Node pattern)
export interface MergeResult {
  mode: 'append' | 'combine' | 'choose_branch' | 'wait_all'
  results: unknown[]
  merged: unknown
  count: number
}

// Switch Node (n8n Switch Node pattern)
export interface SwitchResult {
  branch: string
  matched: boolean
  rules: number
  evaluated: number
}

// Wait/Delay Node (n8n Wait Node pattern)
export interface WaitResult {
  waitedMs: number
  waited: string
  deadline?: string
  cancelled?: boolean
}

// Aggregator Node (Dify Variable Aggregator pattern)
export interface AggregatorResult {
  strategy: 'concat' | 'first' | 'last' | 'merge_maps' | 'count' | 'join' | 'sum' | 'avg' | 'min' | 'max'
  count: number
  result: unknown
  items?: unknown[]
}

// Code Node (Dify/n8n Code Node pattern)
export interface CodeResult {
  output: unknown
  type?: 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object' | 'error'
  error?: string
}

// Automation Types (Prefect 3 Automations pattern)
export interface AutomationTrigger {
  events: string[]
  match?: Record<string, string>
}

export interface AutomationAction {
  type: string
  params?: Record<string, any>
}

export interface Automation {
  id: string
  name: string
  description?: string
  trigger: AutomationTrigger
  actions: AutomationAction[]
  enabled: boolean
  cooldown?: string
  fireCount?: number
  lastFired?: string
}

// Workflow Artifact types (Prefect 3 Artifacts pattern)
export interface WorkflowArtifact {
  id: string
  workflowId: string
  nodeId?: string
  key: string
  type: 'json' | 'markdown' | 'table' | 'link' | 'text' | 'progress'
  data: any
  description?: string
  version: number
  createdAt: string
  updatedAt: string
  metadata?: Record<string, string>
}

export interface WorkflowVariable {
  id: string
  name: string
  key: string
  type: 'string' | 'number' | 'boolean' | 'json' | 'array'
  value?: any
  default?: any
  description?: string
  required: boolean
}

export interface WorkflowEdge {
  id: string
  from: string
  to: string
  condition?: string
  label: string
}

// Execution Report Types (Temporal-inspired observability)
export type FailureType = 'timeout' | 'agent_error' | 'validation' | 'cancelled' | 'system' | 'unknown'

export interface NodeFailure {
  nodeId: string
  failureType: FailureType
  errorMessage: string
  errorCode?: string
  retryable: boolean
  timestamp: string
  durationMs: number
}

export interface NodeResult {
  nodeId: string
  status: string
  result?: unknown
  startedAt?: string
  completedAt?: string
  durationMs: number
}

export interface SkippedNode {
  nodeId: string
  reason: string
  skippedAt: string
}

export interface WorkflowExecutionReport {
  workflowId: string
  executionId: string
  createdAt: string
  status: 'running' | 'completed' | 'failed' | 'partial' | 'paused'
  mode: string
  durationMs: number
  succeededNodes: NodeResult[]
  failedNodes: NodeFailure[]
  skippedNodes: SkippedNode[]
  totalNodes: number
  successCount: number
  failureCount: number
  skippedCount: number
  checkpointId?: string
  rootCause?: NodeFailure
}

export interface CheckpointInfo {
  id: string
  workflowId: string
  createdAt: string
  currentNode: string
  metadata?: Record<string, unknown>
}

export const workflowApi = {
  async list(): Promise<WorkflowInfo[]> {
    return getClient().invoke<WorkflowInfo[]>('list_workflows')
  },

  async get(id: string): Promise<WorkflowInfo> {
    return getClient().invoke<WorkflowInfo>('get_workflow', { id })
  },

  async create(workflow: Partial<WorkflowInfo>): Promise<{ id: string; name: string; status: string }> {
    return getClient().invoke('create_workflow', {
      name: workflow.name || 'New Workflow',
      description: workflow.description || '',
      mode: workflow.mode || 'sequential',
    })
  },

  async update(id: string, workflow: Partial<WorkflowInfo>): Promise<void> {
    await getClient().invoke('update_workflow', { id, workflow })
  },

  async delete(id: string): Promise<void> {
    await getClient().invoke('delete_workflow', { id })
  },

  async execute(id: string): Promise<void> {
    await getClient().invoke('execute_workflow', { id })
  },

  async getCheckpoints(id: string): Promise<CheckpointInfo[]> {
    return getClient().invoke('get_workflow_checkpoints', { id })
  },

  async restore(id: string, checkpointId: string): Promise<WorkflowInfo> {
    return getClient().invoke('restore_workflow', { id, checkpointId })
  },

  async getReport(id: string): Promise<WorkflowExecutionReport> {
    return getClient().invoke('get_workflow_report', { id })
  },

  async resume(id: string, input?: unknown): Promise<WorkflowInfo> {
    return getClient().invoke('resume_workflow', { id, input })
  },

  async clearNodeCache(nodeId: string): Promise<void> {
    return getClient().invoke('clear_node_cache', { nodeId })
  },

  async clearAllCaches(): Promise<void> {
    return getClient().invoke('clear_all_caches', {})
  },

  async addNode(id: string, node: Partial<WorkflowNode>): Promise<WorkflowNode> {
    return getClient().invoke('add_workflow_node', {
      id,
      node: {
        agentId: node.agentId,
        name: node.name,
        type: node.type,
        position: node.position,
      },
    })
  },

  async addEdge(id: string, edge: Partial<WorkflowEdge>): Promise<WorkflowEdge> {
    return getClient().invoke('add_workflow_edge', {
      id,
      edge: {
        from: edge.from,
        to: edge.to,
        condition: edge.condition,
        label: edge.label,
      },
    })
  },
}

// Automation API (Prefect 3 Automations pattern)
const automationApi = {
  async list(): Promise<Automation[]> {
    return getClient().invoke('list_automations', {})
  },

  async add(automation: Omit<Automation, 'fireCount' | 'lastFired'>): Promise<{ id: string; status: string }> {
    return getClient().invoke('add_automation', automation)
  },

  async remove(id: string): Promise<void> {
    return getClient().invoke('remove_automation', { id })
  },

  async enable(id: string, enabled: boolean): Promise<void> {
    return getClient().invoke('enable_automation', { id, enabled })
  },
}

// Artifact API (Prefect 3 Artifacts pattern)
const artifactApi = {
  async list(workflowId: string, nodeId?: string): Promise<WorkflowArtifact[]> {
    return getClient().invoke('list_artifacts', { workflowId, nodeId })
  },

  async get(params: { id?: string; workflowId?: string; key?: string }): Promise<WorkflowArtifact> {
    return getClient().invoke('get_artifact', params)
  },

  async create(artifact: Omit<WorkflowArtifact, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<{ id: string; status: string }> {
    return getClient().invoke('create_artifact', artifact)
  },

  async remove(workflowId: string, key: string): Promise<void> {
    return getClient().invoke('delete_artifact', { workflowId, key })
  },
}

// Variable API (Dify/Prefect Variable System pattern)
const variableApi = {
  async list(workflowId: string): Promise<WorkflowVariable[]> {
    return getClient().invoke('list_variables', { workflowId })
  },

  async add(workflowId: string, variable: Omit<WorkflowVariable, 'id'>): Promise<{ id: string; key: string }> {
    return getClient().invoke('add_variable', { workflowId, ...variable })
  },

  async remove(workflowId: string, variableId: string): Promise<void> {
    return getClient().invoke('remove_variable', { workflowId, variableId })
  },

  async setValue(workflowId: string, key: string, value: any): Promise<void> {
    return getClient().invoke('set_variable_value', { workflowId, key, value })
  },

  async resolve(workflowId: string, template: string): Promise<{ result: string }> {
    return getClient().invoke('resolve_variables', { workflowId, template })
  },
}

// 统一导出
export const api = {
  agent: agentApi,
  fs: fsApi,
  execute: executeApi,
  swarm: swarmApi,
  team: teamApi,
  mcp: mcpApi,
  backend: backendApi,
  monitoring: monitoringApi,
  workflows: workflowApi,
  automations: automationApi,
  artifacts: artifactApi,
  variables: variableApi,
  events,
}

// Note: Types are already exported via 'export interface' above

// Event types for backward compatibility
export interface SwarmTaskUpdateEvent {
  swarm_id: string
  swarmId: string
  task_id: string
  taskId: string
  status: string
  progress: number
}

export interface SwarmStatusEvent {
  swarm_id: string
  swarmId: string
  new_state: string
  status: string
}

export interface AgentStatusEvent {
  agent_id: string
  agentId: string
  status: string
  state: string
}

export interface PermissionRequestEvent {
  id: string
  sessionId: string
  type: string
  description: string
  options?: PermissionOption[]
  metadata?: Record<string, unknown>
}

export interface LogEvent {
  level: string
  source: string
  message: string
}
