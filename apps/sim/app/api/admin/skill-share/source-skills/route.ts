import { listSkillShareSourceSkillsContract } from '@/lib/api/contracts/skill-share'
import {
  defineInternalJsonRoute,
  internalRateLimits,
  internalSessionAuth,
} from '@/lib/api/server/routes'
import { skillShareErrorPolicy } from '@/lib/skill-share/api/error-policy'
import { skillShareOperations } from '@/lib/skill-share/application/operations'
import { listSourceSkillsUseCase } from '@/lib/skill-share/application/use-cases'

export const GET = defineInternalJsonRoute({
  contract: listSkillShareSourceSkillsContract,
  auth: internalSessionAuth,
  operation: skillShareOperations.listSourceSkills,
  rateLimit: internalRateLimits.none({
    reason: 'Platform-admin catalog listing is not user-facing traffic',
  }),
  errorPolicy: skillShareErrorPolicy,
  mapInput: ({ query }) => ({ workspaceId: query.workspaceId }),
  useCase: listSourceSkillsUseCase,
  present: ({ skills }) => ({ success: true as const, skills }),
})
