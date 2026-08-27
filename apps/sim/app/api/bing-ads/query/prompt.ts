/**
 * System prompt for Bing Ads query generation
 *
 * The prompt is stored in the `bing_prompt` table (name = 'bing_ads_system_prompt').
 * At runtime, `getBingAdsSystemPrompt()` reads from the DB so the prompt can be
 * updated without redeploying. There is no in-code fallback — the DB row must
 * exist for query generation to work.
 */

import { db } from '@sim/db'
import { createLogger } from '@sim/logger'
import { sql } from 'drizzle-orm'
import { CURRENT_DATE } from './constants'

const logger = createLogger('BingAdsPrompt')

export const BING_ADS_PROMPT_NAME = 'bing_ads_system_prompt'

/**
 * Loads the active Bing Ads system prompt from the database.
 *
 * Looks up the row in `bing_prompt` keyed by name = 'bing_ads_system_prompt' and
 * returns its `content`. Throws if the DB row is missing or the query fails.
 * Any `${CURRENT_DATE}` tokens in the stored content are replaced with today's date.
 */
export async function getBingAdsSystemPrompt(): Promise<string> {
  const result = await db.execute(
    sql`SELECT content FROM bing_prompt WHERE name = ${BING_ADS_PROMPT_NAME} LIMIT 1`
  )

  const rows = result as unknown as Array<{ content: string }>
  const row = rows[0]
  if (!row?.content) {
    logger.error('Bing Ads prompt not found in DB', { name: BING_ADS_PROMPT_NAME })
    throw new Error(
      `Bing Ads system prompt not found in database (name='${BING_ADS_PROMPT_NAME}'). Please seed the bing_prompt table.`
    )
  }

  return row.content.replace(/\$\{CURRENT_DATE\}/g, CURRENT_DATE)
}
