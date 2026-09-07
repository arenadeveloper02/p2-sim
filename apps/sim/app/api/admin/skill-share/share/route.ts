import { shareSkillShareContract } from '@/lib/api/contracts/skill-share'
import {
  defineInternalJsonRoute,
  internalRateLimits,
  internalSessionAuth,
} from '@/lib/api/server/routes'
import { skillShareErrorPolicy } from '@/lib/skill-share/api/error-policy'
import { skillShareOperations } from '@/lib/skill-share/application/operations'
import { shareCatalogUseCase } from '@/lib/skill-share/application/use-cases'

export const POST = defineInternalJsonRoute({
  contract: shareSkillShareContract,
  auth: internalSessionAuth,
  operation: skillShareOperations.share,
  rateLimit: internalRateLimits.none({
    reason: 'Platform-admin catalog writes are operator-gated',
  }),
  errorPolicy: skillShareErrorPolicy,
  mapInput: ({ body }) => ({
    catalogId: body.catalogId,
    workspaceIds: body.workspaceIds,
    overwriteEdited: body.overwriteEdited ?? false,
  }),
  useCase: shareCatalogUseCase,
  present: ({ results }) => ({ success: true as const, results }),
})
