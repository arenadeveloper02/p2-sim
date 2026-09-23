import { createLogger, type Logger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { omit } from '@sim/utils/object'
import type OpenAI from 'openai'
import type { BillingAttributionSnapshot } from '@/lib/billing/core/billing-attribution'
import { getCostMultiplier, isHosted } from '@/lib/core/config/env-flags'
import {
  normalizeRecord,
  normalizeStringRecord,
  normalizeWorkflowVariables,
} from '@/lib/core/utils/records'
import type { CustomBlockToolBinding } from '@/lib/workflows/custom-blocks/operations'
import { isFileFieldType, type WorkflowInputField } from '@/lib/workflows/input-format'
import {
  buildCanonicalIndex,
  type CanonicalGroup,
  type CanonicalModeOverrides,
  isCanonicalPair,
  resolveActiveCanonicalValue,
  scopeCanonicalModesForTool,
} from '@/lib/workflows/subblocks/visibility'
import { assembleCustomBlockInputMapping, isCustomBlockType } from '@/blocks/custom/build-config'
import { isCustomTool } from '@/executor/constants'
import { getEmbeddingModelPricing, getModelPricing as getModelPricingFromDefinitions } from '@/providers/models'
import {
  getProviderToolInputProvenance,
  getProviderToolModelInputRegistry,
  registerPreparedProviderToolInputProvenance,
} from '@/providers/tool-input-provenance'
import { getHostedModels } from '@/providers/provider-metadata'
import type { ProviderToolConfig } from '@/providers/types'

export type { ProviderMetadata } from '@/providers/provider-metadata'
export {
  describeModelLevel,
  filterBlacklistedModels,
  findProviderFromModel,
  formatCost,
  getAllModelProviders,
  getAllModels,
  getAllProviderIds,
  getBaseModelProviders,
  getHostedModels,
  getMaxOutputTokensForModel,
  getMaxTemperature,
  getProvider,
  getProviderConfigFromModel,
  getProviderFromModel,
  getProviderIcon,
  getProviderModels,
  getReasoningEffortValuesForModel,
  getThinkingLevelsForModel,
  getVerbosityValuesForModel,
  isDeepResearchModel,
  isGemini3Model,
  isProviderBlacklisted,
  MODELS_TEMP_RANGE_0_1,
  MODELS_TEMP_RANGE_0_15,
  MODELS_TEMP_RANGE_0_2,
  MODELS_WITH_DEEP_RESEARCH,
  MODELS_WITH_PROMPT_CACHING,
  MODELS_WITH_REASONING_EFFORT,
  MODELS_WITH_TEMPERATURE_SUPPORT,
  MODELS_WITH_THINKING,
  MODELS_WITH_VERBOSITY,
  MODELS_WITHOUT_MEMORY,
  PROVIDERS_WITH_TOOL_USAGE_CONTROL,
  providers,
  supportsPromptCaching,
  supportsReasoningEffort,
  supportsTemperature,
  supportsThinking,
  supportsToolUsageControl,
  supportsVerbosity,
  updateBasetenProviderModels,
  updateFireworksProviderModels,
  updateLiteLLMProviderModels,
  updateOllamaCloudProviderModels,
  updateOllamaProviderModels,
  updateOpenRouterProviderModels,
  updateTogetherProviderModels,
  updateVLLMProviderModels,
} from '@/providers/provider-metadata'
import { useProvidersStore } from '@/stores/providers/store'
import { mergeToolParameters } from '@/tools/merge-params'
import type { SchemaProperty } from '@/tools/params'
import { SPYFU_DEFAULT_OPERATION_ID } from '@/tools/spyfu/operations'
import type { WorkflowToolExecutionContext } from '@/tools/types'

const logger = createLogger('ProviderUtils')

/** Log once per unknown model id so streaming paths do not spam warnings. */
const modelsMissingPricingWarned = new Set<string>()

/**
 * Checks if a workflow description is a default/placeholder description
 */
function isDefaultWorkflowDescription(
  description: string | null | undefined,
  name?: string
): boolean {
  if (!description) return true
  const normalizedDesc = description.toLowerCase().trim()
  return (
    description === name ||
    normalizedDesc === 'new workflow' ||
    normalizedDesc === 'your first workflow - start building here!'
  )
}

/**
 * Server-only workflow metadata lookup. The specifier is assembled at runtime so
 * webpack cannot follow `@/executor/utils/http` into the client graph.
 */
async function fetchWorkflowMetadata(
  workflowId: string,
  executionContext: WorkflowToolExecutionContext | undefined
): Promise<{ name: string; description: string | null } | null> {
  const load = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{
    fetchWorkflowMetadata: (
      workflowId: string,
      executionContext: WorkflowToolExecutionContext | undefined
    ) => Promise<{ name: string; description: string | null } | null>
  }>
  const { fetchWorkflowMetadata: fetchOnServer } = await load(
    '@/providers/fetch-workflow-metadata.server'
  )
  return fetchOnServer(workflowId, executionContext)
}

/**
 * Generates prompt instructions for structured JSON output from a JSON schema.
 * Used as a fallback when native structured outputs are not supported.
 */
export function generateSchemaInstructions(schema: any, schemaName?: string): string {
  const name = schemaName || 'response'
  return `IMPORTANT: You must respond with a valid JSON object that conforms to the following schema.
Do not include any text before or after the JSON object. Only output the JSON.

Schema name: ${name}
JSON Schema:
${JSON.stringify(schema, null, 2)}

Your response must be valid JSON that exactly matches this schema structure.`
}

export function generateStructuredOutputInstructions(responseFormat: any): string {
  if (!responseFormat) return ''

  if (responseFormat.schema || (responseFormat.type === 'object' && responseFormat.properties)) {
    return ''
  }

  if (!responseFormat.fields) return ''

  function generateFieldStructure(field: any): string {
    if (field.type === 'object' && field.properties) {
      return `{
    ${Object.entries(field.properties)
      .map(([key, prop]: [string, any]) => `"${key}": ${prop.type === 'number' ? '0' : '"value"'}`)
      .join(',\n    ')}
  }`
    }
    return field.type === 'string'
      ? '"value"'
      : field.type === 'number'
        ? '0'
        : field.type === 'boolean'
          ? 'true/false'
          : '[]'
  }

  const exampleFormat = responseFormat.fields
    .map((field: any) => `  "${field.name}": ${generateFieldStructure(field)}`)
    .join(',\n')

  const fieldDescriptions = responseFormat.fields
    .map((field: any) => {
      let desc = `${field.name} (${field.type})`
      if (field.description) desc += `: ${field.description}`
      if (field.type === 'object' && field.properties) {
        desc += '\nProperties:'
        Object.entries(field.properties).forEach(([key, prop]: [string, any]) => {
          desc += `\n  - ${key} (${(prop as any).type}): ${(prop as any).description || ''}`
        })
      }
      return desc
    })
    .join('\n')

  return `
Please provide your response in the following JSON format:
{
${exampleFormat}
}

Field descriptions:
${fieldDescriptions}

Your response MUST be valid JSON and include all the specified fields with their correct types.
Each metric should be an object containing 'score' (number) and 'reasoning' (string).`
}

export function extractAndParseJSON(content: string): any {
  const trimmed = content.trim()

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('No JSON object found in content')
  }

  const jsonStr = trimmed.slice(firstBrace, lastBrace + 1)

  try {
    return JSON.parse(jsonStr)
  } catch (_error) {
    const cleaned = jsonStr
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/,\s*([}\]])/g, '$1')

    try {
      return JSON.parse(cleaned)
    } catch (innerError) {
      logger.error('Failed to parse JSON response', {
        contentLength: content.length,
        extractedLength: jsonStr.length,
        cleanedLength: cleaned.length,
        error: getErrorMessage(innerError, 'Unknown error'),
      })

      throw new Error(
        `Failed to parse JSON after cleanup: ${getErrorMessage(innerError, 'Unknown error')}`
      )
    }
  }
}

