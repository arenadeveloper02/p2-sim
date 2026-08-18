/**
 * @vitest-environment node
 */
import { environmentUtilsMockFns, resetEnvironmentUtilsMock } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecuteWorkflow = vi.fn()
const mockPreprocessExecution = vi.fn()
const mockGetEffectiveEnvironmentSnapshot =
  environmentUtilsMockFns.mockGetEffectiveEnvironmentSnapshot
const mockReleaseExecutionSlot = vi.fn()

vi.mock('@/lib/workflows/executor/execute-workflow', () => ({
  executeWorkflow: (...args: unknown[]) => mockExecuteWorkflow(...args),
}))

vi.mock('@/lib/execution/preprocessing', () => ({
  preprocessExecution: (...args: unknown[]) => mockPreprocessExecution(...args),
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
import {
  createGenerativeAppActionSseResponse,
  HTTP_STREAM_TIMEOUT_MS,
  isStreamingAction,
  runDeployedAppAction,
  runGenerativeAppAction,
} from '@/lib/arena-generative-ui/run-action'
import { twoPageApiBindings, twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'
import { streamingNavigateFrom } from '@/lib/arena-generative-ui/types'
import { encodeSSE, readSSEEvents } from '@/lib/core/utils/sse'

function mockEnv(
  vars: Record<string, string>,
  options?: {
    workspace?: Record<string, string>
    decryptionFailures?: string[]
  }
) {
  mockGetEffectiveEnvironmentSnapshot.mockResolvedValue({
    personalEncrypted: Object.fromEntries(Object.keys(vars).map((key) => [key, 'enc'])),
    workspaceEncrypted: Object.fromEntries(
      Object.keys(options?.workspace ?? {}).map((key) => [key, 'enc'])
    ),
    personalDecrypted: vars,
    workspaceDecrypted: options?.workspace ?? {},
    personalOwners: {},
    conflicts: [],
    decryptionFailures: options?.decryptionFailures ?? [],
  })
}

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
    resetEnvironmentUtilsMock()
    mockEnv({})
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
      expect.objectContaining({
        isSecureMode: true,
        workflowTriggerType: 'api',
        executionMode: 'sync',
      }),
      expect.any(String)
    )
  })

  it('proxies allowlisted HTTP and injects secret headers', async () => {
    mockEnv({ api_token: 'secret-token' })
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

  it('puts nested output.content on setState.content for DataText', async () => {
    mockEnv({})
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        new TextEncoder().encode(JSON.stringify({ output: { content: 'Hi' } })),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runDeployedAppAction({
      deployment: baseDeployment({
        apiBindings: [
          {
            key: 'qualify_lead',
            label: 'Qualify',
            kind: 'http',
            http: { method: 'POST', url: 'https://api.example.com/qualify' },
          },
        ],
      }),
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-1',
    })

    expect(result.ok).toBe(true)
    expect(result.setState?.content).toBe('Hi')
    expect(result.setState).toMatchObject({ output: { content: 'Hi' } })
    vi.unstubAllGlobals()
  })

  it('sends the secret on X-API-Key when authHeaderName is set', async () => {
    mockEnv({ SIM_API_KEY: 'secret-token' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ ok: true })),
    })
    vi.stubGlobal('fetch', fetchMock)

    await runDeployedAppAction({
      deployment: baseDeployment({
        apiBindings: [
          {
            key: 'qualify_lead',
            label: 'Qualify',
            kind: 'http',
            http: {
              method: 'POST',
              url: 'https://api.example.com/qualify',
              headersSecretName: 'SIM_API_KEY',
              authHeaderName: 'X-API-Key',
            },
          },
        ],
      }),
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-1',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/qualify',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'secret-token' }),
      })
    )
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('defaults *_API_KEY secrets to X-API-Key when authHeaderName is missing', async () => {
    mockEnv({ SIM_API_KEY: 'secret-token' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ ok: true })),
    })
    vi.stubGlobal('fetch', fetchMock)

    await runDeployedAppAction({
      deployment: baseDeployment({
        apiBindings: [
          {
            key: 'qualify_lead',
            label: 'Qualify',
            kind: 'http',
            http: {
              method: 'POST',
              url: 'https://api.example.com/qualify',
              headersSecretName: 'SIM_API_KEY',
            },
          },
        ],
      }),
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-1',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/qualify',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'secret-token' }),
      })
    )
    vi.unstubAllGlobals()
  })

  it('looks up HTTP secrets as the actor, not the draft owner', async () => {
    mockEnv({ SIM_API_KEY: 'secret-token' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ ok: true })),
    })
    vi.stubGlobal('fetch', fetchMock)

    await runGenerativeAppAction({
      manifest: twoPageManifest,
      apiBindings: [
        {
          key: 'qualify_lead',
          label: 'Qualify',
          kind: 'http',
          http: {
            method: 'POST',
            url: 'https://api.example.com/qualify',
            headersSecretName: 'SIM_API_KEY',
            authHeaderName: 'X-API-Key',
          },
        },
      ],
      httpAllowlist: ['api.example.com'],
      userId: 'owner-1',
      workspaceId: 'ws-1',
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-actor-env',
      actorUserId: 'previewer-1',
    })

    expect(mockGetEffectiveEnvironmentSnapshot).toHaveBeenCalledWith('previewer-1', 'ws-1')
    expect(mockGetEffectiveEnvironmentSnapshot).not.toHaveBeenCalledWith('owner-1', 'ws-1')
    vi.unstubAllGlobals()
  })

  it('does not fetch when the named secret is missing', async () => {
    mockEnv({})
    const fetchMock = vi.fn()
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
              headersSecretName: 'W_ARTICAL_RECOMMENDATION_AGENT_KEY',
              authHeaderName: 'X-API-Key',
            },
          },
        ],
      }),
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-missing-secret',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe(
      'Secret "W_ARTICAL_RECOMMENDATION_AGENT_KEY" was not found in workspace or personal environment'
    )
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('strips $ and {{ }} from headersSecretName before env lookup', async () => {
    mockEnv({ W_FOO: 'secret-token' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ ok: true })),
    })
    vi.stubGlobal('fetch', fetchMock)

    await runDeployedAppAction({
      deployment: baseDeployment({
        apiBindings: [
          {
            key: 'qualify_lead',
            label: 'Qualify',
            kind: 'http',
            http: {
              method: 'POST',
              url: 'https://api.example.com/qualify',
              headersSecretName: '{{$W_FOO}}',
              authHeaderName: 'X-API-Key',
            },
          },
        ],
      }),
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-normalize-secret',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/qualify',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'secret-token' }),
      })
    )
    vi.unstubAllGlobals()
  })

  it('resolves LINKEDIN_API_KEY from a W_ workspace secret name', async () => {
    mockEnv({}, { workspace: { W_LINKEDIN_API_KEY: 'secret-token' } })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ ok: true })),
    })
    vi.stubGlobal('fetch', fetchMock)

    await runDeployedAppAction({
      deployment: baseDeployment({
        apiBindings: [
          {
            key: 'qualify_lead',
            label: 'Qualify',
            kind: 'http',
            http: {
              method: 'POST',
              url: 'https://api.example.com/qualify',
              headersSecretName: 'LINKEDIN_API_KEY',
              authHeaderName: 'X-API-Key',
            },
          },
        ],
      }),
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-w-prefix',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/qualify',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'secret-token' }),
      })
    )
    vi.unstubAllGlobals()
  })

  it('resolves a secret name case-insensitively', async () => {
    mockEnv({ linkedin_api_key: 'secret-token' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ ok: true })),
    })
    vi.stubGlobal('fetch', fetchMock)

    await runDeployedAppAction({
      deployment: baseDeployment({
        apiBindings: [
          {
            key: 'qualify_lead',
            label: 'Qualify',
            kind: 'http',
            http: {
              method: 'POST',
              url: 'https://api.example.com/qualify',
              headersSecretName: 'LINKEDIN_API_KEY',
              authHeaderName: 'X-API-Key',
            },
          },
        ],
      }),
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-case',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/qualify',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'secret-token' }),
      })
    )
    vi.unstubAllGlobals()
  })

  it('uses a non-empty personal secret when the workspace value is empty', async () => {
    mockEnv(
      { LINKEDIN_API_KEY: 'personal-token' },
      { workspace: { LINKEDIN_API_KEY: '' } }
    )
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ ok: true })),
    })
    vi.stubGlobal('fetch', fetchMock)

    await runDeployedAppAction({
      deployment: baseDeployment({
        apiBindings: [
          {
            key: 'qualify_lead',
            label: 'Qualify',
            kind: 'http',
            http: {
              method: 'POST',
              url: 'https://api.example.com/qualify',
              headersSecretName: 'LINKEDIN_API_KEY',
              authHeaderName: 'X-API-Key',
            },
          },
        ],
      }),
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-personal-fallback',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/qualify',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'personal-token' }),
      })
    )
    vi.unstubAllGlobals()
  })

  it('does not fetch when the named secret failed to decrypt', async () => {
    mockEnv(
      { LINKEDIN_API_KEY: '' },
      { decryptionFailures: ['LINKEDIN_API_KEY'] }
    )
    const fetchMock = vi.fn()
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
              headersSecretName: 'LINKEDIN_API_KEY',
              authHeaderName: 'X-API-Key',
            },
          },
        ],
      }),
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-decrypt-fail',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe(
      'Secret "LINKEDIN_API_KEY" exists but could not be decrypted. Re-save it in Settings → Secrets.'
    )
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('does not fetch when ENCRYPTION_KEY is not a 64-character hex string', async () => {
    mockGetEffectiveEnvironmentSnapshot.mockRejectedValue(
      new Error('ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes)')
    )
    const fetchMock = vi.fn()
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
              headersSecretName: 'LINKEDIN_API_KEY',
              authHeaderName: 'X-API-Key',
            },
          },
        ],
      }),
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-encryption-key',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe(
      'ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes)'
    )
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('lists accessible secret names when the named secret is missing', async () => {
    mockEnv({ OTHER_KEY: 'token' })
    const fetchMock = vi.fn()
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
              headersSecretName: 'LINKEDIN_API_KEY',
              authHeaderName: 'X-API-Key',
            },
          },
        ],
      }),
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-list-names',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe(
      'Secret "LINKEDIN_API_KEY" was not found in workspace or personal environment. Accessible secrets: OTHER_KEY'
    )
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('does not let empty onSuccess.setState wipe API content', async () => {
    mockEnv({})
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        new TextEncoder().encode(JSON.stringify({ output: { content: 'Kept' } })),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runGenerativeAppAction({
      manifest: {
        ...twoPageManifest,
        actions: {
          submit_lead: {
            apiKey: 'qualify_lead',
            onSuccess: { setState: { content: '' } },
          },
        },
      },
      apiBindings: [
        {
          key: 'qualify_lead',
          label: 'Qualify',
          kind: 'http',
          http: { method: 'POST', url: 'https://api.example.com/qualify' },
        },
      ],
      httpAllowlist: ['api.example.com'],
      userId: 'owner-1',
      workspaceId: 'ws-1',
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-keep-content',
      actorUserId: 'previewer-1',
    })

    expect(result.setState?.content).toBe('Kept')
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

  it('runs a two-page draft CTA and returns navigate plus score state', async () => {
    const result = await runGenerativeAppAction({
      manifest: twoPageManifest,
      apiBindings: twoPageApiBindings,
      httpAllowlist: [],
      userId: 'owner-1',
      workspaceId: 'ws-1',
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-preview',
      actorUserId: 'previewer-1',
    })

    expect(result.ok).toBe(true)
    expect(result.navigate).toBe('results')
    expect(result.setState).toMatchObject({ score: 91 })
    expect(result.setState?.content).toBeDefined()
    expect(mockExecuteWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wf-bound' }),
      'req-preview',
      { name: 'Ada' },
      'user-1',
      expect.objectContaining({ isSecureMode: true, executionMode: 'sync' }),
      expect.any(String)
    )
  })
})

