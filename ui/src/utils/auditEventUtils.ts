import type { AuditEvent } from '../services'

export type AuditCategory = 'orchestrate' | 'a2a' | 'security' | 'mcp' | 'exec' | 'info'

const CATEGORY_KEYWORDS: Record<AuditCategory, string[]> = {
  orchestrate: ['consensus', 'orchestrat', 'queen', 'goal'],
  a2a: ['a2a', 'handoff', 'message'],
  security: ['permission', 'security', 'privilege', 'hitl'],
  mcp: ['mcp', 'tool'],
  exec: ['exec', 'task', 'swarm', 'daemon', 'init', 'start'],
  info: [],
}

export const CATEGORY_COLORS: Record<AuditCategory, string> = {
  orchestrate: '#fbbf24',
  a2a: '#22d3ee',
  security: '#f0883e',
  mcp: '#c084fc',
  exec: '#3fb950',
  info: '#8b949e',
}

export function classifyAuditEvent(event: AuditEvent): AuditCategory {
  const t = (event.eventType || '').toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [AuditCategory, string[]][]) {
    if (category === 'info') continue
    if (keywords.some(kw => t.includes(kw))) return category
  }
  return 'info'
}

export function getEventColor(event: AuditEvent): string {
  return CATEGORY_COLORS[classifyAuditEvent(event)]
}