/**
 * When an integration tool is nested in an Agent block, StoredTool.params often omit the OAuth
 * account field while the standalone block still resolves auth from subBlock defaults (`value()`).
 * Merge `accounts` (etc.) from the block definition so HubSpot/Gmail-style tools receive the same
 * credential routing as canvas blocks — e.g. HubSpot `accounts` default → oauthCredential via block tools.config.params.
 */
function mergeOAuthCredentialDefaultsFromSubBlocks(
  blockDef: { subBlocks?: Array<{ id?: string; value?: unknown }> },
  params: Record<string, unknown>
): void {
  const hasCredentialPick =
    (typeof params.accounts === 'string' && params.accounts.trim() !== '') ||
    (typeof params.oauthCredential === 'string' && params.oauthCredential.trim() !== '') ||
    (typeof params.credential === 'string' && params.credential.trim() !== '')
  if (hasCredentialPick) return

  const accountsSb = blockDef.subBlocks?.find((sb) => sb.id === 'accounts')
  if (!accountsSb || typeof accountsSb.value !== 'function') return

  try {
    const defVal = (accountsSb.value as (p: Record<string, unknown>) => unknown)(params)
    if (typeof defVal === 'string' && defVal.trim() !== '') {
      params.accounts = defVal.trim()
    }
  } catch {
    // Ignore invalid defaults
  }
}
/**
 * Resolves canonical pair ids (e.g. `tableId`, `knowledgeBaseId`) from a tool's
 * raw params, preferring the active basic/advanced selector subblock source over
 * a previously resolved canonical value.
 *
 * Selector subblocks persist their value under the subblock id (e.g.
 * `tableSelector`), not the canonical id, so any lookup that keys off the
 * canonical id — like the unique-tool-id suffix below — must resolve it first.
 * Mode selection mirrors {@link transformBlockTool}'s execution-time
 * `paramsTransform` so the resolved id matches the params the tool actually runs
 * with. When the active selector has no value, the original canonical value is
 * preserved for direct-id callers and nested tools in advanced mode.
 *
 * @returns The params with canonical resource ids resolved (non-destructive)
 */
function resolveCanonicalResourceParams(
  params: Record<string, any>,
  canonicalGroups: CanonicalGroup[],
  scopedCanonicalModes?: CanonicalModeOverrides
): Record<string, any> {
  if (canonicalGroups.length === 0) return params
  const resolved = { ...params }
  for (const group of canonicalGroups) {
    // Route through the canonical SOT: an explicit scoped override wins, else the value heuristic -
    // no `?? 'basic'` (which ignored an advanced-only value when basic was empty).
    const explicitMode = scopedCanonicalModes?.[group.canonicalId]
    const chosen = resolveActiveCanonicalValue(
      group,
      params,
      explicitMode ? { [group.canonicalId]: explicitMode } : undefined
    )
    if (chosen !== undefined) resolved[group.canonicalId] = chosen
  }
  return resolved
}

/** JSON-schema type for a workflow input field (LLM tool schema). */
function inputFieldSchemaType(fieldType: string): string {
  switch (fieldType) {
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'object':
      return 'object'
    case 'array':
      return 'array'
    default:
      return 'string'
  }
}

/**
 * Build the LLM tool schema for a custom block used as an agent tool: a single
 * `inputMapping` object whose properties are the block's deployed input fields,
 * keyed by the field's stable id (so it lines up with `assembleCustomBlockInputMapping`
 * and the child's id→name remap) and marked required per the publisher's overrides.
 * `file[]` fields are omitted — the model can't synthesize uploaded-file descriptors.
 */
function buildCustomBlockInputMappingSchema(
  blockName: string,
  inputFields: WorkflowInputField[],
  requiredInputIds: string[]
): ProviderToolConfig['parameters'] {
  const requiredSet = new Set(requiredInputIds)
  const properties: Record<string, any> = {}
  const requiredFields: string[] = []
  for (const field of inputFields) {
    if (isFileFieldType(field.type)) continue
    const key = field.id ?? field.name
    properties[key] = {
      type: inputFieldSchemaType(field.type),
      description: field.description ? `${field.name} — ${field.description}` : field.name,
    }
    if (requiredSet.has(key)) requiredFields.push(key)
  }
  return {
    type: 'object',
    properties: {
      inputMapping: {
        type: 'object',
        description: `Input values for ${blockName}`,
        properties,
        required: requiredFields,
      },
    },
    required: requiredFields.length > 0 ? ['inputMapping'] : [],
  }
}

/**
 * Transforms a block tool into a provider tool config with operation selection
 *
 * @param block The block to transform
 * @param options Additional options including dependencies and selected operation
 * @returns The provider tool config or null if transform fails
 */
/**
 * Drops model-supplied arguments for params the tool declares off-limits to the
 * model (`user-only` / `hidden`).
 *
 * Deliberately keyed on the declared visibility rather than on "absent from
 * `parameters.properties`": an MCP or custom tool may legitimately accept keys
 * beyond its advertised properties (`additionalProperties`), and silently
 * dropping those would truncate its arguments. Only a param the tool itself
 * marked as not-for-the-model is removed.
 */
function stripModelBlockedParams(
  blockedParams: string[] | undefined,
  llmArgs: Record<string, any>
): Record<string, any> {
  if (!blockedParams?.length) return llmArgs
  const blocked = new Set(blockedParams)
  const filtered: Record<string, any> = {}
  for (const [key, value] of Object.entries(llmArgs)) {
    if (!blocked.has(key)) filtered[key] = value
  }
  return filtered
}

