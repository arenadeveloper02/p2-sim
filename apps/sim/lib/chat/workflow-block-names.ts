import { db } from '@sim/db'
import { workflowBlocks } from '@sim/db/schema'
import { inArray } from 'drizzle-orm'

/**
 * Groups workflow block rows into unique, sorted block types per workflow id.
 * Uses `type` (e.g. `gmail`, `agent`), not the canvas label (`name`).
 */
export function uniqueBlockNamesByWorkflowId(
  rows: Array<{ workflowId: string; type: string | null }>
): Map<string, string[]> {
  const namesByWorkflow = new Map<string, Set<string>>()
  for (const row of rows) {
    const blockName = row.type?.trim()
    if (!blockName) continue
    const names = namesByWorkflow.get(row.workflowId)
    if (names) {
      names.add(blockName)
    } else {
      namesByWorkflow.set(row.workflowId, new Set([blockName]))
    }
  }

  const result = new Map<string, string[]>()
  for (const [workflowId, names] of namesByWorkflow) {
    result.set(workflowId, [...names].sort((a, b) => a.localeCompare(b)))
  }
  return result
}

/**
 * Loads unique block types for each workflow, keyed by workflow id.
 */
export async function getUniqueBlockNamesByWorkflowId(
  workflowIds: string[]
): Promise<Map<string, string[]>> {
  const uniqueIds = [...new Set(workflowIds)]
  if (uniqueIds.length === 0) return new Map()

  const rows = await db
    .select({
      workflowId: workflowBlocks.workflowId,
      type: workflowBlocks.type,
    })
    .from(workflowBlocks)
    .where(inArray(workflowBlocks.workflowId, uniqueIds))

  return uniqueBlockNamesByWorkflowId(rows)
}
