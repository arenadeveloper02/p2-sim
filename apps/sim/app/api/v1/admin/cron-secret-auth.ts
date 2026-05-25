import { createLogger } from '@sim/logger'
import { safeCompare } from '@sim/security/compare'
import { env } from '@/lib/core/config/env'
import { errorResponse } from '@/app/api/v1/admin/responses'

const logger = createLogger('AdminCronSecretAuth')

/**
 * Authenticates admin automation routes that use CRON_SECRET via x-admin-key.
 */
export function authenticateCronSecretRequest(request: Request) {
  if (!env.CRON_SECRET) {
    logger.warn('CRON_SECRET environment variable is not set for admin cron-secret endpoint')
    return errorResponse('NOT_CONFIGURED', 'Admin cron-secret API is not configured.', 503)
  }

  const providedKey = request.headers.get('x-admin-key')
  if (!providedKey) {
    return errorResponse('UNAUTHORIZED', 'API key required. Provide x-admin-key header.', 401)
  }

  if (!safeCompare(providedKey, env.CRON_SECRET)) {
    logger.warn('Invalid admin cron-secret API key attempted', {
      keyPrefix: providedKey.slice(0, 8),
    })
    return errorResponse('UNAUTHORIZED', 'Invalid API key', 401)
  }

  return null
}