/** Reads a multi-select value that may still be JSON-encoded from `StoredTool.params`. */
function readMountedSecretNames(raw: unknown): string[] {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      // A bare name rather than a list — treat it as a single entry.
      return value ? [value as string] : []
    }
  }
  return Array.isArray(value)
    ? value.filter((name): name is string => typeof name === 'string' && name.length > 0)
    : []
}

export async function transformBlockTool(
  block: any,
  options: {
    selectedOperation?: string
    getAllBlocks: () => any[]
    getTool: (toolId: string) => any
    getToolAsync?: (toolId: string) => Promise<any>
    canonicalModes?: Record<string, 'basic' | 'advanced'>
    enrichmentContext?: WorkflowToolExecutionContext
    /**
     * Server-only resolver for a custom (deploy-as-block) tool's binding (bound
     * workflow + input schema), org-scoped to the consumer. Injected as a dependency
     * — like `getAllBlocks`/`getTool` — so this client-reachable module never imports
     * the DB-backed `operations` module. Omit for non-server callers that can't
     * resolve authority; a custom block is then simply not offered as a tool.
     */
    resolveCustomBlockBinding?: (blockType: string) => Promise<CustomBlockToolBinding | null>
    /**
     * Position of this tool within its parent agent block's `tool-input` array. Canonical-mode
     * overrides are stored scoped by this index (`${toolIndex}:${canonicalId}`) rather than by
     * `block.type`, so that two tool entries of the same type (e.g. two Table tools) don't share
     * a canonical-mode override. Omit for tools with no such array position (e.g. Pi local tools).
     */
    toolIndex?: number
  }
): Promise<ProviderToolConfig | null> {
  const {
    selectedOperation,
    getAllBlocks,
    getTool,
    getToolAsync,
    canonicalModes,
    enrichmentContext,
    toolIndex,
  } = options
  const scopedCanonicalModes = scopeCanonicalModesForTool(canonicalModes, toolIndex, block.type)

  let blockDef = getAllBlocks().find((b: any) => b.type === block.type)

  // Fallback: Direct registry access if getAllBlocks() doesn't include the block
  if (!blockDef && block.type === 'gmail_v2') {
    try {
      const { registry } = require('@/blocks/registry')
      if (registry?.gmail_v2) {
        blockDef = registry.gmail_v2
      }
    } catch (e) {
      // If require fails, try import
      try {
        const registryModule = await import('@/blocks/registry')
        if (registryModule?.registry?.gmail_v2) {
          blockDef = registryModule.registry.gmail_v2
        }
      } catch (importError) {
        // Both failed, will return null below
      }
    }
  }

  if (!blockDef) {
    logger.warn(`Block definition not found for type: ${block.type}`)
    return null
  }

  // Custom (deploy-as-block) blocks resolve to the generic `workflow_executor`, but
  // as an agent tool they must run through the authority boundary (owner identity,
  // latest deployment, curated outputs) — not the plain workflow executor. Route
  // them to the dedicated in-process `deployed_block_executor` tool, carrying the
  // block TYPE (never a source workflow id) so authority is re-resolved server-side.
  // Dynamic imports keep the DB/executor dependency graph out of client bundles.
  if (isCustomBlockType(block.type)) {
    const binding = await options.resolveCustomBlockBinding?.(block.type)
    if (!binding) {
      logger.warn(`Custom block tool binding not resolved for type: ${block.type}`)
      return null
    }
    const customToolConfig = getTool('deployed_block_executor')
    if (!customToolConfig) {
      logger.warn('deployed_block_executor tool not registered')
      return null
    }
    const inputMapping = assembleCustomBlockInputMapping(block.params || {})
    // A `file[]` field is omitted from the model schema (the model can't synthesize
    // upload descriptors). If such a field is REQUIRED and the user hasn't
    // pre-filled it on the block, no invocation could ever satisfy the child's
    // required-input check — so don't offer an unusable tool at all.
    const prefilled = JSON.parse(inputMapping) as Record<string, unknown>
    const requiredIds = new Set(binding.requiredInputIds)
    const unfillableFileField = binding.inputFields.find((field) => {
      const key = field.id ?? field.name
      return isFileFieldType(field.type) && requiredIds.has(key) && !(key in prefilled)
    })
    if (unfillableFileField) {
      logger.warn(
        `Custom block ${block.type} not offered as a tool: required file input "${unfillableFileField.name}" has no preset value and cannot be supplied by the model`
      )
      return null
    }
    return {
      // Unique per block so two custom-block tools never collide on the wire.
      id: `deployed_block_executor_${block.type}`,
      // Name/description come from the block itself — never the source workflow's
      // metadata, which the consumer has no access to.
      name: blockDef.name,
      description: blockDef.description || customToolConfig.description,
      params: {
        blockType: block.type,
        inputMapping,
      },
      parameters: buildCustomBlockInputMappingSchema(
        blockDef.name,
        binding.inputFields,
        binding.requiredInputIds
      ),
    }
  }

  let toolId: string | null = null

  if ((blockDef.tools?.access?.length || 0) > 1) {
    if (selectedOperation && blockDef.tools?.config?.tool) {
      try {
        toolId = blockDef.tools.config.tool({
          ...block.params,
          operation: selectedOperation,
        })
      } catch (error) {
        logger.error('Error selecting tool for block', {
          blockType: block.type,
          operation: selectedOperation,
          error,
        })
        return null
      }
    } else {
      toolId = blockDef.tools.access[0]
    }
  } else {
    toolId = blockDef.tools?.access?.[0] || null
  }

  if (!toolId) {
    logger.warn(`No tool ID found for block: ${block.type}`)
    return null
  }

  let toolConfig: any

  if (isCustomTool(toolId) && getToolAsync) {
    toolConfig = await getToolAsync(toolId)
  } else {
    toolConfig = getTool(toolId)
  }

  if (!toolConfig) {
    logger.warn(`Tool config not found for ID: ${toolId}`)
    return null
  }

  const { createLLMToolSchema } = await import('@/tools/params')

  // Agent tools store the selected operation on `block.operation`; merge into params so
  // block `tools.config.params` and tool execution see the same shape as canvas blocks.
  const userProvidedParams = {
    ...(block.params || {}),
    ...(block.operation != null && String(block.operation) !== ''
      ? { operation: block.operation }
      : {}),
  }

  mergeOAuthCredentialDefaultsFromSubBlocks(blockDef, userProvidedParams as Record<string, unknown>)

  // HubSpot `tools.config.params` maps `accounts` → oauthCredential; some persisted shapes only have `oauthCredential`.
  if (block.type === 'hubspot') {
    const p = userProvidedParams as Record<string, unknown>
    const hasAccounts = typeof p.accounts === 'string' && p.accounts.trim() !== ''
    const oauth = p.oauthCredential
    if (!hasAccounts && typeof oauth === 'string' && oauth.trim() !== '') {
      p.accounts = oauth.trim()
    }
  }

  if (block.type === 'spyfu') {
    const p = userProvidedParams as Record<string, unknown>
    const oid = p.operationId
    const missing =
      oid === undefined || oid === null || (typeof oid === 'string' && oid.trim() === '')
    if (missing) {
      p.operationId = SPYFU_DEFAULT_OPERATION_ID
    }
  }

  const canonicalGroups: CanonicalGroup[] = blockDef?.subBlocks
    ? Object.values(buildCanonicalIndex(blockDef.subBlocks).groupsById).filter(isCanonicalPair)
    : []

  const resolvedResourceParams = resolveCanonicalResourceParams(
    userProvidedParams,
    canonicalGroups,
    scopedCanonicalModes
  )

  let {
    schema: llmSchema,
    enrichedDescription,
    modelBlockedParams,
  } = await createLLMToolSchema(toolConfig, resolvedResourceParams, enrichmentContext)

  /**
   * Semrush URL reports (`url_*`) need a page URL. Models often populate `domain` instead because
   * the raw tool schema marks both as optional; execution then falls back to `domain`, so the
   * call succeeds but `url` is never generated. When the block operation is URL-based and `url`
   * is still delegated to the model, require `url` in the function schema and spell out the contract.
   */
  if (toolId === 'semrush_query') {
    const rawOp = String(
      (userProvidedParams as Record<string, unknown>).reportType ??
        (userProvidedParams as Record<string, unknown>).operation ??
        ''
    ).trim()
    if (rawOp.startsWith('url_')) {
      const schema = llmSchema as {
        properties?: Record<string, { type?: string; description?: string }>
        required?: string[]
      }
      const urlProp = schema.properties?.url
      if (urlProp) {
        const hint = `Required for "${rawOp}": set to the full page URL (https://… including path when relevant). Prefer this field over \`domain\` for URL reports.`
        schema.properties!.url = {
          ...urlProp,
          description: urlProp.description ? `${urlProp.description} ${hint}` : hint,
        }
        if (!Array.isArray(schema.required)) {
          schema.required = []
        }
        if (!schema.required.includes('url')) {
          schema.required.push('url')
        }
      }
    }
  }

  // Image Fusion only uses fusion inputs (block); shared tool still lists single-image edit params.
  if (
    toolId === 'google_nano_banana' &&
    block.type === 'image_fusion' &&
    llmSchema?.properties &&
    typeof llmSchema.properties === 'object'
  ) {
    const props = llmSchema.properties as Record<string, SchemaProperty>
    const properties = Object.fromEntries(
      Object.entries(props).filter(([key]) => key !== 'inputImage' && key !== 'inputImageMimeType')
    ) as Record<string, SchemaProperty>
    llmSchema = {
      ...llmSchema,
      properties,
      required: (llmSchema.required || []).filter(
        (r) => r !== 'inputImage' && r !== 'inputImageMimeType'
      ),
    }
  }

  let uniqueToolId = toolConfig.id
  let toolName = toolConfig.name
  let toolDescription = enrichedDescription || toolConfig.description

  if (toolId === 'workflow_executor' && resolvedResourceParams.workflowId) {
    uniqueToolId = `${toolConfig.id}_${resolvedResourceParams.workflowId}`

    const workflowMetadata = await fetchWorkflowMetadata(
      resolvedResourceParams.workflowId,
      enrichmentContext
    )
    if (workflowMetadata) {
      toolName = workflowMetadata.name || toolConfig.name
      if (
        workflowMetadata.description &&
        !isDefaultWorkflowDescription(workflowMetadata.description, workflowMetadata.name)
      ) {
        toolDescription = workflowMetadata.description
      }
    }
  } else if (toolId === 'function_execute' && resolvedResourceParams.secretScope === 'selected') {
    // Scoping alone would leave the model guessing: the secrets are injected
    // server-side and nothing else advertises them. Names only — values never
    // enter the provider request, matching the copilot's workspace-context rule.
    // `StoredTool.params` holds strings, so a multi-select arrives JSON-encoded;
    // the executor's paramsTransform parses it later, but this runs before that.
    const mounted = readMountedSecretNames(resolvedResourceParams.mountedSecrets)
    toolDescription = mounted.length
      ? `${toolDescription}\n\nWorkspace secret names available to this code: ${mounted.join(', ')}. Reference one with the exact {{NAME}} syntax. Its value is bound only while the code executes and is not included in the model request. No other secrets are readable.`
      : `${toolDescription}\n\nThis code has no access to workspace secrets.`
  } else if (toolId.startsWith('knowledge_') && resolvedResourceParams.knowledgeBaseId) {
    uniqueToolId = `${toolConfig.id}_${resolvedResourceParams.knowledgeBaseId}`
  } else if (toolId.startsWith('table_') && resolvedResourceParams.tableId) {
    uniqueToolId = `${toolConfig.id}_${resolvedResourceParams.tableId}`
  }

  const blockParamsFn = blockDef?.tools?.config?.params as
    | ((p: Record<string, any>) => Record<string, any>)
    | undefined
  const blockInputDefs = blockDef?.inputs as Record<string, any> | undefined

  const needsTransform = blockParamsFn || blockInputDefs || canonicalGroups.length > 0
  const paramsTransform = needsTransform
    ? (params: Record<string, any>): Record<string, any> => {
        let result = { ...params }

        for (const group of canonicalGroups) {
          // Route through the canonical SOT: an explicit scoped override wins, else the value
          // heuristic - no `?? 'basic'` (which dropped an advanced-only value when basic was empty).
          const explicitMode = scopedCanonicalModes?.[group.canonicalId]
          const chosen = resolveActiveCanonicalValue(
            group,
            result,
            explicitMode ? { [group.canonicalId]: explicitMode } : undefined
          )

          const sourceIds = [group.basicId, ...group.advancedIds].filter(Boolean) as string[]
          result = omit(result, sourceIds)

          if (chosen !== undefined) {
            result[group.canonicalId] = chosen
          }
        }

        if (blockParamsFn) {
          const transformed = blockParamsFn(result)
          result = { ...result, ...transformed }
        }

        if (blockInputDefs) {
          for (const [key, schema] of Object.entries(blockInputDefs)) {
            const value = result[key]
            if (typeof value === 'string' && value.trim().length > 0) {
              const inputType = typeof schema === 'object' ? schema.type : schema
              if (inputType === 'json' || inputType === 'array') {
                try {
                  result[key] = JSON.parse(value.trim())
                } catch {
                  // Not valid JSON — keep as string
                }
              }
            }
          }
        }

        return result
      }
    : undefined

  return {
    id: uniqueToolId,
    name: toolName,
    description: toolDescription,
    params: userProvidedParams,
    parameters: llmSchema,
    modelBlockedParams,
    paramsTransform,
  }
}

