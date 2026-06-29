/**
 * System prompt for GAQL generation
 *
 * The prompt is stored in the `prompts` table (name = 'gaql_system_prompt').
 * At runtime, `getGaqlSystemPrompt()` reads from the DB so the prompt can be
 * updated without redeploying. The DB row must exist for query generation to work.
 */

import { db } from '@sim/db'
import { createLogger } from '@sim/logger'
import { sql } from 'drizzle-orm'
import { CURRENT_DATE } from './constants'

const logger = createLogger('GoogleAdsV1Prompt')

export const GAQL_PROMPT_NAME = 'gaql_system_prompt'

/**
 * Loads the active GAQL system prompt from the database.
 *
 * Looks up the row in `prompts` keyed by name = 'gaql_system_prompt' and
 * returns its `content`. Throws if the DB row is missing or the query fails.
 * Any `${CURRENT_DATE}` tokens in the stored content are replaced with today's date.
 */
export async function getGaqlSystemPrompt(): Promise<string> {
  // Raw SQL via Drizzle's sql template tag
  // (prompts table exists in DB but not in schema.ts on this branch)
  const result = await db.execute(
    sql`SELECT content FROM prompts WHERE name = ${GAQL_PROMPT_NAME} LIMIT 1`
  )

  const rows = result as unknown as Array<{ content: string }>
  const row = rows[0]
  if (!row?.content) {
    logger.error('GAQL prompt not found in DB', { name: GAQL_PROMPT_NAME })
    throw new Error(
      `GAQL system prompt not found in database (name='${GAQL_PROMPT_NAME}'). Please seed the prompts table.`
    )
  }

  return row.content.replace(/\$\{CURRENT_DATE\}/g, CURRENT_DATE)
}
