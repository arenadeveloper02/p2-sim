/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateAnthropicMessage } = vi.hoisted(() => ({
  mockCreateAnthropicMessage: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {},
}))

vi.mock('@/lib/anthropic/create-message', () => ({
  createAnthropicMessage: mockCreateAnthropicMessage,
}))

vi.mock('@/lib/core/config/api-keys', () => ({
  getRotatingApiKey: () => 'test-key',
}))

import {
  ARENA_GENERATIVE_UI_CRITIC_SYSTEM_PROMPT,
  critiqueArenaGenerativeManifest,
  formatCriticRepairError,
  mustFixCriticIssues,
  parseArenaGenerativeCritique,
} from '@/lib/arena-generative-ui/critique-manifest'
import { twoPageApiBindings, twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'

function textMessage(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

describe('parseArenaGenerativeCritique', () => {
  it('accepts a passing critique', () => {
    expect(parseArenaGenerativeCritique({ pass: true, issues: [] })).toEqual({
      pass: true,
      issues: [],
    })
  })

  it('accepts must-fix issues', () => {
    const critique = parseArenaGenerativeCritique({
      pass: false,
      issues: [
        {
          category: 'ux',
          severity: 'must-fix',
          page: 'results',
          message: 'Primary task is buried.',
          fixHint: 'Add a PageHeader that names the score.',
        },
      ],
    })
    expect(critique?.pass).toBe(false)
    expect(mustFixCriticIssues(critique ?? { pass: true, issues: [] })).toHaveLength(1)
    expect(
      formatCriticRepairError(mustFixCriticIssues(critique ?? { pass: true, issues: [] }))
    ).toContain('UI critic must-fix (ux) on page "results"')
  })

  it('rejects an invalid reply', () => {
    expect(parseArenaGenerativeCritique({ pass: 'yes' })).toBeNull()
    expect(parseArenaGenerativeCritique(null)).toBeNull()
  })
})

describe('ARENA_GENERATIVE_UI_CRITIC_SYSTEM_PROMPT', () => {
  it('asks the UX, visual, responsive, accessibility, and data checklist', () => {
    expect(ARENA_GENERATIVE_UI_CRITIC_SYSTEM_PROMPT).toContain('UX —')
    expect(ARENA_GENERATIVE_UI_CRITIC_SYSTEM_PROMPT).toContain('VISUAL —')
    expect(ARENA_GENERATIVE_UI_CRITIC_SYSTEM_PROMPT).toContain('RESPONSIVE —')
    expect(ARENA_GENERATIVE_UI_CRITIC_SYSTEM_PROMPT).toContain('ACCESSIBILITY —')
    expect(ARENA_GENERATIVE_UI_CRITIC_SYSTEM_PROMPT).toContain('DATA —')
    expect(ARENA_GENERATIVE_UI_CRITIC_SYSTEM_PROMPT).toContain('already failed validation')
  })
})

describe('critiqueArenaGenerativeManifest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a parsed must-fix critique and sends a compact payload', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(
      textMessage(
        JSON.stringify({
          pass: false,
          issues: [
            {
              category: 'visual',
              severity: 'must-fix',
              page: 'home',
              message: 'Hierarchy is flat.',
              fixHint: 'Promote the form with a PageHeader.',
            },
          ],
        })
      )
    )

    const critique = await critiqueArenaGenerativeManifest({
      manifest: twoPageManifest,
      apiBindings: twoPageApiBindings,
      authoredPagePaths: ['home'],
    })

    expect(critique.pass).toBe(false)
    expect(mustFixCriticIssues(critique)).toHaveLength(1)
    expect(mockCreateAnthropicMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        model: 'claude-haiku-4-5',
        max_tokens: expect.any(Number),
        system: ARENA_GENERATIVE_UI_CRITIC_SYSTEM_PROMPT,
      })
    )
    const userContent = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0]?.content as string
    expect(userContent).toContain('"path":"home"')
    expect(userContent).not.toContain('"path":"results"')
    expect(userContent).toContain('"actionId":"submit_lead"')
    expect(userContent).not.toContain('Qualify a lead')
  })

  it('fails open on empty or invalid JSON', async () => {
    mockCreateAnthropicMessage.mockResolvedValueOnce(textMessage(''))
    await expect(
      critiqueArenaGenerativeManifest({
        manifest: twoPageManifest,
        apiBindings: [],
      })
    ).resolves.toEqual({ pass: true, issues: [], skipped: true })

    mockCreateAnthropicMessage.mockResolvedValueOnce(textMessage('not json'))
    await expect(
      critiqueArenaGenerativeManifest({
        manifest: twoPageManifest,
        apiBindings: [],
      })
    ).resolves.toEqual({ pass: true, issues: [], skipped: true })
  })

  it('fails open when the critic call throws', async () => {
    mockCreateAnthropicMessage.mockRejectedValue(new Error('haiku down'))
    await expect(
      critiqueArenaGenerativeManifest({
        manifest: twoPageManifest,
        apiBindings: [],
      })
    ).resolves.toEqual({ pass: true, issues: [], skipped: true })
  })
})
