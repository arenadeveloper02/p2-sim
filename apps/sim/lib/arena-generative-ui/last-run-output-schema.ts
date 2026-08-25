import { db } from '@sim/db'
import { workflowExecutionLogs } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { and, desc, eq } from 'drizzle-orm'
import {
  type ArenaGenerativeSchemaField,
  outputSchemaFromSample,
} from '@/lib/arena-generative-ui/output-schema'
import { materializeExecutionData } from '@/lib/logs/execution/trace-store'

const logger = createLogger('ArenaLastRunOutputSchema')

export const LAST_RUN_TRUNCATED_WARNING =
  "The last successful run's output was truncated, so nested fields may be missing. Paste a Sample or add a nested Response body, then redeploy."

export const LAST_RUN_STALE_WARNING =
  'Schema is from a run of an older deployment. Run the current deploy once, or paste a Sample, if the output shape changed.'

export const LAST_RUN_EMPTY_LIST_WARNING =
  'The last successful run had an empty list, so item columns are unknown. Run it with at least one row, or paste a Sample.'

export interface LastRunOutputSchema {
  fields: ArenaGenerativeSchemaField[]
  warnings: string[]
  found: boolean
}

/**
 * Walks `finalOutput` from the latest completed execution. Values are discarded;
 * only field names and types are returned. Callers must not persist the raw log.
 */
export async function loadLastSuccessfulRunOutputSchema(
  workflowId: string,
  options?: { activeDeploymentVersionId?: string | null }
): Promise<LastRunOutputSchema> {
  const empty: LastRunOutputSchema = { fields: [], warnings: [], found: false }
  try {
    const [row] = await db
      .select({
        executionId: workflowExecutionLogs.executionId,
        workspaceId: workflowExecutionLogs.workspaceId,
        workflowId: workflowExecutionLogs.workflowId,
        deploymentVersionId: workflowExecutionLogs.deploymentVersionId,
        executionData: workflowExecutionLogs.executionData,
      })
      .from(workflowExecutionLogs)
      .where(
        and(
          eq(workflowExecutionLogs.workflowId, workflowId),
          eq(workflowExecutionLogs.status, 'completed')
        )
      )
      .orderBy(desc(workflowExecutionLogs.startedAt))
      .limit(1)

    if (!row?.executionId) {
      return empty
    }

    const materialized = await materializeExecutionData(asExecutionDataRecord(row.executionData), {
      workspaceId: row.workspaceId,
      workflowId: row.workflowId ?? workflowId,
      executionId: row.executionId,
    })
    const truncated = materialized.executionDataTruncated === true
    const fields = fieldsFromFinalOutput(materialized.finalOutput)
    const warnings = lastRunSchemaWarnings({
      truncated,
      stale: isStaleLastRun(row.deploymentVersionId, options?.activeDeploymentVersionId),
      emptyList: lastRunHasEmptyArrayWithoutItems(fields),
    })

    return { fields, warnings, found: true }
  } catch (error) {
    logger.warn('Could not derive outputSchema from last successful run', {
      workflowId,
      error: getErrorMessage(error),
    })
    return empty
  }
}

function asExecutionDataRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

function fieldsFromFinalOutput(finalOutput: unknown): ArenaGenerativeSchemaField[] {
  if (finalOutput === undefined || finalOutput === null) {
    return []
  }
  try {
    return outputSchemaFromSample(JSON.stringify(finalOutput))
  } catch {
    return []
  }
}

function isStaleLastRun(
  runDeploymentVersionId: string | null | undefined,
  activeDeploymentVersionId: string | null | undefined
): boolean {
  if (!activeDeploymentVersionId) {
    return false
  }
  return runDeploymentVersionId !== activeDeploymentVersionId
}

function lastRunHasEmptyArrayWithoutItems(fields: ArenaGenerativeSchemaField[]): boolean {
  return fields.some((field) => {
    if (field.type !== 'array') return false
    const itemPrefix = `${field.name}[]`
    return !fields.some((candidate) => candidate.name.startsWith(itemPrefix))
  })
}

function lastRunSchemaWarnings(flags: {
  truncated: boolean
  stale: boolean
  emptyList: boolean
}): string[] {
  const warnings: string[] = []
  if (flags.truncated) warnings.push(LAST_RUN_TRUNCATED_WARNING)
  if (flags.stale) warnings.push(LAST_RUN_STALE_WARNING)
  if (flags.emptyList) warnings.push(LAST_RUN_EMPTY_LIST_WARNING)
  return warnings
}
