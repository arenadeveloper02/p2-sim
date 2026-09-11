import {
  createSkillServiceContract,
  listSkillServicesContract,
} from '@/lib/api/contracts/skill-share'
import {
  defineInternalJsonRoute,
  internalRateLimits,
  internalSessionAuth,
} from '@/lib/api/server/routes'
import { skillShareErrorPolicy } from '@/lib/skill-share/api/error-policy'
import { skillShareOperations } from '@/lib/skill-share/application/operations'
import {
  createSkillServiceUseCase,
  listSkillServicesUseCase,
} from '@/lib/skill-share/application/use-cases'
import { presentSkillService } from '@/lib/skill-share/present'

export const GET = defineInternalJsonRoute({
  contract: listSkillServicesContract,
  auth: internalSessionAuth,
  operation: skillShareOperations.listServices,
  rateLimit: internalRateLimits.none({
    reason: 'Platform-admin catalog listing is not user-facing traffic',
  }),
  errorPolicy: skillShareErrorPolicy,
  mapInput: () => ({}),
  useCase: listSkillServicesUseCase,
  present: ({ services }) => ({
    success: true as const,
    services: services.map(presentSkillService),
  }),
})

export const POST = defineInternalJsonRoute({
  contract: createSkillServiceContract,
  auth: internalSessionAuth,
  operation: skillShareOperations.createService,
  rateLimit: internalRateLimits.none({
    reason: 'Platform-admin catalog writes are operator-gated',
  }),
  errorPolicy: skillShareErrorPolicy,
  mapInput: ({ body }) => ({ name: body.name }),
  useCase: createSkillServiceUseCase,
  present: ({ service }) => ({
    success: true as const,
    service: presentSkillService(service),
  }),
})
