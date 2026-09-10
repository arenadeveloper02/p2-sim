/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExecuteLoadUserSkill } = vi.hoisted(() => ({
  mockExecuteLoadUserSkill: vi.fn(),
}))

vi.mock('@/local-copilot/lib/tools/user-skills', () => ({
  executeLoadUserSkill: mockExecuteLoadUserSkill,
}))

import { COPILOT_INLINED_SKILL_BODY_LIMIT } from '@/local-copilot/lib/context/inventory-limits'
import { loadRelevantSkillGuidance } from '@/local-copilot/lib/context/relevant-skills'

describe('loadRelevantSkillGuidance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads skill bodies concurrently and keeps name order', async () => {
    mockExecuteLoadUserSkill.mockImplementation(async (name: string) => {
      return { success: true, content: `${name} body` }
    })

    const result = await loadRelevantSkillGuidance({
      workspaceId: 'ws-1',
      skills: [
        { id: '2', name: 'beta', description: '' },
        { id: '1', name: 'alpha', description: '' },
      ],
    })

    expect(result.names).toEqual(['alpha', 'beta'])
    expect(result.message?.content).toContain('### alpha')
    expect(mockExecuteLoadUserSkill).toHaveBeenCalledTimes(2)
  })

  it('caps inlined skill bodies', async () => {
    mockExecuteLoadUserSkill.mockResolvedValue({ success: true, content: 'body' })
    const skills = Array.from({ length: COPILOT_INLINED_SKILL_BODY_LIMIT + 5 }, (_, index) => ({
      id: String(index),
      name: `skill-${String(index).padStart(2, '0')}`,
      description: '',
    }))

    await loadRelevantSkillGuidance({ workspaceId: 'ws-1', skills })

    expect(mockExecuteLoadUserSkill).toHaveBeenCalledTimes(COPILOT_INLINED_SKILL_BODY_LIMIT)
  })

  it('skips failed skill body reads', async () => {
    mockExecuteLoadUserSkill.mockImplementation(async (name: string) => {
      if (name === 'broken') return { success: false, error: 'missing' }
      return { success: true, content: `${name} body` }
    })

    const result = await loadRelevantSkillGuidance({
      workspaceId: 'ws-1',
      skills: [
        { id: '1', name: 'ok', description: '' },
        { id: '2', name: 'broken', description: '' },
      ],
    })

    expect(result.names).toEqual(['ok'])
  })
})
