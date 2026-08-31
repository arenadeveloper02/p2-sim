import {
  listSkillShareCatalogContract,
  publishSkillShareContract,
} from '@/lib/api/contracts/skill-share'
import {
  defineInternalJsonRoute,
  internalRateLimits,
  internalSessionAuth,
} from '@/lib/api/server/routes'
import { skillShareErrorPolicy } from '@/lib/skill-share/api/error-policy'
import { skillShareOperations } from '@/lib/skill-share/application/operations'
import {
  listShareCatalogUseCase,
  publishSkillToCatalogUseCase,
} from '@/lib/skill-share/application/use-cases'
import { presentCatalogEntry } from '@/lib/skill-share/present'

export const GET = defineInternalJsonRoute({
  contract: listSkillShareCatalogContract,
  auth: internalSessionAuth,
  operation: skillShareOperations.listCatalog,
  rateLimit: internalRateLimits.none({
    reason: 'Platform-admin catalog listing is not user-facing traffic',
  }),
  errorPolicy: skillShareErrorPolicy,
  mapInput: () => ({}),
  useCase: listShareCatalogUseCase,
  present: ({ catalog }) => ({
    success: true as const,
    catalog: catalog.map(presentCatalogEntry),
  }),
})

export const POST = defineInternalJsonRoute({
  contract: publishSkillShareContract,
  auth: internalSessionAuth,
  operation: skillShareOperations.publishCatalog,
  rateLimit: internalRateLimits.none({
    reason: 'Platform-admin catalog writes are operator-gated',
  }),
  errorPolicy: skillShareErrorPolicy,
  mapInput: ({ body }) => ({
    originSkillId: body.originSkillId,
    type: body.type,
    serviceIds: body.serviceIds,
  }),
  useCase: publishSkillToCatalogUseCase,
  present: ({ entry }) => ({
    success: true as const,
    entry: presentCatalogEntry(entry),
  }),
})
