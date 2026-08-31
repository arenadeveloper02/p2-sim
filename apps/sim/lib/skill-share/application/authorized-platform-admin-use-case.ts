import type { Principal, SessionPrincipal } from '@sim/auth/principal'
import type { ApplicationOperation, OperationUseCase } from '@/lib/core/application'
import type { OrchestrationRequestContext } from '@/lib/core/orchestration/types'
import { OrchestrationError } from '@/lib/core/orchestration/types'
import { isPlatformAdmin } from '@/lib/permissions/super-user'

function requireSessionPrincipal(principal: Principal): SessionPrincipal {
  if (principal.kind !== 'session') {
    throw new OrchestrationError('forbidden', 'This operation requires a signed-in session')
  }
  return principal
}

export function defineAuthorizedPlatformAdminUseCase<
  O extends ApplicationOperation,
  I,
  R,
>(definition: {
  operation: O
  execute(args: {
    principal: SessionPrincipal
    input: I
    request?: OrchestrationRequestContext
  }): Promise<R>
}): OperationUseCase<O, I, R> {
  return {
    operation: definition.operation,
    async execute({ principal, input, request }) {
      const session = requireSessionPrincipal(principal)
      const isAdmin = await isPlatformAdmin(session.userId)
      if (!isAdmin) {
        throw new OrchestrationError('forbidden', 'Platform admin access required')
      }
      return definition.execute({ principal: session, input, request })
    },
  }
}
