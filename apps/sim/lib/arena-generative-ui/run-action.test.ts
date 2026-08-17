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
import {
  createGenerativeAppActionSseResponse,
  HTTP_STREAM_TIMEOUT_MS,
  isStreamingAction,
  runDeployedAppAction,
  runGenerativeAppAction,
} from '@/lib/arena-generative-ui/run-action'
import { twoPageApiBindings, twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'
import { encodeSSE, readSSEEvents } from '@/lib/core/utils/sse'

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
      expect.objectContaining({
        isSecureMode: true,
        workflowTriggerType: 'api',
        executionMode: 'sync',
      }),
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
    expect(result.setState).toEqual({ score: 91 })
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
    mockGetEffectiveDecryptedEnv.mockResolvedValue({})
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
    mockGetEffectiveDecryptedEnv.mockResolvedValue({})
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
    mockGetEffectiveDecryptedEnv.mockResolvedValue({})
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
    expect(result.setState).toEqual({ score: 12 })
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

  it('uses a 180s HTTP abort for streaming CTAs', () => {
    expect(HTTP_STREAM_TIMEOUT_MS).toBe(180_000)
  })
})
