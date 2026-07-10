/**
 * @vitest-environment node
 */
import { envFlagsMock, workflowsUtilsMock } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateUserToolSchema, mockGetHighestPrioritySubscription, mockIsAdminWorkspace } =
  vi.hoisted(() => ({
    mockCreateUserToolSchema: vi.fn(() => ({ type: 'object', properties: {} })),
    mockGetHighestPrioritySubscription: vi.fn(),
    mockIsAdminWorkspace: vi.fn(() => false),
  }))

vi.mock('@/lib/billing/core/subscription', () => ({
  getHighestPrioritySubscription: mockGetHighestPrioritySubscription,
}))

vi.mock('@/lib/billing/plan-helpers', () => ({
  isPaid: vi.fn(
    (plan: string | null) => plan === 'pro' || plan === 'team' || plan === 'enterprise'
  ),
}))

vi.mock('@/lib/core/config/env-flags', () => envFlagsMock)

vi.mock('@/lib/mcp/utils', () => ({
  createMcpToolId: vi.fn(),
}))

vi.mock('@/lib/workflows/utils', () => workflowsUtilsMock)

vi.mock('@/tools/registry', () => ({
  tools: {
    gmail_send: {
      id: 'gmail_send',
      name: 'Gmail Send',
      description: 'Send emails using Gmail',
    },
    brandfetch_search: {
      id: 'brandfetch_search',
      name: 'Brandfetch Search',
      description: 'Search for brands by company name',
    },
    // Catalog marks run_workflow as client-routed / clientExecutable; registry ToolConfig has no routing fields.
    run_workflow: {
      id: 'run_workflow',
      name: 'Run Workflow',
      description: 'Run a workflow from the client',
    },
    zoom_list_meetings: {
      id: 'zoom_list_meetings',
      name: 'Zoom List Meetings',
      description: 'List Zoom meetings',
    },
    zoom_list_account_recordings: {
      id: 'zoom_list_account_recordings',
      name: 'Zoom List Account Recordings',
      description: 'List all account recordings',
    },
    google_sheets_write: {
      id: 'google_sheets_write',
      name: 'Google Sheets Write V1',
      description: 'Legacy write',
    },
    google_sheets_write_v2: {
      id: 'google_sheets_write_v2',
      name: 'Google Sheets Write V2',
      description: 'Latest write',
    },
  },
}))

vi.mock('@/tools/utils', () => ({
  getLatestVersionTools: vi.fn((input: Record<string, unknown>) => {
    const latest: Record<string, unknown> = {}
    const groups: Record<string, { toolId: string; version: number }[]> = {}

    for (const toolId of Object.keys(input)) {
      const baseName = toolId.replace(/_v\d+$/, '')
      const versionMatch = toolId.match(/_v(\d+)$/)
      const version = versionMatch ? Number.parseInt(versionMatch[1], 10) : 1
      if (!groups[baseName]) groups[baseName] = []
      groups[baseName].push({ toolId, version })
    }

    for (const versions of Object.values(groups)) {
      const winner = versions.reduce((prev, curr) => (curr.version > prev.version ? curr : prev))
      latest[winner.toolId] = input[winner.toolId]
    }

    return latest
  }),
  stripVersionSuffix: vi.fn((toolId: string) => toolId.replace(/_v\d+$/, '')),
}))

vi.mock('@/lib/copilot/block-visibility', () => ({
  getBlockVisibilityForCopilot: vi.fn(async () => ({
    revealed: new Set<string>(),
    disabled: new Set<string>(),
    previewTagged: new Set<string>(),
  })),
  visibilitySignature: vi.fn(() => 'vis:none'),
}))

