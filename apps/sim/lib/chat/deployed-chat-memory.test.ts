/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dbChainMockFns } = vi.hoisted(() => ({
  dbChainMockFns: {
    select: vi.fn(),
  },
}))

vi.mock('@sim/db', () => ({
  db: {
    select: dbChainMockFns.select,
  },
  workflowExecutionLogs: {
    workflowId: 'workflow_id',
    isExternalChat: 'is_external_chat',
    status: 'status',
    level: 'level',
    initialInput: 'initial_input',
    finalChatOutput: 'final_chat_output',
    chatId: 'chat_id',
    conversationId: 'conversation_id',
    userId: 'user_id',
    executionId: 'execution_id',
    startedAt: 'started_at',
    deploymentVersionId: 'deployment_version_id',
  },
  workflowDeploymentVersion: {
    id: 'id',
    version: 'version',
    name: 'name',
    createdAt: 'created_at',
    workflowId: 'workflow_id',
    isActive: 'is_active',
  },
}))

import {
  buildMemorySummary,
  DEPLOYED_CHAT_MEMORY_MAX_TURNS,
  loadDeployedChatMemoryContext,
  type DeployedChatMemoryTurn,
} from '@/lib/chat/deployed-chat-memory'

function createSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    }),
  }
}

describe('deployed-chat-memory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty context when no thread id is provided', async () => {
    const context = await loadDeployedChatMemoryContext({
      workflowId: 'workflow-1',
      currentDeploymentVersion: {
        deploymentVersionId: 'dep-1',
        version: 2,
        versionName: 'Latest',
        versionCreatedAt: '2026-01-01T00:00:00.000Z',
      },
    })

    expect(context.turns).toEqual([])
    expect(context.summary).toBe('')
    expect(dbChainMockFns.select).not.toHaveBeenCalled()
  })

  it('loads completed turns in chronological order with deployment metadata', async () => {
    dbChainMockFns.select.mockReturnValueOnce(
      createSelectChain([
        {
          executionId: 'exec-2',
          startedAt: new Date('2026-01-02T00:00:00.000Z'),
          initialInput: 'Second question',
          finalChatOutput: 'Second answer',
          deploymentVersionId: 'dep-2',
          version: 2,
          versionName: 'v2 release',
          versionCreatedAt: new Date('2026-01-01T12:00:00.000Z'),
        },
        {
          executionId: 'exec-1',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          initialInput: 'First question',
          finalChatOutput: 'First answer',
          deploymentVersionId: 'dep-1',
          version: 1,
          versionName: null,
          versionCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ])
    )

    const context = await loadDeployedChatMemoryContext({
      workflowId: 'workflow-1',
      chatId: 'chat-thread-1',
      userId: 'user-1',
      excludeExecutionId: 'exec-current',
      currentDeploymentVersion: {
        deploymentVersionId: 'dep-2',
        version: 2,
        versionName: 'v2 release',
        versionCreatedAt: '2026-01-01T12:00:00.000Z',
      },
    })

    expect(context.turns).toHaveLength(2)
    expect(context.turns[0]?.executionId).toBe('exec-1')
    expect(context.turns[1]?.deploymentVersion.version).toBe(2)
    expect(context.versionChangedFromHistory).toBe(true)
    expect(context.summary).toContain('First question')
    expect(context.summary).toContain('Second answer')
  })

  it('flags version changes and enforces turn budget', async () => {
    const rows = Array.from({ length: DEPLOYED_CHAT_MEMORY_MAX_TURNS + 5 }, (_, index) => ({
      executionId: `exec-${index}`,
      startedAt: new Date(`2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`),
      initialInput: `Question ${index}`,
      finalChatOutput: `Answer ${index}`,
      deploymentVersionId: index < DEPLOYED_CHAT_MEMORY_MAX_TURNS ? 'dep-old' : 'dep-new',
      version: index < DEPLOYED_CHAT_MEMORY_MAX_TURNS ? 1 : 2,
      versionName: null,
      versionCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }))

    dbChainMockFns.select.mockReturnValueOnce(createSelectChain([...rows].reverse()))

    const context = await loadDeployedChatMemoryContext({
      workflowId: 'workflow-1',
      chatId: 'chat-thread-1',
      currentDeploymentVersion: {
        deploymentVersionId: 'dep-new',
        version: 2,
        versionName: null,
        versionCreatedAt: '2026-01-10T00:00:00.000Z',
      },
    })

    expect(context.turns.length).toBeLessThanOrEqual(DEPLOYED_CHAT_MEMORY_MAX_TURNS)
    expect(context.versionChangedFromHistory).toBe(true)
    expect(context.summary).toContain('Current turn runs deployment v2')
  })

  it('builds a formatted summary block for a single turn', () => {
    const turns: DeployedChatMemoryTurn[] = [
      {
        executionId: 'exec-1',
        startedAt: '2026-01-01T00:00:00.000Z',
        userInput: 'Hello',
        assistantOutput: 'Hi there',
        deploymentVersion: {
          deploymentVersionId: 'dep-1',
          version: 1,
          versionName: 'Initial',
          versionCreatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ]

    const summary = buildMemorySummary(
      turns,
      {
        deploymentVersionId: 'dep-1',
        version: 1,
        versionName: 'Initial',
        versionCreatedAt: '2026-01-01T00:00:00.000Z',
      },
      false
    )

    expect(summary).toContain('User: Hello')
    expect(summary).toContain('Assistant: Hi there')
    expect(summary).toContain('deployment v1 (Initial)')
  })
})
