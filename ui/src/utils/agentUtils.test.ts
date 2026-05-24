import { describe, it, expect } from 'vitest'
import { mapAgentStatus, AGENT_ICONS } from './agentUtils'

describe('agentUtils', () => {
  describe('mapAgentStatus', () => {
    it('maps active to active', () => {
      expect(mapAgentStatus('active')).toBe('active')
    })

    it('maps connected to active', () => {
      expect(mapAgentStatus('connected')).toBe('active')
    })

    it('maps executing to active', () => {
      expect(mapAgentStatus('executing')).toBe('active')
    })

    it('maps idle to idle', () => {
      expect(mapAgentStatus('idle')).toBe('idle')
    })

    it('maps busy to busy', () => {
      expect(mapAgentStatus('busy')).toBe('busy')
    })

    it('maps thinking to busy', () => {
      expect(mapAgentStatus('thinking')).toBe('busy')
    })

    it('maps error to error', () => {
      expect(mapAgentStatus('error')).toBe('error')
    })

    it('maps disconnected to error', () => {
      expect(mapAgentStatus('disconnected')).toBe('error')
    })

    it('maps unknown to offline', () => {
      expect(mapAgentStatus('unknown')).toBe('offline')
    })

    it('maps empty string to offline', () => {
      expect(mapAgentStatus('')).toBe('offline')
    })
  })

  describe('AGENT_ICONS', () => {
    it('has icons for known agents', () => {
      expect(AGENT_ICONS['claude-code']).toBeDefined()
      expect(AGENT_ICONS['gemini-cli']).toBeDefined()
      expect(AGENT_ICONS['cline']).toBeDefined()
    })

    it('has default icon', () => {
      expect(AGENT_ICONS['default']).toBeDefined()
    })

    it('all icons are single characters', () => {
      for (const icon of Object.values(AGENT_ICONS)) {
        expect(icon.length).toBeGreaterThanOrEqual(1)
      }
    })
  })
})
