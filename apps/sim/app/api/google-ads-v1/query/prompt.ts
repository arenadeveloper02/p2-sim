/**
 * System prompt for GAQL generation
 *
 * The prompt is stored in the `prompts` table (name = 'gaql_system_prompt').
 * At runtime, `getGaqlSystemPrompt()` reads from the DB so the prompt can be
 * updated without redeploying. A small in-code addendum is appended for
 * resources that are missing from the DB prompt. The DB row must still exist
 * for query generation to work.
 */

import { db } from '@sim/db'
import { createLogger } from '@sim/logger'
import { sql } from 'drizzle-orm'
import { CURRENT_DATE } from './constants'

const logger = createLogger('GoogleAdsV1Prompt')

export const GAQL_PROMPT_NAME = 'gaql_system_prompt'

/**
 * Addendum for change-history queries.
 *
 * The DB prompt does not currently cover change_event. Keep this here so the
 * Google Ads V1 endpoint can generate valid change-history GAQL without
 * requiring a local/prod prompt-table update.
 */
const CHANGE_EVENT_ADDENDUM = `

## CHANGE HISTORY (change_event)

Use the change_event resource for "change history", "who changed", "audit log", or "what was modified / changed" requests.

Fields:
- change_event.change_date_time
- change_event.user_email (who made the change)
- change_event.change_resource_type
- change_event.change_resource_name
- change_event.client_type
- change_event.resource_change_operation (CREATE, UPDATE, REMOVE)
- change_event.changed_fields
- change_event.old_resource (old values of changed fields)
- change_event.new_resource (new values of changed fields)
- campaign.name
- ad_group.name

Rules (CRITICAL):
- change_event does NOT use segments.date. Filter ONLY on change_event.change_date_time BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'.
- ALWAYS add LIMIT 10000 for change_event.
- Do NOT add campaign.status = 'ENABLED' for change_event queries.
- The date range cannot exceed 30 days.
- change_event.user_email = who made the change.
- change_event.resource_change_operation values: CREATE, UPDATE, REMOVE.
- change_event.change_resource_type values: CAMPAIGN, AD_GROUP, AD_GROUP_CRITERION (keywords), AD_GROUP_AD, CAMPAIGN_CRITERION, CAMPAIGN_BUDGET, etc.
- Changed keywords appear as rows where change_resource_type = AD_GROUP_CRITERION.
- For "include changed keywords", do not query keyword_view. Use change_event rows with change_resource_type = AD_GROUP_CRITERION.

Example:
User: "Show change history from yesterday to today with who made the change, what resource, operation type, campaign name, old and new values for all fields changed within the campaign. Include changed keywords as well."
Query: SELECT change_event.change_date_time, change_event.user_email, change_event.change_resource_type, change_event.change_resource_name, change_event.resource_change_operation, change_event.changed_fields, change_event.old_resource, change_event.new_resource, campaign.name, ad_group.name FROM change_event WHERE change_event.change_date_time BETWEEN '[CALCULATED_START_DATE]' AND '[CALCULATED_END_DATE]' ORDER BY change_event.change_date_time DESC LIMIT 10000
Calculation: Yesterday (CURRENT_DATE - 1, i.e. \${CURRENT_DATE} minus 1 day) to today (\${CURRENT_DATE}).`

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

  const dbPrompt = row.content.replace(/\$\{CURRENT_DATE\}/g, CURRENT_DATE)
  return `${dbPrompt}${CHANGE_EVENT_ADDENDUM.replace(/\$\{CURRENT_DATE\}/g, CURRENT_DATE)}`
}
