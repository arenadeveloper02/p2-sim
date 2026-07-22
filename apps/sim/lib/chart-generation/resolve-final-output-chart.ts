/**
 * Shape-agnostic resolver that recovers a renderable chart from a workflow's
 * final output, regardless of how that output is keyed.
 *
 * Different chat surfaces receive differently-shaped `final` payloads:
 * - Deployed chat: `output` is keyed by block id (`{ [blockId]: { path: value } }`).
 * - Workflow floating chat: `output` is the workflow's aggregated terminal output
 *   (the terminal block's own object, e.g. `{ charts, content, dashboard, ... }`),
 *   which is NOT keyed by block id.
 *
 * Rather than assume a single shape, this tries, in order (first hit wins):
 *   1. The user's selected outputs (respects the output dropdown).
 *   2. The whole output object.
 *   3. Each value of the output object.
 *
 * Nothing chart-specific or block-specific is hardcoded: detection is delegated
 * to `formatChartDeployOutputForChat` -> `isEChartsOption`, which only checks for
 * a non-empty typed `series` array (or a `{ charts: [...] }` wrapper). Any ECharts
 * type and any block that emits one is handled automatically. Because that helper
 * returns `null` for anything that is not a real chart, text-only outputs are
 * never altered.
 */

import { formatChartDeployOutputForChat } from '@/lib/chart-generation/echarts-option'
import {
  extractBlockIdFromOutputId,
  extractPathFromOutputId,
} from '@/lib/core/utils/response-format'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads a selected output value from a block-output map keyed by block id,
 * mirroring the deployed chat's `getForkBlockOutputValue` path resolution.
 */
function getBlockOutputValue(
  output: Record<string, unknown>,
  blockId: string,
  path: string
): unknown {
  const blockOutputs = output[blockId]
  if (!isRecord(blockOutputs)) {
    return undefined
  }

  if (!path || path === 'content') {
    if (blockOutputs.content !== undefined) return blockOutputs.content
    if (blockOutputs.result !== undefined) return blockOutputs.result
    return blockOutputs
  }

  if (blockOutputs[path] !== undefined) {
    return blockOutputs[path]
  }

  if (path.includes('.')) {
    return path.split('.').reduce<unknown>((current, segment) => {
      if (isRecord(current) && segment in current) {
        return current[segment]
      }
      return undefined
    }, blockOutputs)
  }

  return undefined
}

/**
 * Resolves a renderable chart string from a workflow final output. Returns the
 * formatted chart content, or `null` when no renderable chart is present (in
 * which case callers should leave existing text untouched).
 */
export function resolveChartContentFromFinalOutput(
  finalOutput: unknown,
  selectedOutputs: string[] = []
): string | null {
  if (finalOutput === null || finalOutput === undefined) {
    return null
  }

  // 1. Prefer the user's selected outputs (block-id-keyed shape).
  if (isRecord(finalOutput)) {
    for (const outputId of selectedOutputs) {
      const blockId = extractBlockIdFromOutputId(outputId)
      const path = extractPathFromOutputId(outputId, blockId)
      const value = getBlockOutputValue(finalOutput, blockId, path)
      const chartContent = formatChartDeployOutputForChat(value)
      if (chartContent) {
        return chartContent
      }
    }
  }

  // 2. Treat the whole output as a possible chart payload (terminal output that
  //    carries top-level `charts`/`content`, or a lone ECharts option).
  const wholeChart = formatChartDeployOutputForChat(finalOutput)
  if (wholeChart) {
    return wholeChart
  }

  // 3. Scan each value (keyed-by-block-id maps and nested block outputs).
  if (isRecord(finalOutput)) {
    for (const value of Object.values(finalOutput)) {
      const chartContent = formatChartDeployOutputForChat(value)
      if (chartContent) {
        return chartContent
      }
    }
  }

  return null
}