vi.mock('@/lib/copilot/integration-tools', () => ({
  filterExposedIntegrationTools: vi.fn((tools: unknown[]) => tools),
  getExposedIntegrationTools: vi.fn(() => [
    {
      toolId: 'gmail_send',
      config: { id: 'gmail_send', name: 'Gmail Send', description: 'Send emails using Gmail' },
      service: 'gmail',
      operation: 'send',
    },
    {
      toolId: 'brandfetch_search',
      config: {
        id: 'brandfetch_search',
        name: 'Brandfetch Search',
        description: 'Search for brands by company name',
      },
      service: 'brandfetch',
      operation: 'search',
    },
    {
      toolId: 'run_workflow',
      config: {
        id: 'run_workflow',
        name: 'Run Workflow',
        description: 'Run a workflow from the client',
      },
      service: 'run',
      operation: 'workflow',
    },
  ]),
}))

vi.mock('@/tools/params', () => ({
  createUserToolSchema: mockCreateUserToolSchema,
}))

vi.mock('@/lib/workspaces/is-admin-workspace', () => ({
  isAdminWorkspace: mockIsAdminWorkspace,
  isAdminWorkspaceOnlyTool: (toolId: string) =>
    toolId === 'zoom_list_account_recordings' ||
    toolId === 'zoom_get_account_recordings_with_transcript',
}))

import {
  buildCopilotRequestPayload,
  buildIntegrationToolSchemas,
  clearIntegrationToolSchemaCacheForTests,
} from './payload'

describe('buildIntegrationToolSchemas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearIntegrationToolSchemaCacheForTests()
    mockCreateUserToolSchema.mockReturnValue({ type: 'object', properties: {} })
    mockIsAdminWorkspace.mockReturnValue(false)
  })

  it('appends the email footer prompt for free users', async () => {
    mockGetHighestPrioritySubscription.mockResolvedValue(null)

    const toolSchemas = await buildIntegrationToolSchemas('user-free')
    const gmailTool = toolSchemas.find((tool) => tool.name === 'gmail_send')

    expect(mockGetHighestPrioritySubscription).toHaveBeenCalledWith('user-free')
    expect(gmailTool?.description).toContain('sent with Arena ai')
  })

  it('does not append the email footer prompt for paid users', async () => {
    mockGetHighestPrioritySubscription.mockResolvedValue({ plan: 'pro', status: 'active' })

    const toolSchemas = await buildIntegrationToolSchemas('user-paid')
    const gmailTool = toolSchemas.find((tool) => tool.name === 'gmail_send')

    expect(mockGetHighestPrioritySubscription).toHaveBeenCalledWith('user-paid')
    expect(gmailTool?.description).toBe('Send emails using Gmail')
  })

  it('still builds integration tools when subscription lookup fails', async () => {
    mockGetHighestPrioritySubscription.mockRejectedValue(new Error('db unavailable'))

    const toolSchemas = await buildIntegrationToolSchemas('user-error')
    const gmailTool = toolSchemas.find((tool) => tool.name === 'gmail_send')
    const brandfetchTool = toolSchemas.find((tool) => tool.name === 'brandfetch_search')

    expect(mockGetHighestPrioritySubscription).toHaveBeenCalledWith('user-error')
    expect(gmailTool?.description).toBe('Send emails using Gmail')
    expect(brandfetchTool?.description).toBe('Search for brands by company name')
  })

  it('emits executeLocally for dynamic client tools only', async () => {
    mockGetHighestPrioritySubscription.mockResolvedValue({ plan: 'pro', status: 'active' })

    const toolSchemas = await buildIntegrationToolSchemas('user-client')
    const gmailTool = toolSchemas.find((tool) => tool.name === 'gmail_send')
    const runTool = toolSchemas.find((tool) => tool.name === 'run_workflow')

    expect(gmailTool?.executeLocally).toBe(false)
    expect(runTool?.executeLocally).toBe(true)
  })

  it('omits admin-only tools for non-admin workspaces', async () => {
    mockGetHighestPrioritySubscription.mockResolvedValue({ plan: 'pro', status: 'active' })
    mockIsAdminWorkspace.mockReturnValue(false)

    const toolSchemas = await buildIntegrationToolSchemas(
      'user-1',
      undefined,
      undefined,
      'ws-normal'
    )
    const names = toolSchemas.map((tool) => tool.name)

    expect(names).toContain('zoom_list_meetings')
    expect(names).not.toContain('zoom_list_account_recordings')
  })

  it('includes admin-only tools for admin workspaces', async () => {
    mockGetHighestPrioritySubscription.mockResolvedValue({ plan: 'pro', status: 'active' })
    mockIsAdminWorkspace.mockReturnValue(true)

    const toolSchemas = await buildIntegrationToolSchemas(
      'user-1',
      undefined,
      undefined,
      'ws-admin-1'
    )
    const names = toolSchemas.map((tool) => tool.name)

    expect(names).toContain('zoom_list_account_recordings')
  })

  it('uses copilot-facing file schemas for integration tools', async () => {
    mockGetHighestPrioritySubscription.mockResolvedValue({ plan: 'pro', status: 'active' })

    await buildIntegrationToolSchemas('user-copilot')

    expect(mockCreateUserToolSchema).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'gmail_send' }),
      { surface: 'copilot' }
    )
    expect(mockCreateUserToolSchema).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'brandfetch_search' }),
      { surface: 'copilot' }
    )
  })

  it('builds stripped integration tool names from the latest registry tool config', async () => {
    mockGetHighestPrioritySubscription.mockResolvedValue({ plan: 'pro', status: 'active' })

    const toolSchemas = await buildIntegrationToolSchemas('user-latest-schema')
    const sheetsTool = toolSchemas.find((tool) => tool.name === 'google_sheets_write')

    expect(sheetsTool).toBeDefined()
    expect(sheetsTool?.description).toBe('Latest write')
    expect(mockCreateUserToolSchema).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'google_sheets_write_v2' }),
      { surface: 'copilot' }
    )
  })

  it('briefly reuses built schemas for the same user and surface', async () => {
    mockGetHighestPrioritySubscription.mockResolvedValue({ plan: 'pro', status: 'active' })

    const first = await buildIntegrationToolSchemas('user-cache')
    first[0].input_schema.mutated = true
    const second = await buildIntegrationToolSchemas('user-cache')

    expect(mockGetHighestPrioritySubscription).toHaveBeenCalledTimes(1)
    expect(mockCreateUserToolSchema).toHaveBeenCalledTimes(5)
    expect(second[0].input_schema).not.toHaveProperty('mutated')
  })
})

