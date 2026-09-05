import { isArenaBilling } from '@/lib/billing/arena/env'
import { env, isTruthy } from '@/lib/core/config/env'

/**
 * Whether daily refresh credits reduce counted usage.
 *
 * Arena billing disables refresh by default. Set `ARENA_DAILY_REFRESH_ENABLED=true`
 * to opt back in. When Arena billing is off, upstream daily refresh stays enabled.
 */
export function isDailyRefreshEnabled(): boolean {
  if (env.ARENA_DAILY_REFRESH_ENABLED !== undefined) {
    return isTruthy(env.ARENA_DAILY_REFRESH_ENABLED)
  }
  return !isArenaBilling()
}
