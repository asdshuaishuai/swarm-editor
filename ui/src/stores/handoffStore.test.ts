import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useHandoffStore } from './handoffStore'

const mockResolveHandoff = vi.fn().mockResolvedValue(undefined)

vi.mock('../services', () => ({
  api: {
    swarm: {
      resolveHandoff: (...args: any[]) => mockResolveHandoff(...args),
    },
  },
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const sampleHandoff = {
  id: 'ho-1',
  fromAgent: 'a1',
  toAgent: 'a2',
  taskId: 't1',
  reason: 'needs review',
  status: 'pending' as const,
  createdAt: new Date(),
  context: {
    filesModified: ['src/app.ts'],
    nextSteps: ['review code'],
  },
}

describe('handoffStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useHandoffStore.getState().clearActiveHandoff()
  })

  it('starts with null activeHandoff', () => {
    expect(useHandoffStore.getState().activeHandoff).toBeNull()
  })

  it('setActiveHandoff sets the request', () => {
    useHandoffStore.getState().setActiveHandoff(sampleHandoff)
    expect(useHandoffStore.getState().activeHandoff).toEqual(sampleHandoff)
  })

  it('clearActiveHandoff resets to null', () => {
    useHandoffStore.getState().setActiveHandoff(sampleHandoff)
    useHandoffStore.getState().clearActiveHandoff()
    expect(useHandoffStore.getState().activeHandoff).toBeNull()
  })

  it('resolveHandoff calls backend API with accepted=true', async () => {
    useHandoffStore.getState().setActiveHandoff(sampleHandoff)
    useHandoffStore.getState().resolveHandoff(true, 'LGTM')
    expect(mockResolveHandoff).toHaveBeenCalledWith('ho-1', true, 'LGTM')
    expect(useHandoffStore.getState().activeHandoff).toBeNull()
  })

  it('resolveHandoff calls backend API with accepted=false', async () => {
    useHandoffStore.getState().setActiveHandoff(sampleHandoff)
    useHandoffStore.getState().resolveHandoff(false, 'Needs work')
    expect(mockResolveHandoff).toHaveBeenCalledWith('ho-1', false, 'Needs work')
    expect(useHandoffStore.getState().activeHandoff).toBeNull()
  })

  it('resolveHandoff does nothing when no active handoff', () => {
    useHandoffStore.getState().resolveHandoff(true)
    expect(mockResolveHandoff).not.toHaveBeenCalled()
  })

  it('resolveHandoff clears handoff even before API resolves', () => {
    useHandoffStore.getState().setActiveHandoff(sampleHandoff)
    useHandoffStore.getState().resolveHandoff(true)
    // Handoff is cleared synchronously
    expect(useHandoffStore.getState().activeHandoff).toBeNull()
  })

  it('resolveHandoff handles API failure gracefully', async () => {
    mockResolveHandoff.mockRejectedValueOnce(new Error('network'))
    useHandoffStore.getState().setActiveHandoff(sampleHandoff)
    useHandoffStore.getState().resolveHandoff(true)
    // Still clears locally
    expect(useHandoffStore.getState().activeHandoff).toBeNull()
  })
})
