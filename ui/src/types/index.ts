// Core types for the Swarm Editor

export interface Agent {
  id: string
  name: string
  type: AgentType
  state: AgentState
  capabilities: AgentCapabilities
  createdAt: string
  lastActive: string
}

export type AgentType = 'coder' | 'reviewer' | 'architect' | 'tester' | 'navigator' | 'driver' | 'orchestrator'
export type AgentState = 'idle' | 'thinking' | 'executing' | 'waiting' | 'error'

export interface AgentCapabilities {
  loadSession: boolean
  promptCapabilities: {
    image: boolean
    audio: boolean
    embeddedContext: boolean
  }
  mcp: {
    http: boolean
    sse: boolean
  }
  swarmMode?: SwarmCapabilities
  pairProgramming: boolean
  teamCollaboration: boolean
}

export interface SwarmCapabilities {
  maxAgents: number
  topologies: string[]
  taskDecompose: boolean
  consensus: boolean
}

export interface Swarm {
  id: string
  name: string
  topology: TopologyType
  strategy: TaskStrategy
  state: SwarmState
  agents: Agent[]
  stats: SwarmStats
}

export type TopologyType = 'star' | 'mesh' | 'tree' | 'ring' | 'hybrid'
export type TaskStrategy = 'parallel' | 'sequential' | 'pipeline' | 'mapreduce'
export type SwarmState = 'initializing' | 'active' | 'paused' | 'stopping' | 'stopped'

export interface SwarmStats {
  agentCount: number
  idleAgents: number
  executingAgents: number
  pendingTasks: number
  completedTasks: number
  topology: string
  strategy: string
  state: string
}

export interface Team {
  id: string
  name: string
  description: string
  owner: string
  members: TeamMember[]
  agents: Agent[]
  workspaces: Workspace[]
  stats: TeamStats
}

export interface TeamMember {
  id: string
  name: string
  email?: string
  role: MemberRole
  joinedAt: string
  agentId?: string
  online: boolean
}

export type MemberRole = 'owner' | 'admin' | 'developer' | 'reviewer' | 'observer'

export interface TeamStats {
  memberCount: number
  onlineMembers: number
  agentCount: number
  idleAgents: number
  workspaceCount: number
}

export interface Workspace {
  id: string
  name: string
  path: string
  teamId: string
  files: FileState[]
  activeUsers: CursorPosition[]
}

export interface FileState {
  path: string
  lastModified: string
  modifiedBy: string
  lockedBy?: string
  hasConflict: boolean
}

export interface CursorPosition {
  userId: string
  file: string
  line: number
  column: number
  selection?: Range
}

export interface Range {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export interface Session {
  id: string
  mode: SessionMode
  state: SessionState
  agents: Agent[]
  messages: Message[]
  files: string[]
  createdAt: string
  updatedAt: string
}

export type SessionMode = 'default' | 'planning' | 'editing' | 'reviewing' | 'pair_driver' | 'pair_navigator' | 'swarm'
export type SessionState = 'active' | 'paused' | 'completed' | 'error'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  agentId?: string
}

export interface Task {
  id: string
  title: string
  description: string
  state: TaskState
  priority: TaskPriority
  assignedTo: string[]
  dependencies: string[]
  subtasks: Task[]
  result?: TaskResult
  error?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
}

export type TaskState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'

export interface TaskResult {
  taskId: string
  agentId?: string
  output?: unknown
  filesChanged: string[]
  artifacts: Artifact[]
  error?: string
  duration: number
}

export interface Artifact {
  type: 'file' | 'code' | 'documentation' | 'test'
  name: string
  path?: string
  content?: string
  description?: string
}

export interface PairSession {
  id: string
  state: 'active' | 'paused' | 'switching' | 'ended'
  driver: Agent
  navigator: Agent
  currentFile: string
  edits: CodeEdit[]
  suggestions: Suggestion[]
  messages: PairMessage[]
  stats: PairStats
}

export interface CodeEdit {
  id: string
  agentId: string
  file: string
  startPos: Position
  endPos: Position
  oldText: string
  newText: string
  timestamp: string
  approved: boolean
  rejectedBy?: string
}

export interface Position {
  line: number
  column: number
}

export interface Suggestion {
  id: string
  fromAgent: string
  type: 'code' | 'comment' | 'refactor' | 'test' | 'question'
  content: string
  file?: string
  line?: number
  timestamp: string
  status: 'pending' | 'accepted' | 'rejected'
}

export interface PairMessage {
  id: string
  from: string
  to: string
  content: string
  timestamp: string
}

export interface PairStats {
  sessionId: string
  state: string
  driverId: string
  navigatorId: string
  switchCount: number
  totalEdits: number
  approvedEdits: number
  rejectedEdits: number
  totalSuggestions: number
  acceptedSuggestions: number
  rejectedSuggestions: number
  messageCount: number
  duration: number
}

// ACP Protocol types
export interface ACPMessage {
  jsonrpc: '2.0'
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: ACPError
}

export interface ACPError {
  code: number
  message: string
  data?: unknown
}

export interface InitializeParams {
  protocolVersion: number
  clientCapabilities: ClientCapabilities
  clientInfo: ImplementationInfo
}

export interface InitializeResult {
  protocolVersion: number
  agentCapabilities: AgentCapabilities
  agentInfo: ImplementationInfo
  authMethods: AuthMethod[]
}

export interface ClientCapabilities {
  fs?: {
    readTextFile?: boolean
    writeTextFile?: boolean
  }
  terminal?: boolean
}

export interface ImplementationInfo {
  name: string
  title?: string
  version: string
}

export interface AuthMethod {
  type: string
  name?: string
}

// Agent Configuration types
export interface AgentConfig {
  id: string
  name: string
  description?: string
  enabled: boolean
  command: string
  args?: string[]
  env?: Record<string, string>
  mcpSettings?: MCPSettings
  expectedCapabilities?: AgentCapabilities
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

export interface AgentSwarmConfig {
  canBeCoordinator: boolean
  canBeWorker: boolean
  preferredRoles?: string[]
  maxConcurrent?: number
  priority?: number
}

// Coordination types
export interface CoordinationTask {
  id: string
  parentId?: string
  title: string
  description: string
  prompt: string
  priority: number
  subtasks?: CoordinationTask[]
  isSubtask?: boolean
  assignedTo: string[]
  requiredRole?: string
  status: TaskStatus
  progress: number
  startedAt?: string
  completedAt?: string
  results: Record<string, CoordinationTaskResult>
  consensus?: ConsensusResult
  metadata?: Record<string, unknown>
  createdAt?: string
}

export type TaskStatus =
  | 'pending'
  | 'decomposing'
  | 'assigned'
  | 'running'
  | 'consensus'
  | 'completed'
  | 'failed'

export interface CoordinationTaskResult {
  agentId: string
  content: string
  filesChanged?: string[]
  artifacts?: Artifact[]
  error?: string
  startedAt: string
  completedAt: string
  duration: number
}

export interface ConsensusResult {
  agreement: number
  votes: Record<string, boolean>
  finalResult?: CoordinationTaskResult
}

export interface CoordinatorMessage {
  type: 'task_assign' | 'task_cancel' | 'query' | 'broadcast'
  taskId?: string
  content?: string
  metadata?: Record<string, unknown>
}

export interface CoordinationUpdate {
  agentId: string
  taskId?: string
  type: 'progress' | 'result' | 'error' | 'query'
  progress?: number
  content?: string
  error?: string
}

export interface CoordinatorStats {
  workerCount: number
  pendingTasks: number
  activeTasks: number
  completedTasks: number
  maxConcurrent: number
}