import {
  deleteSkillServiceContract,
  updateSkillServiceContract,
} from '@/lib/api/contracts/skill-share'
import {
  defineInternalJsonRoute,
  internalRateLimits,
  internalSessionAuth,
} from '@/lib/api/server/routes'
import { skillShareErrorPolicy } from '@/lib/skill-share/api/error-policy'
import { skillShareOperations } from '@/lib/skill-share/application/operations'
import {
  deleteSkillServiceUseCase,
  updateSkillServiceUseCase,
} from '@/lib/skill-share/application/use-cases'
import { presentSkillService } from '@/lib/skill-share/present'

export const PATCH = defineInternalJsonRoute({
  contract: updateSkillServiceContract,
  auth: internalSessionAuth,
  operation: skillShareOperations.updateService,
  rateLimit: internalRateLimits.none({
    reason: 'Platform-admin catalog writes are operator-gated',
  }),
  errorPolicy: skillShareErrorPolicy,
  mapInput: ({ params, body }) => ({ serviceId: params.id, name: body.name }),
  useCase: updateSkillServiceUseCase,
  present: ({ service }) => ({
    success: true as const,
    service: presentSkillService(service),
  }),
})

export const DELETE = defineInternalJsonRoute({
  contract: deleteSkillServiceContract,
  auth: internalSessionAuth,
  operation: skillShareOperations.deleteService,
  rateLimit: internalRateLimits.none({
    reason: 'Platform-admin catalog writes are operator-gated',
  }),
  errorPolicy: skillShareErrorPolicy,
  mapInput: ({ params }) => ({ serviceId: params.id }),
  useCase: deleteSkillServiceUseCase,
  present: ({ success }) => ({ success }),
})
