import { resolvePrincipalSubject } from '@sim/auth/principal'
import type { InternalToolOperationContext } from '@/lib/internal/tool-operations/types'

/**
 * Knowledge tools on version-6-main delegated as the execution user, including
 * deployed chat, which runs under a system principal with no Sim subject.
 * That token also carried no deployment-version claim, so a chat log opened
 * before the snapshot version is known still binds.
 *
 * A principal that already is a Sim user keeps its origin, deployment claim
 * included. Actorless runs with an execution user are rewritten to that user
 * and nothing else.
 */
export function knowledgeExecutorContext(
  context: InternalToolOperationContext
): InternalToolOperationContext {
  const origin = context.executorDelegationOrigin
  if (!origin) return context
  const principalSubject = origin.principal ? resolvePrincipalSubject(origin.principal) : null
  if (principalSubject?.kind === 'sim_user' || origin.subjectUserId || !context.userId) {
    return context
  }
  return {
    ...context,
    executorDelegationOrigin: {
      subjectUserId: context.userId,
      workflowId: origin.workflowId,
      ...(origin.executionId ? { executionId: origin.executionId } : {}),
    },
  }
}
