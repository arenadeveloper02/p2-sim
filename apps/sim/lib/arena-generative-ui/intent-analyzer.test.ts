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

vi.mock('@/providers/utils', () => ({
  getMaxOutputTokensForModel: () => 128_000,
  supportsTemperature: () => true,
}))

import {
  analyzeArenaGenerativeIntent,
  parseArenaGenerativeIntent,
} from '@/lib/arena-generative-ui/intent-analyzer'

function textMessage(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

const validIntent = {
  task: 'Browse orders and open one record.',
  audience: 'Ops coordinators',
  entities: [{ name: 'orders', kind: 'collection' as const }],
  dataRequirements: [{ apiKey: 'list_orders', usedFor: 'Fill the list' }],
  actions: [{ id: 'load_orders', apiKey: 'list_orders', purpose: 'Fetch the list' }],
  workflowComplexity: 'short' as const,
}

describe('parseArenaGenerativeIntent', () => {
  it('accepts a valid intent object', () => {
    const parsed = parseArenaGenerativeIntent(validIntent, {
      apiBindings: [{ key: 'list_orders', label: 'List', kind: 'workflow', workflowId: 'wf-1' }],
    })
    expect(parsed?.task).toContain('Browse orders')
    expect(parsed?.entities[0]?.kind).toBe('collection')
  })

  it('drops invented apiKeys', () => {
    const parsed = parseArenaGenerativeIntent(
      {
        ...validIntent,
        dataRequirements: [
          { apiKey: 'list_orders', usedFor: 'List' },
          { apiKey: 'invented', usedFor: 'Nope' },
        ],
        actions: [
          { id: 'load_orders', apiKey: 'list_orders', purpose: 'Fetch' },
          { id: 'ghost', apiKey: 'invented', purpose: 'Nope' },
        ],
      },
      {
        apiBindings: [{ key: 'list_orders', label: 'List', kind: 'workflow', workflowId: 'wf-1' }],
      }
    )
    expect(parsed?.dataRequirements.map((item) => item.apiKey)).toEqual(['list_orders'])
    expect(parsed?.actions.map((action) => action.apiKey)).toEqual(['list_orders'])
  })

  it('clears dataRequirements and actions when no bindings were declared', () => {
    const parsed = parseArenaGenerativeIntent(validIntent, { apiBindings: [] })
    expect(parsed?.dataRequirements).toEqual([])
    expect(parsed?.actions).toEqual([])
  })

  it('rejects a sitemap-shaped payload', () => {
    expect(
      parseArenaGenerativeIntent(
        { title: 'App', archetype: 'dashboard', pages: [] },
        { apiBindings: [] }
      )
    ).toBeNull()
  })
})

describe('analyzeArenaGenerativeIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns parsed intent from a JSON reply', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage(JSON.stringify(validIntent)))

    const analyzed = await analyzeArenaGenerativeIntent({
      userInput: 'Order inbox.',
      apiBindings: [{ key: 'list_orders', label: 'List', kind: 'workflow', workflowId: 'wf-1' }],
    })

    expect(analyzed.intent?.workflowComplexity).toBe('short')
    expect(mockCreateAnthropicMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        model: 'claude-haiku-4-5',
        system: expect.stringContaining('Do not pick an archetype'),
      })
    )
    const userMessage = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
    expect(userMessage).toContain('Do not emit an archetype')
    expect(userMessage).toContain('Order inbox.')
  })

  it('includes a visual brief when screenshots were interpreted', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage(JSON.stringify(validIntent)))
    await analyzeArenaGenerativeIntent({
      userInput: '',
      apiBindings: [],
      visualBrief: {
        screens: [
          {
            purpose: 'Inbox',
            visibleCopy: ['Orders'],
            fields: [],
            ctas: [],
            regions: [],
          },
        ],
        layout: {},
        catalogMapping: [],
        unrepresentable: [],
      },
    })
    const userMessage = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
    expect(userMessage).toContain('Visual brief from uploaded screenshot')
    expect(userMessage).toContain('Inbox')
  })

  it('fails open on empty or invalid JSON', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))
    const analyzed = await analyzeArenaGenerativeIntent({
      userInput: 'Team directory.',
      apiBindings: [],
    })
    expect(analyzed.intent).toBeNull()
    expect(analyzed.error).toContain('not a valid intent object')
  })

  it('fails open when the call throws', async () => {
    mockCreateAnthropicMessage.mockRejectedValue(new Error('haiku down'))
    const analyzed = await analyzeArenaGenerativeIntent({
      userInput: 'Team directory.',
      apiBindings: [],
    })
    expect(analyzed.intent).toBeNull()
    expect(analyzed.error).toContain('haiku down')
  })
})
