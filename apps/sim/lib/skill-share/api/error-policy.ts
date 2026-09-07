import {
  extendInternalErrorPolicy,
  internalOrchestrationErrorPolicy,
} from '@/lib/api/server/routes'

export const skillShareErrorPolicy = extendInternalErrorPolicy(
  internalOrchestrationErrorPolicy,
  () => null
)
