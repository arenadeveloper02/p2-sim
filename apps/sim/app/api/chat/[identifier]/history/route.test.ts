/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  deployedChatHistoryLogSchema,
  deployedChatHistoryResponseSchema,
} from '@/lib/api/contracts/chats'
import { toHistoryDeploymentVersionMeta } from '@/lib/chat/deployed-chat-memory'

describe('deployed chat history contract', () => {
  it('includes deployment version metadata on each history log', () => {
    const deploymentVersion = toHistoryDeploymentVersionMeta({
      deploymentVersionId: 'dep-1',
      version: 3,
      versionName: 'Support v3',
      versionCreatedAt: new Date('2025-12-01T00:00:00.000Z'),
    })

    const parsedLog = deployedChatHistoryLogSchema.parse({
      id: 'log-1',
      executionId: 'exec-1',
      level: 'info',
      trigger: 'chat',
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:00:05.000Z',
      totalDurationMs: 5000,
      conversationId: 'conv-1',
      userInput: 'Hello',
      attachments: [],
      modelOutput: 'Hi there',
      generatedImages: [],
      knowledgeRefs: null,
      liked: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      deploymentVersion,
    })

    expect(parsedLog.deploymentVersion).toEqual({
      deploymentVersionId: 'dep-1',
      version: 3,
      versionName: 'Support v3',
      versionCreatedAt: '2025-12-01T00:00:00.000Z',
    })
  })

  it('accepts paginated deployed chat history responses', () => {
    const parsed = deployedChatHistoryResponseSchema.parse({
      logs: [],
      pagination: {
        limit: 50,
        offset: 0,
        total: 0,
        hasMore: false,
      },
    })

    expect(parsed.pagination.hasMore).toBe(false)
  })
})
