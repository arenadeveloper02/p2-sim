/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecuteWorkflow = vi.fn()
const mockPreprocessExecution = vi.fn()
const mockGetEffectiveDecryptedEnv = vi.fn()
const mockReleaseExecutionSlot = vi.fn()

vi.mock('@/lib/workflows/executor/execute-workflow', () => ({
  executeWorkflow: (...args: unknown[]) => mockExecuteWorkflow(...args),
}))

vi.mock('@/lib/execution/preprocessing', () => ({
  preprocessExecution: (...args: unknown[]) => mockPreprocessExecution(...args),
}))

vi.mock('@/lib/environment/utils', () => ({
  getEffectiveDecryptedEnv: (...args: unknown[]) => mockGetEffectiveDecryptedEnv(...args),
}))

vi.mock('@/lib/billing/calculations/usage-reservation', () => ({
  releaseExecutionSlot: (...args: unknown[]) => mockReleaseExecutionSlot(...args),
}))

vi.mock('@/lib/logs/execution/logging-session', () => ({
  LoggingSession: class {
    safeStart = vi.fn()
  },
}))

vi.mock('@sim/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => [
            {
              id: 'wf-bound',
              userId: 'user-1',
              workspaceId: 'ws-1',
              isDeployed: true,
              variables: {},
            },
          ],
        }),
      }),
    }),
  },
}))

import type { DeployedAppRecord } from '@/lib/arena-generative-ui/deployment'
import { runDeployedAppAction } from '@/lib/arena-generative-ui/run-action'

function baseDeployment(overrides?: Partial<DeployedAppRecord>): DeployedAppRecord {
  return {
    id: 'app-1',
    workspaceId: 'ws-1',
    workflowId: 'wf-host',
    userId: 'user-1',
    identifier: 'lead-score',
    title: 'Lead score',
    description: null,
    department: null,
    isActive: true,
    authType: 'public',
    password: null,
    allowedEmails: [],
    requireArenaEmailId: true,
    draftId: 'draft-1',
    revisionId: 'rev-1',
    manifest: {
      entryPath: 'home',
      pages: {
        home: { title: 'Home', path: 'home', spec: { root: 'page', elements: {} } },
        results: { title: 'Results', path: 'results', spec: { root: 'page', elements: {} } },
      },
      actions: {
        submit_lead: {
          apiKey: 'qualify_lead',
          inputMapping: { name: 'name' },
          onSuccess: { navigate: 'results' },
        },
      },
    },
    apiBindings: [
      {
        key: 'qualify_lead',
        label: 'Qualify',
        kind: 'workflow',
        workflowId: 'wf-bound',
      },
    ],
    httpAllowlist: ['api.example.com'],
    ...overrides,
  }
}

describe('runDeployedAppAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPreprocessExecution.mockResolvedValue({
      success: true,
      actorUserId: 'user-1',
      billingAttribution: {
        actorUserId: 'user-1',
        workspaceId: 'ws-1',
        billingEntity: { type: 'user', id: 'user-1' },
      },
      executionActor: { type: 'user' },
    })
    mockExecuteWorkflow.mockResolvedValue({
      success: true,
      output: { score: 91 },
    })
  })

  it('maps form values into executeWorkflow and returns onSuccess navigate', async () => {
    const result = await runDeployedAppAction({
      deployment: baseDeployment(),
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-1',
    })

    expect(result.ok).toBe(true)
    expect(result.navigate).toBe('results')
    expect(mockExecuteWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wf-bound' }),
      'req-1',
      { name: 'Ada' },
      'user-1',
      expect.objectContaining({ isSecureMode: true, workflowTriggerType: 'api' }),
      expect.any(String)
    )
  })

  it('proxies allowlisted HTTP and injects secret headers', async () => {
    mockGetEffectiveDecryptedEnv.mockResolvedValue({ api_token: 'secret-token' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ score: 12 })),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runDeployedAppAction({
      deployment: baseDeployment({
        apiBindings: [
          {
            key: 'qualify_lead',
            label: 'Qualify',
            kind: 'http',
            http: {
              method: 'POST',
              url: 'https://api.example.com/qualify',
              headersSecretName: 'api_token',
            },
          },
        ],
      }),
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-1',
    })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/qualify',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
      })
    )
    vi.unstubAllGlobals()
  })

  it('rejects HTTP hosts that are not allowlisted', async () => {
    const result = await runDeployedAppAction({
      deployment: baseDeployment({
        httpAllowlist: ['api.example.com'],
        apiBindings: [
          {
            key: 'qualify_lead',
            label: 'Qualify',
            kind: 'http',
            http: { method: 'POST', url: 'https://evil.example/x' },
          },
        ],
      }),
      actionId: 'submit_lead',
      values: {},
      requestId: 'req-1',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/allowlisted|not allowed/i)
  })
})