/**
 * Calculate cost for token usage based on model pricing
 *
 * @param model The model name
 * @param promptTokens Number of prompt tokens used
 * @param completionTokens Number of completion tokens used
 * @param useCachedInput Whether to use cached input pricing (default: false)
 * @param customMultiplier Optional custom multiplier to override the default cost multiplier
 * @returns Cost calculation results with input, output and total costs
 */
export function calculateCost(
  model: string,
  promptTokens = 0,
  completionTokens = 0,
  useCachedInput = false,
  inputMultiplier?: number,
  outputMultiplier?: number
) {
  let pricing = getEmbeddingModelPricing(model)

  if (!pricing) {
    pricing = getModelPricingFromDefinitions(model)
  }

  if (!pricing) {
    if (!modelsMissingPricingWarned.has(model)) {
      modelsMissingPricingWarned.add(model)
      logger.warn(
        `calculateCost: no pricing found for model "${model}" in providers/models.ts or embedding pricing; returning $0`,
        { model }
      )
    }
    const defaultPricing = {
      input: 1.0,
      cachedInput: 0.5,
      output: 5.0,
      updatedAt: '2025-03-21',
    }
    return {
      input: 0,
      output: 0,
      total: 0,
      pricing: defaultPricing,
    }
  }

  const inputCost =
    promptTokens *
    (useCachedInput && pricing.cachedInput
      ? pricing.cachedInput / 1_000_000
      : pricing.input / 1_000_000)

  const outputCost = completionTokens * (pricing.output / 1_000_000)
  const finalInputCost = inputCost * (inputMultiplier ?? 1)
  const finalOutputCost = outputCost * (outputMultiplier ?? 1)
  const finalTotalCost = finalInputCost + finalOutputCost

  return {
    input: Number.parseFloat(finalInputCost.toFixed(8)),
    output: Number.parseFloat(finalOutputCost.toFixed(8)),
    total: Number.parseFloat(finalTotalCost.toFixed(8)),
    pricing,
  }
}

