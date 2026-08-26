import { disconnectOAuthContract } from '@/lib/api/contracts/oauth-connections'
import {
  defineInternalJsonRoute,
  extendInternalErrorPolicy,
  internalErrorResponse,
  internalRateLimits,
  internalSessionAuth,
} from '@/lib/api/server/routes'
import {
  credentialValidationParseOptions,
  internalCredentialErrorPolicy,
} from '@/lib/credentials/api/route-policies'
import { disconnectOAuthUseCase } from '@/lib/credentials/application/oauth-accounts'
import { credentialUserOperations } from '@/lib/credentials/application/operations'
import { UnipileDeleteAccountError } from '@/lib/unipile/delete-account'

export const dynamic = 'force-dynamic'

const oauthDisconnectErrorPolicy = extendInternalErrorPolicy(
  internalCredentialErrorPolicy,
  (error) =>
    error instanceof UnipileDeleteAccountError
      ? internalErrorResponse(502, { error: error.message })
      : null
)

export const POST = defineInternalJsonRoute({
  contract: disconnectOAuthContract,
  auth: internalSessionAuth,
  operation: credentialUserOperations.disconnectOAuth,
  rateLimit: internalRateLimits.none({ reason: 'Preserve existing internal behavior' }),
  errorPolicy: oauthDisconnectErrorPolicy,
  parseOptions: credentialValidationParseOptions,
  mapInput: ({ body }) => body,
  useCase: disconnectOAuthUseCase,
  present: () => ({ success: true as const }),
})
