/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildLocalCopilotUserSkillToolFromSummaries,
  LOAD_USER_SKILL_TOOL_NAME,
} from '@/local-copilot/lib/tools/user-skills'

describe('buildLocalCopilotUserSkillToolFromSummaries', () => {
  it('returns null when the catalog is empty', () => {
    expect(buildLocalCopilotUserSkillToolFromSummaries([])).toBeNull()
  })

  it('builds a tool from already-loaded summaries without a second query', () => {
    const tool = buildLocalCopilotUserSkillToolFromSummaries([
      { name: 'draft-email', description: 'Write drafts' },
    ])

    expect(tool?.name).toBe(LOAD_USER_SKILL_TOOL_NAME)
    expect(JSON.stringify(tool?.parameters)).toContain('draft-email')
    expect(tool?.description).toContain('draft-email: Write drafts')
  })
})
