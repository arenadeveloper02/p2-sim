import { unpublishSkillShareContract } from '@/lib/api/contracts/skill-share'
import {
  defineInternalJsonRoute,
  internalRateLimits,
  internalSessionAuth,
} from '@/lib/api/server/routes'
import { skillShareErrorPolicy } from '@/lib/skill-share/api/error-policy'
import { skillShareOperations } from '@/lib/skill-share/application/operations'
import { unpublishCatalogUseCase } from '@/lib/skill-share/application/use-cases'

export const DELETE = defineInternalJsonRoute({
  contract: unpublishSkillShareContract,
  auth: internalSessionAuth,
  operation: skillShareOperations.unpublishCatalog,
  rateLimit: internalRateLimits.none({
    reason: 'Platform-admin catalog writes are operator-gated',
  }),
  errorPolicy: skillShareErrorPolicy,
  mapInput: ({ params }) => ({ catalogId: params.id }),
  useCase: unpublishCatalogUseCase,
  present: ({ success }) => ({ success }),
})
