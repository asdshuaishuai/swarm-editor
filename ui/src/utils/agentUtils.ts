import type { Agent } from '../components/AgentCluster'

// Shared agent icon mapping (superset of all known agents)
export const AGENT_ICONS: Record<string, string> = {
  'claude-code': '◈',
  'codex': '◆',
  'kimi-code': '◇',
  'opencode': '○',
  'cline': '□',
  'qwen-code': '◆',
  'gemini-cli': '◇',
  'code-reviewer': '◈',
  'test-generator': '◈',
  'default': '□',
}

// Map backend agent state to AgentCluster status
export function mapAgentStatus(state: string): Agent['status'] {
  switch (state) {
    case 'active':
    case 'connected':
    case 'executing':
      return 'active'
    case 'idle':
      return 'idle'
    case 'busy':
    case 'thinking':
      return 'busy'
    case 'error':
    case 'disconnected':
      return 'error'
    default:
      return 'offline'
  }
}