/**
 * Recursively enforces OpenAI strict-mode requirements on a JSON schema:
 * - Sets `additionalProperties: false` on every object type.
 * - Forces `required` to include ALL property keys.
 *
 * Required for any OpenAI-compatible backend that validates strict structured
 * outputs (OpenAI, Azure OpenAI, and OpenAI routes behind proxies like LiteLLM),
 * which reject schemas missing these constraints with an HTTP 400.
 */
export function enforceStrictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema

  const result = { ...schema }

  if (result.type === 'object') {
    result.additionalProperties = false

    if (result.properties && typeof result.properties === 'object') {
      const propKeys = Object.keys(result.properties as Record<string, unknown>)
      result.required = propKeys
      result.properties = Object.fromEntries(
        Object.entries(result.properties as Record<string, unknown>).map(([key, value]) => [
          key,
          enforceStrictSchema(value as Record<string, unknown>),
        ])
      )
    }
  }

  if (result.type === 'array' && result.items) {
    result.items = enforceStrictSchema(result.items as Record<string, unknown>)
  }

  for (const keyword of ['anyOf', 'oneOf', 'allOf']) {
    if (Array.isArray(result[keyword])) {
      result[keyword] = (result[keyword] as Record<string, unknown>[]).map(enforceStrictSchema)
    }
  }

  for (const defKey of ['$defs', 'definitions']) {
    if (result[defKey] && typeof result[defKey] === 'object') {
      result[defKey] = Object.fromEntries(
        Object.entries(result[defKey] as Record<string, unknown>).map(([key, value]) => [
          key,
          enforceStrictSchema(value as Record<string, unknown>),
        ])
      )
    }
  }

  return result
}

/**
 * Sums the `cost.total` from each tool result returned during a provider tool loop.
 * Tool results may carry a `cost` object injected by `applyHostedKeyCostToResult`.
 */
export function sumToolCosts(toolResults?: Record<string, unknown>[]): number {
  if (!toolResults?.length) return 0
  let total = 0
  for (const tr of toolResults) {
    const cost = tr?.cost as Record<string, unknown> | undefined
    if (cost?.total && typeof cost.total === 'number') total += cost.total
  }
  return total
}

export function getModelPricing(modelId: string): any {
  const embeddingPricing = getEmbeddingModelPricing(modelId)
  if (embeddingPricing) {
    return embeddingPricing
  }

  return getModelPricingFromDefinitions(modelId)
}

/**
 * Determine if model usage should be billed to the user
 *
 * @param model The model name
 * @returns true if the usage should be billed to the user
 */
export function shouldBillModelUsage(model: string): boolean {
  const normalized = model.trim().toLowerCase()
  if (!normalized) return false

  const hostedModels = getHostedModels()
  return hostedModels.some((hostedModel) => {
    const base = hostedModel.toLowerCase()
    return normalized === base || normalized.startsWith(`${base}-`)
  })
}

export interface BlockModelCost {
  input: number
  output: number
  total: number
}

/**
 * Normalizes a provider API `cost` field into the block output shape.
 */
export function normalizeProviderCost(cost: unknown): BlockModelCost | null {
  if (!cost || typeof cost !== 'object') return null

  const record = cost as Record<string, unknown>
  if (typeof record.total !== 'number' || !Number.isFinite(record.total)) return null

  return {
    input: typeof record.input === 'number' && Number.isFinite(record.input) ? record.input : 0,
    output: typeof record.output === 'number' && Number.isFinite(record.output) ? record.output : 0,
    total: record.total,
  }
}

/**
 * Resolves billable model cost for router/evaluator blocks. Prefers the cost
 * object returned by `/api/providers` (already BYOK- and multiplier-aware).
 */
export function resolveBlockModelCost(params: {
  model: string
  promptTokens: number
  completionTokens: number
  providerCost?: unknown
  isBYOK?: boolean
  useCachedInput?: boolean
}): BlockModelCost {
  if (params.isBYOK) {
    return { input: 0, output: 0, total: 0 }
  }

  const fromProvider = normalizeProviderCost(params.providerCost)
  if (fromProvider) return fromProvider

  const multiplier = getCostMultiplier()
  const cost = calculateCost(
    params.model,
    params.promptTokens,
    params.completionTokens,
    params.useCachedInput ?? false,
    multiplier,
    multiplier
  )

  return { input: cost.input, output: cost.output, total: cost.total }
}

/**
 * Placeholder returned for providers that use their own credential mechanism
 * rather than a user-supplied API key (e.g. AWS Bedrock via IAM/instance profiles).
 * Must be truthy so upstream key-presence checks don't reject it.
 */
export const PROVIDER_PLACEHOLDER_KEY = 'provider-uses-own-credentials'

