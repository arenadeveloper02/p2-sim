/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { reloadLocalCopilotWorkflowContext } = vi.hoisted(() => ({
  reloadLocalCopilotWorkflowContext: vi.fn(),
}))

const { loadWorkflowRevision } = vi.hoisted(() => ({
  loadWorkflowRevision: vi.fn(),
}))

vi.mock('@/local-copilot/lib/context/reload-workflow-context', () => ({
  reloadLocalCopilotWorkflowContext,
}))

vi.mock('@/local-copilot/lib/writes/workflow-access', () => ({
  loadWorkflowRevision,
}))

vi.mock('@/local-copilot/lib/tools/mothership-delegated-tools', () => ({
  resolveWorkflowIdForDelegatedTool: (
    _args: Record<string, unknown>,
    ctx: { workflowId?: string }
  ) => ctx.workflowId,
}))

import type { ToolExecutionContext } from '@/local-copilot/lib/tools/executor'
import { resolveWorkflowStateForLocalTool } from '@/local-copilot/lib/tools/resolve-workflow-state'
import {
  resolveSpecialistTimeoutMs,
  SPECIALIST_TIMEOUT_MS,
  SPECIALIST_WORKFLOW_TIMEOUT_MS,
} from '@/local-copilot/lib/agent/specialists/budget'

function baseCtx(): ToolExecutionContext {
  return {
    userId: 'user-1',
    workspaceId: 'ws-1',
    workflowId: 'wf-1',
    workflowRevision: '2026-01-01T00:00:00.000Z',
    structuredContext: {
      workspace: { id: 'ws-1', name: 'WS' },
      connectedIntegrations: [],
      envVariables: [],
      hostedKeysAvailable: false,
      knowledgeBases: [],
      tables: [],
      workspaceFiles: [],
      availableBlocks: [],
      workflow: {
        id: 'wf-1',
        name: 'Demo',
        blocks: {},
        edges: [],
        loops: {},
        parallels: {},
        variables: {},
        credentials: [],
      },
    },
  } as ToolExecutionContext
}

describe('resolveWorkflowStateForLocalTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the turn cache without reload by default', async () => {
    const ctx = baseCtx()
    const result = await resolveWorkflowStateForLocalTool(ctx, {})
    expect(result.ok).toBe(true)
    expect(reloadLocalCopilotWorkflowContext).not.toHaveBeenCalled()
  })

  it('forceReload refreshes graph and workflowRevision', async () => {
    const ctx = baseCtx()
    reloadLocalCopilotWorkflowContext.mockResolvedValue({
      ...ctx.structuredContext,
      workflow: {
        ...ctx.structuredContext.workflow!,
        name: 'Demo Reloaded',
      },
    })
    loadWorkflowRevision.mockResolvedValue({
      revision: '2026-09-30T12:00:00.000Z',
      workspaceId: 'ws-1',
    })

    const result = await resolveWorkflowStateForLocalTool(ctx, {}, { forceReload: true })

    expect(result.ok).toBe(true)
    expect(reloadLocalCopilotWorkflowContext).toHaveBeenCalled()
    expect(ctx.workflowRevision).toBe('2026-09-30T12:00:00.000Z')
    if (result.ok) {
      expect(result.workflow.name).toBe('Demo Reloaded')
    }
  })
})

describe('resolveSpecialistTimeoutMs', () => {
  it('gives workflow specialist at least 4 minutes', () => {
    expect(resolveSpecialistTimeoutMs('workflow', SPECIALIST_TIMEOUT_MS)).toBe(
      SPECIALIST_WORKFLOW_TIMEOUT_MS
    )
  })

  it('keeps the default for research', () => {
    expect(resolveSpecialistTimeoutMs('research', SPECIALIST_TIMEOUT_MS)).toBe(
      SPECIALIST_TIMEOUT_MS
    )
  })
})