function utf8Stream(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part))
      }
      controller.close()
    },
  })
}

async function mockStreamingWorkflow(chunks: string[], output: Record<string, unknown>) {
  mockExecuteWorkflow.mockImplementation(
    async (_workflow, _requestId, _input, _actor, streamConfig) => {
      const onStream = (
        streamConfig as {
          onStream?: (execution: { stream: ReadableStream<Uint8Array> }) => Promise<void>
        }
      ).onStream
      if (onStream) {
        await onStream({ stream: utf8Stream(chunks) })
      }
      return { success: true, output }
    }
  )
}

describe('streaming generative app actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetEnvironmentUtilsMock()
    mockEnv({})
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
  })

  it('streams workflow tokens then returns setState and navigate on completion', async () => {
    await mockStreamingWorkflow(['Hel', 'lo'], { content: 'Hello' })
    const chunks: string[] = []
    const result = await runGenerativeAppAction({
      manifest: twoPageManifest,
      apiBindings: [{ ...twoPageApiBindings[0], stream: true }],
      httpAllowlist: [],
      userId: 'owner-1',
      workspaceId: 'ws-1',
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-stream',
      actorUserId: 'previewer-1',
      onChunk: (content) => {
        chunks.push(content)
      },
    })

    expect(chunks).toEqual(['Hel', 'lo'])
    expect(result.ok).toBe(true)
    expect(result.navigate).toBe('results')
    expect(result.setState).toEqual({ content: 'Hello' })
    expect(mockExecuteWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wf-bound' }),
      'req-stream',
      { name: 'Ada' },
      'user-1',
      expect.objectContaining({ executionMode: 'stream' }),
      expect.any(String)
    )
  })

  it('forwards HTTP text/plain body chunks without buffering first', async () => {
    mockEnv({})
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (name: string) => (name === 'content-type' ? 'text/plain' : null) },
      body: utf8Stream(['tok', 'en']),
    })
    vi.stubGlobal('fetch', fetchMock)

    const chunks: string[] = []
    const result = await runGenerativeAppAction({
      manifest: twoPageManifest,
      apiBindings: [
        {
          key: 'qualify_lead',
          label: 'Qualify',
          kind: 'http',
          stream: true,
          http: { method: 'POST', url: 'https://api.example.com/qualify' },
        },
      ],
      httpAllowlist: ['api.example.com'],
      userId: 'owner-1',
      workspaceId: 'ws-1',
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-http-stream',
      actorUserId: 'previewer-1',
      onChunk: (content) => {
        chunks.push(content)
      },
    })

    expect(chunks).toEqual(['tok', 'en'])
    expect(result.ok).toBe(true)
    expect(result.navigate).toBe('results')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/qualify',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'text/event-stream, text/plain, application/json',
        }),
      })
    )
    vi.unstubAllGlobals()
  })

  it('forwards HTTP text/event-stream payloads as chunks', async () => {
    mockEnv({})
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encodeSSE({ content: 'A' }))
            controller.enqueue(encodeSSE({ text: 'B' }))
            controller.close()
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const chunks: string[] = []
    const result = await runGenerativeAppAction({
      manifest: twoPageManifest,
      apiBindings: [
        {
          key: 'qualify_lead',
          label: 'Qualify',
          kind: 'http',
          stream: true,
          http: { method: 'POST', url: 'https://api.example.com/qualify' },
        },
      ],
      httpAllowlist: ['api.example.com'],
      userId: 'owner-1',
      workspaceId: 'ws-1',
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-http-sse',
      actorUserId: 'previewer-1',
      onChunk: (content) => {
        chunks.push(content)
      },
    })

    expect(chunks).toEqual(['A', 'B'])
    expect(result.ok).toBe(true)
    expect(result.navigate).toBe('results')
    vi.unstubAllGlobals()
  })

  it('keeps JSON HTTP as a single done payload without chunk events', async () => {
    mockEnv({})
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (name: string) => (name === 'content-type' ? 'application/json' : null) },
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ score: 12 })),
    })
    vi.stubGlobal('fetch', fetchMock)

    const chunks: string[] = []
    const result = await runGenerativeAppAction({
      manifest: twoPageManifest,
      apiBindings: [
        {
          key: 'qualify_lead',
          label: 'Qualify',
          kind: 'http',
          stream: true,
          http: { method: 'POST', url: 'https://api.example.com/qualify' },
        },
      ],
      httpAllowlist: ['api.example.com'],
      userId: 'owner-1',
      workspaceId: 'ws-1',
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-http-json',
      actorUserId: 'previewer-1',
      onChunk: (content) => {
        chunks.push(content)
      },
    })

    expect(chunks).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.navigate).toBe('results')
    expect(result.setState).toMatchObject({ score: 12 })
    expect(result.setState?.content).toBeDefined()
    vi.unstubAllGlobals()
  })

  it('emits SSE chunk events then a done event with navigate', async () => {
    await mockStreamingWorkflow(['Hel', 'lo'], { content: 'Hello' })
    const response = createGenerativeAppActionSseResponse({
      manifest: twoPageManifest,
      apiBindings: [{ ...twoPageApiBindings[0], stream: true }],
      httpAllowlist: [],
      userId: 'owner-1',
      workspaceId: 'ws-1',
      actionId: 'submit_lead',
      values: { name: 'Ada' },
      requestId: 'req-sse',
      actorUserId: 'previewer-1',
    })

    const events: Array<{ type: string; content?: string; navigate?: string }> = []
    await readSSEEvents(response, {
      onEvent: (event: { type: string; content?: string; navigate?: string }) => {
        events.push(event)
      },
    })

    expect(events).toEqual([
      { type: 'chunk', content: 'Hel' },
      { type: 'chunk', content: 'lo' },
      expect.objectContaining({
        type: 'done',
        ok: true,
        navigate: 'results',
        setState: { content: 'Hello' },
      }),
    ])
  })

  it('identifies streaming action ids from bindings', () => {
    expect(isStreamingAction(twoPageManifest, twoPageApiBindings, 'submit_lead')).toBe(false)
    expect(
      isStreamingAction(
        twoPageManifest,
        [{ ...twoPageApiBindings[0], stream: true }],
        'submit_lead'
      )
    ).toBe(true)
  })

  it('maps streaming actions to onSuccess.navigate targets', () => {
    expect(streamingNavigateFrom(twoPageManifest, twoPageApiBindings)).toEqual({})
    expect(
      streamingNavigateFrom(twoPageManifest, [{ ...twoPageApiBindings[0], stream: true }])
    ).toEqual({ submit_lead: 'results' })
  })

  it('uses a 180s HTTP abort for streaming CTAs', () => {
    expect(HTTP_STREAM_TIMEOUT_MS).toBe(180_000)
  })
})