describe('buildCopilotRequestPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes workspaceContext through to the Go request payload', async () => {
    const payload = await buildCopilotRequestPayload(
      {
        message: 'debug workspace',
        userId: 'user-1',
        userMessageId: 'msg-1',
        mode: 'agent',
        model: 'claude-opus-4-8',
        workspaceId: 'ws-1',
        workspaceContext: 'workspace inventory',
      },
      { selectedModel: 'claude-opus-4-8' }
    )

    expect(payload).toEqual(
      expect.objectContaining({
        workspaceId: 'ws-1',
        workspaceContext: 'workspace inventory',
      })
    )
  })

  it('passes user metadata through to the Go request payload', async () => {
    const payload = await buildCopilotRequestPayload(
      {
        message: 'what time is it',
        userId: 'user-1',
        userMessageId: 'msg-1',
        mode: 'agent',
        model: 'claude-opus-4-8',
        workspaceId: 'ws-1',
        userTimezone: 'America/Los_Angeles',
        userMetadata: {
          name: 'Sid',
          timezone: 'America/Los_Angeles',
        },
      },
      { selectedModel: 'claude-opus-4-8' }
    )

    expect(payload).toEqual(
      expect.objectContaining({
        userTimezone: 'America/Los_Angeles',
        userMetadata: {
          name: 'Sid',
          timezone: 'America/Los_Angeles',
        },
      })
    )
  })
})
