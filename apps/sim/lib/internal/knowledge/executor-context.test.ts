/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { knowledgeExecutorContext } from '@/lib/internal/knowledge/executor-context'
import type { InternalToolOperationContext } from '@/lib/internal/tool-operations/types'

const chatContext: InternalToolOperationContext = {
  workflowId: 'workflow-1',
  workspaceId: 'workspace-1',
  userId: 'owner-1',
  executionId: 'exec-1',
  executorDelegationOrigin: {
    workflowId: 'workflow-1',
    executionId: 'exec-1',
    principal: {
      kind: 'system',
      serviceId: 'chat',
      workspaceId: 'workspace-1',
      workflowId: 'workflow-1',
    },
    currentWorkflow: {
      workflowId: 'workflow-1',
      mode: 'deployment',
      deploymentVersionId: 'version-1',
    },
  },
}

describe('knowledgeExecutorContext', () => {
  it('binds deployed chat as the execution user without a deployment claim', () => {
    expect(knowledgeExecutorContext(chatContext).executorDelegationOrigin).toEqual({
      subjectUserId: 'owner-1',
      workflowId: 'workflow-1',
      executionId: 'exec-1',
    })
  })

  it('keeps a Sim-user origin, including its deployment claim', () => {
    const context: InternalToolOperationContext = {
      ...chatContext,
      executorDelegationOrigin: {
        subjectUserId: 'member-1',
        workflowId: 'workflow-1',
        executionId: 'exec-1',
        principal: {
          kind: 'session',
          userId: 'member-1',
          sessionId: 'session-1',
        },
        currentWorkflow: {
          workflowId: 'workflow-1',
          mode: 'draft',
        },
      },
    }

    expect(knowledgeExecutorContext(context).executorDelegationOrigin).toBe(
      context.executorDelegationOrigin
    )
  })

  it('leaves an actorless run with no execution user unchanged', () => {
    const context: InternalToolOperationContext = {
      ...chatContext,
      userId: undefined,
    }

    expect(knowledgeExecutorContext(context)).toBe(context)
  })
})
