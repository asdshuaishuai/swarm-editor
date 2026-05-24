import { describe, it, expect } from 'vitest'
import { classifyAuditEvent, getEventColor, CATEGORY_COLORS, type AuditCategory } from './auditEventUtils'
import type { AuditEvent } from '../services'

function makeEvent(eventType: string): AuditEvent {
  return { id: 'e1', eventType, timestamp: '', actor: '', action: '', resourceType: '', resourceId: '', success: true }
}

describe('auditEventUtils', () => {
  describe('classifyAuditEvent', () => {
    it('classifies consensus events as orchestrate', () => {
      expect(classifyAuditEvent(makeEvent('consensus_reached'))).toBe('orchestrate')
    })

    it('classifies orchestration events as orchestrate', () => {
      expect(classifyAuditEvent(makeEvent('orchestrat_task'))).toBe('orchestrate')
    })

    it('classifies queen events as orchestrate', () => {
      expect(classifyAuditEvent(makeEvent('queen_decision'))).toBe('orchestrate')
    })

    it('classifies goal events as orchestrate', () => {
      expect(classifyAuditEvent(makeEvent('goal_set'))).toBe('orchestrate')
    })

    it('classifies a2a events', () => {
      expect(classifyAuditEvent(makeEvent('a2a_message'))).toBe('a2a')
    })

    it('classifies handoff events as a2a', () => {
      expect(classifyAuditEvent(makeEvent('handoff_request'))).toBe('a2a')
    })

    it('classifies permission events as security', () => {
      expect(classifyAuditEvent(makeEvent('permission_granted'))).toBe('security')
    })

    it('classifies security events', () => {
      expect(classifyAuditEvent(makeEvent('security_check'))).toBe('security')
    })

    it('classifies hitl events as security', () => {
      expect(classifyAuditEvent(makeEvent('hitl_approval'))).toBe('security')
    })

    it('classifies mcp events', () => {
      expect(classifyAuditEvent(makeEvent('mcp_tool_call'))).toBe('mcp')
    })

    it('classifies tool events as mcp', () => {
      expect(classifyAuditEvent(makeEvent('tool_invocation'))).toBe('mcp')
    })

    it('classifies exec events', () => {
      expect(classifyAuditEvent(makeEvent('exec_command'))).toBe('exec')
    })

    it('classifies task events as exec', () => {
      expect(classifyAuditEvent(makeEvent('task_started'))).toBe('exec')
    })

    it('classifies swarm events as exec', () => {
      expect(classifyAuditEvent(makeEvent('swarm_created'))).toBe('exec')
    })

    it('classifies daemon events as exec', () => {
      expect(classifyAuditEvent(makeEvent('daemon_init'))).toBe('exec')
    })

    it('classifies unknown events as info', () => {
      expect(classifyAuditEvent(makeEvent('unknown_event'))).toBe('info')
    })

    it('classifies empty eventType as info', () => {
      expect(classifyAuditEvent(makeEvent(''))).toBe('info')
    })

    it('case insensitive matching', () => {
      expect(classifyAuditEvent(makeEvent('Consensus_REACHED'))).toBe('orchestrate')
      expect(classifyAuditEvent(makeEvent('A2A_MESSAGE'))).toBe('a2a')
      expect(classifyAuditEvent(makeEvent('MCP_TOOL'))).toBe('mcp')
    })
  })

  describe('getEventColor', () => {
    it('returns correct color for orchestrate events', () => {
      expect(getEventColor(makeEvent('consensus'))).toBe(CATEGORY_COLORS.orchestrate)
    })

    it('returns correct color for info events', () => {
      expect(getEventColor(makeEvent('unknown'))).toBe(CATEGORY_COLORS.info)
    })

    it('all categories have colors', () => {
      const categories: AuditCategory[] = ['orchestrate', 'a2a', 'security', 'mcp', 'exec', 'info']
      for (const cat of categories) {
        expect(CATEGORY_COLORS[cat]).toBeTruthy()
      }
    })
  })
})