/**
 * Get an API key for a specific provider, handling rotation and fallbacks
 * For use server-side only
 * @param provider - The provider name (e.g., 'openai', 'anthropic')
 * @param model - The model name
 * @param userProvidedKey - Optional user-provided API key (may contain template variables)
 * @param environmentVariables - Optional execution context environment variables to check as fallback
 */
export function getApiKey(
  provider: string,
  model: string,
  userProvidedKey?: string,
  environmentVariables?: Record<string, string>
): string {
  // Check if user-provided key is a valid key (not a template variable)
  const isResolvedKey =
    userProvidedKey && !userProvidedKey.includes('{{') && !userProvidedKey.includes('}}')
  const hasUserKey = !!isResolvedKey

  const isOllamaModel =
    provider === 'ollama' || useProvidersStore.getState().providers.ollama.models.includes(model)
  if (isOllamaModel) {
    return 'empty'
  }

  const isVllmModel =
    provider === 'vllm' || useProvidersStore.getState().providers.vllm.models.includes(model)
  if (isVllmModel) {
    return userProvidedKey || 'empty'
  }

  const isLitellmModel =
    provider === 'litellm' || useProvidersStore.getState().providers.litellm.models.includes(model)
  if (isLitellmModel) {
    return userProvidedKey || 'empty'
  }

  // Bedrock uses its own credentials (bedrockAccessKeyId/bedrockSecretKey), not apiKey
  const isBedrockModel = provider === 'bedrock' || model.startsWith('bedrock/')
  if (isBedrockModel) {
    return PROVIDER_PLACEHOLDER_KEY
  }

  const isOpenAIModel = provider === 'openai'
  const isClaudeModel = provider === 'anthropic'
  const isGeminiModel = provider === 'google'
  const isSambaNovaModel = provider === 'sambanova'
  const isZaiModel = provider === 'zai'
  const isXaiModel = provider === 'xai'
  const isKimiModel = provider === 'kimi'
  const isOpenRouterModel = provider === 'openrouter'

  if (
    isHosted &&
    (isOpenAIModel ||
      isClaudeModel ||
      isGeminiModel ||
      isSambaNovaModel ||
      isZaiModel ||
      isXaiModel ||
      isKimiModel)
  ) {
    // Only use server key if model is explicitly in our hosted list
    const hostedModels = getHostedModels()
    const isModelHosted = hostedModels.some((m) => m.toLowerCase() === model.toLowerCase())

    if (isModelHosted) {
      try {
        const { getRotatingApiKey } = require('@/lib/core/config/api-keys')
        // For Google/Gemini models, use the Google key namespace
        const serverKey = getRotatingApiKey(isGeminiModel ? 'google' : provider)
        return serverKey
      } catch (_error) {
        if (hasUserKey) {
          return userProvidedKey!
        }

        throw new Error(`No API key available for ${provider} ${model}`)
      }
    }
  }

  // If user provided a resolved key, use it
  if (hasUserKey) {
    return userProvidedKey!
  }

  // Try to get API key from environment variables if provided
  if (environmentVariables) {
    let envVarName: string | undefined
    if (isOpenAIModel) {
      envVarName = 'OPENAI_API_KEY'
    } else if (isClaudeModel) {
      envVarName = 'ANTHROPIC_API_KEY'
    } else if (isGeminiModel) {
      envVarName = 'GEMINI_API_KEY'
    } else if (isSambaNovaModel) {
      envVarName = 'SAMBANOVA_API_KEY'
    } else if (isXaiModel) {
      envVarName = 'XAI_API_KEY'
    } else if (isOpenRouterModel) {
      envVarName = 'OPENROUTER_API_KEY'
    }

    if (envVarName && environmentVariables[envVarName]) {
      return environmentVariables[envVarName]
    }
  }

  // Try to get API key from server environment variables as final fallback
  try {
    const { env } = require('@/lib/core/config/env')
    let serverEnvVarName: string | undefined
    if (isOpenAIModel) {
      serverEnvVarName = 'OPENAI_API_KEY'
    } else if (isClaudeModel) {
      serverEnvVarName = 'ANTHROPIC_API_KEY'
    } else if (isGeminiModel) {
      serverEnvVarName = 'GEMINI_API_KEY'
    } else if (isSambaNovaModel) {
      serverEnvVarName = 'SAMBANOVA_API_KEY'
    } else if (isXaiModel) {
      serverEnvVarName = 'XAI_API_KEY'
    } else if (isOpenRouterModel) {
      serverEnvVarName = 'OPENROUTER_API_KEY'
    }

    if (serverEnvVarName && env[serverEnvVarName as keyof typeof env]) {
      return env[serverEnvVarName as keyof typeof env] as string
    }
  } catch (_error) {
    // Server env not available, continue to error
  }

  // For all other cases, require user-provided key
  throw new Error(`API key is required for ${provider} ${model}`)
}

/**
 * Prepares tool configuration for provider requests with consistent tool usage control behavior
 *
 * @param tools Array of tools in provider-specific format
 * @param providerTools Original tool configurations with usage control settings
 * @param logger Logger instance to use for logging
 * @param provider Optional provider ID to adjust format for specific providers
 * @returns Object with prepared tools and tool_choice settings
 */
export function prepareToolsWithUsageControl(
  tools: any[] | undefined,
  providerTools: any[] | undefined,
  logger: any,
  provider?: string
): {
  tools: any[] | undefined
  toolChoice:
    | 'auto'
    | 'none'
    | { type: 'function'; function: { name: string } }
    | { type: 'tool'; name: string }
    | { type: 'any'; any: { model: string; name: string } }
    | undefined
  toolConfig?: {
    functionCallingConfig: {
      mode: 'AUTO' | 'ANY' | 'NONE'
      allowedFunctionNames?: string[]
    }
  }
  hasFilteredTools: boolean
  forcedTools: string[]
} {
  if (!tools || tools.length === 0) {
    return {
      tools: undefined,
      toolChoice: undefined,
      hasFilteredTools: false,
      forcedTools: [],
    }
  }

  const filteredTools = tools.filter((tool) => {
    const toolId = tool.function?.name || tool.name
    const toolConfig = providerTools?.find((t) => t.id === toolId)
    return toolConfig?.usageControl !== 'none'
  })

  const hasFilteredTools = filteredTools.length < tools.length
  if (hasFilteredTools) {
    logger.info(
      `Filtered out ${tools.length - filteredTools.length} tools with usageControl='none'`
    )
  }

  if (filteredTools.length === 0) {
    logger.info('All tools were filtered out due to usageControl="none"')
    return {
      tools: undefined,
      toolChoice: undefined,
      hasFilteredTools: true,
      forcedTools: [],
    }
  }

  const forcedTools = providerTools?.filter((tool) => tool.usageControl === 'force') || []
  const forcedToolIds = forcedTools.map((tool) => tool.id)

  let toolChoice:
    | 'auto'
    | 'none'
    | { type: 'function'; function: { name: string } }
    | { type: 'tool'; name: string }
    | { type: 'any'; any: { model: string; name: string } } = 'auto'

  let toolConfig:
    | {
        functionCallingConfig: {
          mode: 'AUTO' | 'ANY' | 'NONE'
          allowedFunctionNames?: string[]
        }
      }
    | undefined

  if (forcedTools.length > 0) {
    const forcedTool = forcedTools[0]

    if (provider === 'anthropic') {
      toolChoice = {
        type: 'tool',
        name: forcedTool.id,
      }
    } else if (provider === 'google') {
      toolConfig = {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: forcedTools.length === 1 ? [forcedTool.id] : forcedToolIds,
        },
      }
      toolChoice = 'auto'
    } else {
      toolChoice = {
        type: 'function',
        function: { name: forcedTool.id },
      }
    }

    logger.info(`Forcing use of tool: ${forcedTool.id}`)

    if (forcedTools.length > 1) {
      logger.info(
        `Multiple tools set to 'force' mode (${forcedToolIds.join(', ')}). Will cycle through them sequentially.`
      )
    }
  } else {
    toolChoice = 'auto'
    if (provider === 'google') {
      toolConfig = { functionCallingConfig: { mode: 'AUTO' } }
    }
    logger.info('Setting tool_choice to auto - letting model decide which tools to use')
  }

  return {
    tools: filteredTools,
    toolChoice,
    toolConfig,
    hasFilteredTools,
    forcedTools: forcedToolIds,
  }
}

