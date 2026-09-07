import { getSkillSharePresenceContract } from '@/lib/api/contracts/skill-share'
import {
  defineInternalJsonRoute,
  internalRateLimits,
  internalSessionAuth,
} from '@/lib/api/server/routes'
import { skillShareErrorPolicy } from '@/lib/skill-share/api/error-policy'
import { skillShareOperations } from '@/lib/skill-share/application/operations'
import { getCatalogPresenceUseCase } from '@/lib/skill-share/application/use-cases'

export const GET = defineInternalJsonRoute({
  contract: getSkillSharePresenceContract,
  auth: internalSessionAuth,
  operation: skillShareOperations.getPresence,
  rateLimit: internalRateLimits.none({
    reason: 'Platform-admin catalog listing is not user-facing traffic',
  }),
  errorPolicy: skillShareErrorPolicy,
  mapInput: ({ params, query }) => ({
    catalogId: params.id,
    workspaceIds: query.workspaceIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
      .slice(0, 200),
  }),
  useCase: getCatalogPresenceUseCase,
  present: (result) => ({
    success: true as const,
    originWorkspaceId: result.originWorkspaceId,
    rows: result.rows,
  }),
})
