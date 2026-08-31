import { searchSkillShareWorkspacesContract } from '@/lib/api/contracts/skill-share'
import {
  defineInternalJsonRoute,
  internalRateLimits,
  internalSessionAuth,
} from '@/lib/api/server/routes'
import { skillShareErrorPolicy } from '@/lib/skill-share/api/error-policy'
import { skillShareOperations } from '@/lib/skill-share/application/operations'
import { searchShareWorkspacesUseCase } from '@/lib/skill-share/application/use-cases'
import { presentShareWorkspace } from '@/lib/skill-share/present'

export const GET = defineInternalJsonRoute({
  contract: searchSkillShareWorkspacesContract,
  auth: internalSessionAuth,
  operation: skillShareOperations.searchWorkspaces,
  rateLimit: internalRateLimits.none({
    reason: 'Platform-admin catalog listing is not user-facing traffic',
  }),
  errorPolicy: skillShareErrorPolicy,
  mapInput: ({ query }) => ({ search: query.search }),
  useCase: searchShareWorkspacesUseCase,
  present: ({ workspaces }) => ({
    success: true as const,
    workspaces: workspaces.map(presentShareWorkspace),
  }),
})