/**
 * Narrows the SDK's `ChatCompletionMessageToolCall` union to its function variant.
 *
 * v5 of the `openai` SDK widened that union with a `custom` tool call carrying no `function`
 * field, so every `.function` access needs narrowing first. Sim only ever declares function
 * tools, so a custom call should not arrive.
 *
 * Deliberately tests for the `function` payload rather than `type === 'function'`: many
 * OpenAI-compatible vendors omit `type` on tool calls entirely, and discriminating on it would
 * silently drop every tool call those providers return. Total by construction, because these
 * same gateways are the ones that emit a malformed `tool_calls` entry, and this now runs on
 * every tool-bearing response.
 */
export function isFunctionToolCall(
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall
): toolCall is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall {
  return (
    typeof toolCall === 'object' &&
    toolCall !== null &&
    'function' in toolCall &&
    toolCall.function != null
  )
}

/**
 * Checks if a forced tool has been used in a response and manages the tool_choice accordingly
 *
 * @param toolCallsResponse Array of tool calls in the response
 * @param originalToolChoice The original tool_choice setting used in the request
 * @param logger Logger instance to use for logging
 * @param provider Optional provider ID to adjust format for specific providers
 * @param forcedTools Array of all tool IDs that should be forced in sequence
 * @param usedForcedTools Array of tool IDs that have already been used
 * @returns Object containing tracking information and next tool choice
 */
export function trackForcedToolUsage(
  toolCallsResponse: any[] | undefined,
  originalToolChoice: any,
  logger: any,
  provider?: string,
  forcedTools: string[] = [],
  usedForcedTools: string[] = []
): {
  hasUsedForcedTool: boolean
  usedForcedTools: string[]
  nextToolChoice?:
    | 'auto'
    | { type: 'function'; function: { name: string } }
    | { type: 'tool'; name: string }
    | { type: 'any'; any: { model: string; name: string } }
    | null
  nextToolConfig?: {
    functionCallingConfig: {
      mode: 'AUTO' | 'ANY' | 'NONE'
      allowedFunctionNames?: string[]
    }
  }
} {
  let hasUsedForcedTool = false
  let nextToolChoice = originalToolChoice
  let nextToolConfig:
    | {
        functionCallingConfig: {
          mode: 'AUTO' | 'ANY' | 'NONE'
          allowedFunctionNames?: string[]
        }
      }
    | undefined

  const updatedUsedForcedTools = [...usedForcedTools]

  const isGoogleFormat = provider === 'google'

  let forcedToolNames: string[] = []
  if (isGoogleFormat && originalToolChoice?.functionCallingConfig?.allowedFunctionNames) {
    forcedToolNames = originalToolChoice.functionCallingConfig.allowedFunctionNames
  } else if (
    typeof originalToolChoice === 'object' &&
    (originalToolChoice?.function?.name ||
      (originalToolChoice?.type === 'tool' && originalToolChoice?.name) ||
      (originalToolChoice?.type === 'any' && originalToolChoice?.any?.name))
  ) {
    forcedToolNames = [
      originalToolChoice?.function?.name ||
        originalToolChoice?.name ||
        originalToolChoice?.any?.name,
    ].filter(Boolean)
  }

  if (forcedToolNames.length > 0 && toolCallsResponse && toolCallsResponse.length > 0) {
    const toolNames = toolCallsResponse.map((tc) => tc.function?.name || tc.name || tc.id)

    const toolNameSet = new Set(toolNames)
    const usedTools = forcedToolNames.filter((toolName) => toolNameSet.has(toolName))

    if (usedTools.length > 0) {
      hasUsedForcedTool = true
      updatedUsedForcedTools.push(...usedTools)

      const usedSet = new Set(updatedUsedForcedTools)
      const remainingTools = forcedTools.filter((tool) => !usedSet.has(tool))

      if (remainingTools.length > 0) {
        const nextToolToForce = remainingTools[0]

        if (provider === 'anthropic') {
          nextToolChoice = {
            type: 'tool',
            name: nextToolToForce,
          }
        } else if (provider === 'google') {
          nextToolConfig = {
            functionCallingConfig: {
              mode: 'ANY',
              allowedFunctionNames:
                remainingTools.length === 1 ? [nextToolToForce] : remainingTools,
            },
          }
        } else {
          nextToolChoice = {
            type: 'function',
            function: { name: nextToolToForce },
          }
        }

        logger.info(
          `Forced tool(s) ${usedTools.join(', ')} used, switching to next forced tool(s): ${remainingTools.join(', ')}`
        )
      } else {
        if (provider === 'anthropic') {
          nextToolChoice = null
        } else if (provider === 'google') {
          nextToolConfig = { functionCallingConfig: { mode: 'AUTO' } }
        } else {
          nextToolChoice = 'auto'
        }

        logger.info('All forced tools have been used, switching to auto mode for future iterations')
      }
    }
  }

  return {
    hasUsedForcedTool,
    usedForcedTools: updatedUsedForcedTools,
    nextToolChoice: hasUsedForcedTool ? nextToolChoice : originalToolChoice,
    nextToolConfig: isGoogleFormat
      ? hasUsedForcedTool
        ? nextToolConfig
        : originalToolChoice
      : undefined,
  }
}

