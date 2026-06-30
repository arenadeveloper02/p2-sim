import {
  parseSkyvernWorkflowParameterRows,
  toSkyvernApiWorkflowParameters,
  type SkyvernWorkflowParameterRow,
} from '@/tools/skyvern/parameter-rows'

export interface BuildSkyvernCreateWorkflowBodyParams {
  title: string
  description?: string
  blockLabel?: string
  url: string
  navigationGoal?: string
  dataExtractionGoal?: string
  prompt?: string
  workflowParameters?: unknown
}

function normalizeSkyvernTemplatePlaceholders(
  value: string,
  parameterKeys: string[]
): string {
  let normalized = value

  for (const key of parameterKeys) {
    normalized = normalized.replace(
      new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g'),
      `{{${key}}}`
    )
  }

  return normalized
}

function mergeNavigationGoal(navigationGoal?: string, prompt?: string): string | undefined {
  const goal = navigationGoal?.trim()
  const steps = prompt?.trim()

  if (goal && steps) {
    return `${goal}\n\n${steps}`
  }

  return goal || steps || undefined
}

function buildSkyvernWorkflowBlocks(params: {
  blockLabel?: string
  url: string
  navigationGoal?: string
  dataExtractionGoal?: string
  parameterKeys: string[]
}): Array<Record<string, unknown>> {
  const label = params.blockLabel?.trim() || 'UI_Automation'
  const url = normalizeSkyvernTemplatePlaceholders(params.url.trim(), params.parameterKeys)
  const navigationGoal = params.navigationGoal?.trim()
  const dataExtractionGoal = params.dataExtractionGoal?.trim()
  const shared = {
    engine: 'skyvern-1.0',
    parameter_keys: params.parameterKeys,
    max_retries: 0,
    max_steps_per_run: 100,
  }

  const blocks: Array<Record<string, unknown>> = []

  if (navigationGoal) {
    blocks.push({
      label,
      title: label,
      block_type: 'navigation',
      url,
      navigation_goal: navigationGoal,
      ...shared,
    })
  }

  if (dataExtractionGoal) {
    const extractionLabel = navigationGoal ? `${label}_Extraction` : label
    blocks.push({
      label: extractionLabel,
      title: extractionLabel,
      block_type: 'extraction',
      url: navigationGoal ? '' : url,
      data_extraction_goal: dataExtractionGoal,
      ...shared,
    })
  }

  if (blocks.length === 0) {
    blocks.push({
      label,
      title: label,
      block_type: 'task',
      url,
      ...shared,
    })
  }

  return blocks
}

/**
 * Builds the JSON body for Skyvern `POST /v1/agents` from block/tool params.
 */
export function buildSkyvernCreateWorkflowBody(
  params: BuildSkyvernCreateWorkflowBodyParams
): Record<string, unknown> {
  const workflowParameters: SkyvernWorkflowParameterRow[] = parseSkyvernWorkflowParameterRows(
    params.workflowParameters
  )
  const parameterKeys = workflowParameters.map((parameter) => parameter.key)
  const navigationGoal = mergeNavigationGoal(params.navigationGoal, params.prompt)

  return {
    json_definition: {
      title: params.title.trim(),
      description: params.description?.trim() || undefined,
      workflow_definition: {
        parameters: toSkyvernApiWorkflowParameters(workflowParameters),
        blocks: buildSkyvernWorkflowBlocks({
          blockLabel: params.blockLabel,
          url: params.url,
          navigationGoal,
          dataExtractionGoal: params.dataExtractionGoal,
          parameterKeys,
        }),
      },
    },
  }
}
