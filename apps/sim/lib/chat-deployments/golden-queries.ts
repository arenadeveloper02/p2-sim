import { db } from '@sim/db'
import { workflowQueries } from '@sim/db/schema'
import { generateId } from '@sim/utils/id'
import { and, asc, eq } from 'drizzle-orm'

/**
 * Trims and drops empty golden-query strings. Shared by chat deploy and
 * chat-manage so those routes do not re-grow a local copy that re-conflicts
 * with upstream adapters.
 */
export function sanitizeGoldenQueryStrings(queries?: string[]): string[] {
  if (!Array.isArray(queries)) return []
  return queries.map((query) => query.trim()).filter((query) => query.length > 0)
}

/**
 * Replaces every golden query for a workflow. An empty `queries` array clears
 * the table for that workflow.
 */
export async function replaceWorkflowGoldenQueries(input: {
  workflowId: string
  userId: string
  queries: string[]
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(workflowQueries).where(eq(workflowQueries.workflowId, input.workflowId))

    if (input.queries.length === 0) return

    await tx.insert(workflowQueries).values(
      input.queries.map((query, index) => ({
        id: generateId(),
        userId: input.userId,
        workflowId: input.workflowId,
        query,
        priority: index,
      }))
    )
  })
}

/**
 * Persists golden queries when the request included the field (including an
 * empty array, which clears stored queries). Omitting the field leaves the
 * existing rows unchanged.
 */
export async function syncWorkflowGoldenQueriesFromCustomizations(input: {
  workflowId: string
  userId: string
  goldenQueries?: string[]
}): Promise<void> {
  if (input.goldenQueries === undefined) return
  await replaceWorkflowGoldenQueries({
    workflowId: input.workflowId,
    userId: input.userId,
    queries: sanitizeGoldenQueryStrings(input.goldenQueries),
  })
}

/**
 * Live golden-query strings for a workflow, in display order. Soft-deleted rows
 * are omitted so the editor and deployed chat agree with the identifier PATCH.
 */
export async function listWorkflowGoldenQueryStrings(workflowId: string): Promise<string[]> {
  const rows = await db
    .select({ query: workflowQueries.query })
    .from(workflowQueries)
    .where(and(eq(workflowQueries.workflowId, workflowId), eq(workflowQueries.deleted, false)))
    .orderBy(asc(workflowQueries.priority), asc(workflowQueries.createdAt))
  return rows.map((row) => row.query)
}