/**
 * Prepare tool execution parameters, separating tool parameters from system parameters
 */
export function prepareToolExecution(
  tool: {
    params?: Record<string, any>
    parameters?: Record<string, any>
    modelBlockedParams?: string[]
    paramsTransform?: (params: Record<string, any>) => Record<string, any>
  },
  llmArgs: Record<string, any>,
  request: {
    workflowId?: string
    workspaceId?: string
    chatId?: string
    userId?: string
    environmentVariables?: Record<string, any>
    workflowVariables?: Record<string, any>
    blockData?: Record<string, any>
    blockNameMapping?: Record<string, string>
    isDeployedContext?: boolean
    callChain?: string[]
    billingAttribution?: BillingAttributionSnapshot
    /** Invoking run's execution id — see `ProviderRequest.executionId`. */
    executionId?: string
  }
): {
  toolParams: Record<string, any>
  executionParams: Record<string, any>
} {
  // Providers are supposed to emit only declared arguments, but nothing enforces
  // it on the parsed tool call — and `mergeToolParameters` seeds its result from
  // the model's args, so an undeclared key survives whenever the user's value is
  // empty. That is a privilege escalation for `user-only` params: a Function tool
  // scoped to "Selected secrets" with an empty list is an explicit deny, and a
  // model emitting `mountedSecrets: ['STRIPE_KEY']` would otherwise mount it.
  const modelParams = stripModelBlockedParams(tool.modelBlockedParams, llmArgs)
  const modelInputRegistry = getProviderToolModelInputRegistry(tool)
  const modelReferenceResolution = modelInputRegistry?.resolveModelExposedEnvReferences(modelParams)
  if (modelReferenceResolution && !modelReferenceResolution.complete) {
    throw new Error('Agent tool input environment references could not be safely resolved')
  }
  const resolvedModelParams = modelReferenceResolution?.value ?? modelParams
  let toolParams = mergeToolParameters(tool.params || {}, resolvedModelParams)
  const inputProvenance = getProviderToolInputProvenance(tool)
  let inputRegistry = inputProvenance?.registry.forkForInputPaths([inputProvenance.sourcePath])
  if (modelReferenceResolution?.matched) {
    if (inputRegistry) {
      inputRegistry.mergeToolCallRegistry(modelReferenceResolution.registry)
    } else {
      inputRegistry = modelReferenceResolution.registry
    }
  }
  if (inputRegistry && !inputRegistry.isComplete()) {
    throw new Error('Agent tool input environment references could not be safely resolved')
  }
  let projectedToolParams = inputRegistry
    ? mergeToolParameters(inputProvenance?.projectedParams ?? tool.params ?? {}, modelParams)
    : undefined

  if (tool.paramsTransform) {
    let transformed = false
    try {
      toolParams = tool.paramsTransform(toolParams)
      transformed = true
    } catch (err) {
      logger.warn('paramsTransform failed, using raw params', { error: err })
    }

    if (transformed && projectedToolParams && inputRegistry) {
      try {
        projectedToolParams = tool.paramsTransform(projectedToolParams)
      } catch {
        inputRegistry.markIncomplete('tool-params-transform-failed')
        projectedToolParams = undefined
      }
    }
  }

  const executionParams = {
    ...toolParams,
    ...(request.workflowId || request.billingAttribution
      ? {
          _context: {
            ...(request.workflowId ? { workflowId: request.workflowId } : {}),
            ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
            ...(request.chatId ? { chatId: request.chatId } : {}),
            ...(request.userId ? { userId: request.userId } : {}),
            ...(request.isDeployedContext !== undefined
              ? { isDeployedContext: request.isDeployedContext }
              : {}),
            ...(request.callChain ? { callChain: request.callChain } : {}),
            ...(request.executionId ? { executionId: request.executionId } : {}),
            ...(request.billingAttribution
              ? { billingAttribution: request.billingAttribution }
              : {}),
          },
        }
      : {}),
    ...(request.environmentVariables
      ? { envVars: normalizeStringRecord(request.environmentVariables) }
      : {}),
    ...(request.workflowVariables
      ? { workflowVariables: normalizeWorkflowVariables(request.workflowVariables) }
      : {}),
    ...(request.blockData ? { blockData: normalizeRecord(request.blockData) } : {}),
    ...(request.blockNameMapping
      ? { blockNameMapping: normalizeStringRecord(request.blockNameMapping) }
      : {}),
    ...(tool.parameters ? { _toolSchema: tool.parameters } : {}),
  }

  if (inputRegistry) {
    const inputPaths = [['params']] as const
    if (projectedToolParams) {
      inputRegistry.recordTransformedInputProjection(
        { params: toolParams },
        { params: projectedToolParams }
      )
    }
    registerPreparedProviderToolInputProvenance(executionParams, {
      registry: inputRegistry,
      inputPaths,
    })
  }

  return { toolParams, executionParams }
}

/**
 * Checks if a forced tool was used in an OpenAI-compatible response and updates tracking.
 * This is a shared utility used by OpenAI-compatible providers:
 * OpenAI, Groq, DeepSeek, xAI, OpenRouter, Mistral, Ollama, vLLM, Azure OpenAI, Cerebras
 *
 * @param response - The API response containing tool calls
 * @param toolChoice - The tool choice configuration (string or object)
 * @param providerName - Name of the provider for logging purposes
 * @param forcedTools - Array of forced tool names
 * @param usedForcedTools - Array of already used forced tools
 * @param customLogger - Optional custom logger instance
 * @returns Object with hasUsedForcedTool flag and updated usedForcedTools array
 */
export function checkForForcedToolUsageOpenAI(
  response: OpenAI.Chat.Completions.ChatCompletion,
  toolChoice: string | { type: string; function?: { name: string }; name?: string },
  providerName: string,
  forcedTools: string[],
  usedForcedTools: string[],
  customLogger?: Logger
): { hasUsedForcedTool: boolean; usedForcedTools: string[] } {
  const checkLogger = customLogger || createLogger(`${providerName}Utils`)
  let hasUsedForcedTool = false
  let updatedUsedForcedTools = [...usedForcedTools]

  const toolCallsResponse =
    typeof toolChoice === 'object'
      ? response.choices?.[0]?.message?.tool_calls?.filter(isFunctionToolCall)
      : undefined
  if (toolCallsResponse?.length) {
    const result = trackForcedToolUsage(
      toolCallsResponse,
      toolChoice,
      checkLogger,
      providerName.toLowerCase().replace(/\s+/g, '-'),
      forcedTools,
      updatedUsedForcedTools
    )
    hasUsedForcedTool = result.hasUsedForcedTool
    updatedUsedForcedTools = result.usedForcedTools
  }

  return { hasUsedForcedTool, usedForcedTools: updatedUsedForcedTools }
}
