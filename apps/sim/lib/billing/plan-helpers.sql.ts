import type { AnyColumn } from 'drizzle-orm'
import { eq, like, or, type SQL } from 'drizzle-orm'

/**
 * SQL-level plan filters for Drizzle queries.
 * These are the SQL equivalents of the JS helpers in `plan-helpers.ts`.
 *
 * The `_` in the plan-name separator is escaped because it is a single-character
 * wildcard in SQL `LIKE`. Unescaped, `'pro_%'` would also match `proX…`, making
 * these filters admit a wider set than their JS counterparts.
 */
export function sqlIsPro(column: AnyColumn): SQL | undefined {
  return or(eq(column, 'pro'), like(column, 'pro\\_%'))
}

export function sqlIsTeam(column: AnyColumn): SQL | undefined {
  return or(eq(column, 'team'), like(column, 'team\\_%'))
}

export function sqlIsPaid(column: AnyColumn): SQL | undefined {
  return or(sqlIsPro(column)!, sqlIsTeam(column)!, eq(column, 'enterprise'))
}
