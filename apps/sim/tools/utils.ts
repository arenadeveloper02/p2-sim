import { createLogger } from '@sim/logger'
import * as Papa from 'papaparse'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { AGENT, isCustomTool } from '@/executor/constants'
import { getCustomTool } from '@/hooks/queries/custom-tools'
import { useEnvironmentStore } from '@/stores/settings/environment'
import { extractErrorMessage } from '@/tools/error-extractors'
import { tools } from '@/tools/registry'
import type { ToolConfig, ToolResponse } from '@/tools/types'

const logger = createLogger('ToolsUtils')

/**
 * Strips version suffix (_v2, _v3, etc.) from a tool ID or name
 * @example stripVersionSuffix('notion_search_v2') => 'notion_search'
 * @example stripVersionSuffix('github_create_pr_v3') => 'github_create_pr'
 */
export function stripVersionSuffix(name: string): string {
  return name.replace(/_v\d+$/, '')
}

/**
 * Filters a tools map to return only the latest version of each tool.
 * If both `notion_search` and `notion_search_v2` exist, only `notion_search_v2` is returned.
 * @param toolsMap Record of tool ID to ToolConfig
 * @returns Filtered record containing only the latest version of each tool
 */
export function getLatestVersionTools(
  toolsMap: Record<string, ToolConfig>
): Record<string, ToolConfig> {
  const latestTools: Record<string, ToolConfig> = {}
  const baseNameToVersions: Record<string, { toolId: string; version: number }[]> = {}

  for (const toolId of Object.keys(toolsMap)) {
    const baseName = stripVersionSuffix(toolId)
    const versionMatch = toolId.match(/_v(\d+)$/)
    const version = versionMatch ? Number.parseInt(versionMatch[1], 10) : 1

    if (!baseNameToVersions[baseName]) {
      baseNameToVersions[baseName] = []
    }
    baseNameToVersions[baseName].push({ toolId, version })
  }

  for (const versions of Object.values(baseNameToVersions)) {
    const latest = versions.reduce((prev, curr) => (curr.version > prev.version ? curr : prev))
    latestTools[latest.toolId] = toolsMap[latest.toolId]
  }

  return latestTools
}

/**
 * Resolves a tool name to its actual tool ID in the registry.
 * Handles both stripped names (e.g., 'notion_search') and versioned names (e.g., 'notion_search_v2').
 * @param toolName The tool name to resolve (may or may not have version suffix)
 * @returns The actual tool ID in the registry, or the original name if not found
 */
export function resolveToolId(toolName: string): string {
  if (tools[toolName]) {
    return toolName
  }

  const latestTools = getLatestVersionTools(tools)
  for (const toolId of Object.keys(latestTools)) {
    if (stripVersionSuffix(toolId) === toolName) {
      return toolId
    }
  }

  return toolName
}

interface RequestParams {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

/**
 * Values that are guaranteed to be JSON.stringify-compatible
 */
export type JSONSafePrimitive = string | number | boolean | null

export type JSONSafeValue = JSONSafePrimitive | JSONSafeValue[] | { [key: string]: JSONSafeValue }

/**
 * Internal helper that:
 * - Removes real circular references
 * - Preserves shared references
 * - Converts `undefined → null` ONLY inside arrays
 * - Drops `undefined` inside objects
 */
function decycle(
  value: unknown,
  stack: WeakSet<object>,
  inArray: boolean
): JSONSafeValue | undefined {
  // Preserve top-level undefined (caller decides)
  if (value === undefined) {
    return inArray ? null : undefined
  }

  // JSON primitives
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  // Unsupported JSON values
  if (typeof value === 'function') {
    return '[Function]'
  }

  if (typeof value === 'symbol') {
    return '[Symbol]'
  }

  // Non-object, non-JSON values
  if (typeof value !== 'object') {
    return inArray ? null : undefined
  }

  // Circular reference detection (path-based)
  if (stack.has(value)) {
    return '[Circular Reference]'
  }

  stack.add(value)

  let result: JSONSafeValue

  if (Array.isArray(value)) {
    const arr = value as unknown[]
    result = arr.map((item) => {
      const processed = decycle(item, stack, true)
      return processed === undefined ? null : processed
    })
  } else {
    const obj = value as Record<string, unknown>
    const cloned: Record<string, JSONSafeValue> = {}

    for (const key of Object.keys(obj)) {
      const processed = decycle(obj[key], stack, false)
      if (processed !== undefined) {
        cloned[key] = processed
      }
    }

    result = cloned
  }

  stack.delete(value)
  return result
}

/**
 * Safely stringifies data for:
 * - Logging
 * - APIs
 * - Google Sheets (2D arrays)
 *
 * Guarantees:
 * - Top-level `undefined` → returns undefined
 * - Arrays never contain `undefined`
 * - Objects never contain `undefined` keys
 * - Circular references are replaced
 */
export function safeStringify(value: unknown, context = 'unknown'): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    const safeValue: JSONSafeValue | undefined = decycle(value, new WeakSet<object>(), false)

    if (safeValue === undefined) {
      return undefined
    }

    return JSON.stringify(safeValue)
  } catch (error: unknown) {
    const errorMessage: string = error instanceof Error ? error.message : String(error)

    if (
      errorMessage.includes('circular') ||
      errorMessage.includes('Converting circular structure')
    ) {
      logger.error(`Circular reference detected during JSON stringify in ${context}`, {
        error: errorMessage,
      })
      throw new Error('Cannot stringify data: circular reference detected.')
    }

    if (errorMessage.includes('Invalid string length') || errorMessage.includes('too large')) {
      logger.error(`Data too large to stringify in ${context}`, {
        error: errorMessage,
      })
      throw new Error('Cannot stringify data: data is too large.')
    }

    logger.error(`Failed to stringify JSON in ${context}`, {
      error: errorMessage,
    })

    throw new Error(`Failed to convert data to JSON: ${errorMessage}`)
  }
}

/**
 * Format request parameters based on tool configuration and provided params
 */
export async function formatRequestParams(
  tool: ToolConfig,
  params: Record<string, any>
): Promise<RequestParams> {
  // Process URL
  const url = typeof tool.request.url === 'function' ? tool.request.url(params) : tool.request.url

  // Check if the URL function returned an error response
  // This should be handled upstream, but we check here to prevent crashes
  if (url && typeof url === 'object' && '_errorResponse' in url) {
    throw new Error(
      url._errorResponse?.data?.error?.message ||
        url._errorResponse?.data?.message ||
        'Tool request validation failed'
    )
  }

  // Process method
  const method =
    typeof tool.request.method === 'function'
      ? tool.request.method(params)
      : params.method || tool.request.method || 'GET'

  // Process headers
  const headers = tool.request.headers ? tool.request.headers(params) : {}

  // Process body
  const hasBody = method !== 'GET' && method !== 'HEAD' && !!tool.request.body
  const bodyResult = tool.request.body ? await tool.request.body(params) : undefined

  // Special handling for NDJSON content type or 'application/x-www-form-urlencoded'
  const isPreformattedContent =
    headers['Content-Type'] === 'application/x-ndjson' ||
    headers['Content-Type'] === 'application/x-www-form-urlencoded'

  let body: string | undefined
  if (hasBody) {
    if (isPreformattedContent) {
      // Check if bodyResult is a string
      if (typeof bodyResult === 'string') {
        body = bodyResult
      }
      // Check if bodyResult is an object with a 'body' property (Twilio pattern)
      else if (bodyResult && typeof bodyResult === 'object' && 'body' in bodyResult) {
        body = bodyResult.body
      }
      // Otherwise JSON stringify it
      else {
        body = safeStringify(bodyResult, tool.id || 'unknown')
      }
    } else {
      body =
        typeof bodyResult === 'string'
          ? bodyResult
          : safeStringify(bodyResult, tool.id || 'unknown')
    }

    // Validate the JSON is parseable before returning
    if (body && !isPreformattedContent) {
      try {
        JSON.parse(body)
      } catch (parseError) {
        logger.error(`Generated invalid JSON in formatRequestParams for ${tool.id || 'unknown'}`, {
          error: parseError instanceof Error ? parseError.message : String(parseError),
          bodyLength: body.length,
          bodyPreview: body.substring(0, 200),
        })
        throw new Error(
          `Failed to generate valid JSON for request body. This may be due to circular references or invalid data structures.`
        )
      }
    }
  }

  return { url, method, headers, body }
}

/**
 * Execute the actual request and transform the response
 */
export async function executeRequest(
  toolId: string,
  tool: ToolConfig,
  requestParams: RequestParams
): Promise<ToolResponse> {
  try {
    const { url, method, headers, body } = requestParams

    const externalResponse = await fetch(url, { method, headers, body })

    if (!externalResponse.ok) {
      let errorData: any
      try {
        errorData = await externalResponse.json()
      } catch (_e) {
        try {
          errorData = await externalResponse.text()
        } catch (_e2) {
          errorData = null
        }
      }

      const error = extractErrorMessage({
        status: externalResponse.status,
        statusText: externalResponse.statusText,
        data: errorData,
      })
      logger.error(`${toolId} error:`, { error })
      throw new Error(error)
    }

    const transformResponse =
      tool.transformResponse ||
      (async (resp: Response) => ({
        success: true,
        output: await resp.json(),
      }))

    return await transformResponse(externalResponse)
  } catch (error: any) {
    return {
      success: false,
      output: {},
      error: error.message || 'Unknown error',
    }
  }
}

/**
 * Formats a parameter name for user-friendly error messages
 * Converts parameter names and descriptions to more readable format
 */
function formatParameterNameForError(paramName: string): string {
  // Split camelCase and snake_case/kebab-case into words, then capitalize first letter of each word
  return paramName
    .split(/(?=[A-Z])|[_-]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Validates required parameters after LLM and user params have been merged
 * This is the final validation before tool execution - ensures all required
 * user-or-llm parameters are present after the merge process
 */
export function validateRequiredParametersAfterMerge(
  toolId: string,
  tool: ToolConfig | undefined,
  params: Record<string, any>,
  parameterNameMap?: Record<string, string>
): void {
  if (!tool) {
    throw new Error(`Tool not found: ${toolId}`)
  }

  // Validate all required user-or-llm parameters after merge
  // user-only parameters should have been validated earlier during serialization
  for (const [paramName, paramConfig] of Object.entries(tool.params)) {
    if (
      (paramConfig as any).visibility === 'user-or-llm' &&
      paramConfig.required &&
      (!(paramName in params) ||
        params[paramName] === null ||
        params[paramName] === undefined ||
        params[paramName] === '')
    ) {
      // Create a more user-friendly error message
      const toolName = tool.name || toolId
      const friendlyParamName =
        parameterNameMap?.[paramName] || formatParameterNameForError(paramName)
      throw new Error(`${friendlyParamName} is required for ${toolName}`)
    }
  }
}

/**
 * Creates parameter schema from custom tool schema
 */
export function createParamSchema(customTool: any): Record<string, any> {
  const params: Record<string, any> = {}

  if (customTool.schema.function?.parameters?.properties) {
    const properties = customTool.schema.function.parameters.properties
    const required = customTool.schema.function.parameters.required || []

    Object.entries(properties).forEach(([key, config]: [string, any]) => {
      const isRequired = required.includes(key)

      // Create the base parameter configuration
      const paramConfig: Record<string, any> = {
        type: config.type || 'string',
        required: isRequired,
        description: config.description || '',
      }

      // Set visibility based on whether it's required
      if (isRequired) {
        paramConfig.visibility = 'user-or-llm'
      } else {
        paramConfig.visibility = 'user-only'
      }

      params[key] = paramConfig
    })
  }

  return params
}

/**
 * Get environment variables from store (client-side only)
 * @param getStore Optional function to get the store (useful for testing)
 */
export function getClientEnvVars(getStore?: () => any): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    // Allow injecting the store for testing
    const envStore = getStore ? getStore() : useEnvironmentStore.getState()
    const allEnvVars = envStore.getAllVariables()

    // Convert environment variables to a simple key-value object
    return Object.entries(allEnvVars).reduce(
      (acc, [key, variable]: [string, any]) => {
        acc[key] = variable.value
        return acc
      },
      {} as Record<string, string>
    )
  } catch (_error) {
    // In case of any errors (like in testing), return empty object
    return {}
  }
}

/**
 * Creates the request body configuration for custom tools
 * @param customTool The custom tool configuration
 * @param isClient Whether running on client side
 * @param workflowId Optional workflow ID for server-side
 * @param getStore Optional function to get the store (useful for testing)
 */
export function createCustomToolRequestBody(
  customTool: any,
  isClient = true,
  workflowId?: string,
  getStore?: () => any
) {
  return (params: Record<string, any>) => {
    // Get environment variables - try multiple sources in order of preference:
    // 1. envVars parameter (passed from provider/agent context)
    // 2. Client-side store (if running in browser)
    // 3. Empty object (fallback)
    const envVars = params.envVars || (isClient ? getClientEnvVars(getStore) : {})

    // Get workflow variables from params (passed from execution context)
    const workflowVariables = params.workflowVariables || {}

    // Get block data and mapping from params (passed from execution context)
    const blockData = params.blockData || {}
    const blockNameMapping = params.blockNameMapping || {}

    // Include everything needed for execution
    return {
      code: customTool.code,
      params: params, // These will be available in the VM context
      schema: customTool.schema.function.parameters, // For validation
      envVars: envVars, // Environment variables
      workflowVariables: workflowVariables, // Workflow variables for <variable.name> resolution
      blockData: blockData, // Runtime block outputs for <block.field> resolution
      blockNameMapping: blockNameMapping, // Block name to ID mapping
      workflowId: params._context?.workflowId || workflowId, // Pass workflowId for server-side context
      userId: params._context?.userId, // Pass userId for auth context
      isCustomTool: true, // Flag to indicate this is a custom tool execution
    }
  }
}

// Get a tool by its ID
export function getTool(toolId: string): ToolConfig | undefined {
  // Check for built-in tools
  const builtInTool = tools[toolId]
  if (builtInTool) return builtInTool

  // Check if it's a custom tool
  if (isCustomTool(toolId) && typeof window !== 'undefined') {
    // Only try to use the sync version on the client
    const identifier = toolId.slice(AGENT.CUSTOM_TOOL_PREFIX.length)

    // Try to find the tool from query cache (extracts workspaceId from URL)
    const customTool = getCustomTool(identifier)

    if (customTool) {
      return createToolConfig(customTool, toolId)
    }
  }

  // If not found or running on the server, return undefined
  return undefined
}

// Get a tool by its ID asynchronously (supports server-side)
export async function getToolAsync(
  toolId: string,
  workflowId?: string
): Promise<ToolConfig | undefined> {
  // Check for built-in tools
  const builtInTool = tools[toolId]
  if (builtInTool) return builtInTool

  // Check if it's a custom tool
  if (isCustomTool(toolId)) {
    return fetchCustomToolFromAPI(toolId, workflowId)
  }

  return undefined
}

// Helper function to create a tool config from a custom tool
function createToolConfig(customTool: any, customToolId: string): ToolConfig {
  // Create a parameter schema from the custom tool schema
  const params = createParamSchema(customTool)

  // Create a tool config for the custom tool
  return {
    id: customToolId,
    name: customTool.title,
    description: customTool.schema.function?.description || '',
    version: '1.0.0',
    params,

    // Request configuration - for custom tools we'll use the execute endpoint
    request: {
      url: '/api/function/execute',
      method: 'POST',
      headers: () => ({ 'Content-Type': 'application/json' }),
      body: createCustomToolRequestBody(customTool, true),
    },

    // Standard response handling for custom tools
    transformResponse: async (response: Response) => {
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Custom tool execution failed')
      }

      return {
        success: true,
        output: data.output.result || data.output,
        error: undefined,
      }
    },
  }
}

// Create a tool config from a custom tool definition by fetching from API
async function fetchCustomToolFromAPI(
  customToolId: string,
  workflowId?: string
): Promise<ToolConfig | undefined> {
  const identifier = customToolId.replace('custom_', '')

  try {
    const baseUrl = getBaseUrl()
    const url = new URL('/api/tools/custom', baseUrl)

    // Add workflowId as a query parameter if available
    if (workflowId) {
      url.searchParams.append('workflowId', workflowId)
    }

    // For server-side calls (during workflow execution), use internal JWT token
    const headers: Record<string, string> = {}
    if (typeof window === 'undefined') {
      try {
        const { generateInternalToken } = await import('@/lib/auth/internal')
        const internalToken = await generateInternalToken()
        headers.Authorization = `Bearer ${internalToken}`
      } catch (error) {
        logger.warn('Failed to generate internal token for custom tools fetch', { error })
        // Continue without token - will fail auth and be reported upstream
      }
    }

    const response = await fetch(url.toString(), {
      headers,
    })

    if (!response.ok) {
      logger.error(`Failed to fetch custom tools: ${response.statusText}`)
      return undefined
    }

    const result = await response.json()

    if (!result.data || !Array.isArray(result.data)) {
      logger.error(`Invalid response when fetching custom tools: ${JSON.stringify(result)}`)
      return undefined
    }

    // Try to find the tool by ID or title
    const customTool = result.data.find(
      (tool: any) => tool.id === identifier || tool.title === identifier
    )

    if (!customTool) {
      logger.error(`Custom tool not found: ${identifier}`)
      return undefined
    }

    // Create a parameter schema
    const params = createParamSchema(customTool)

    // Create a tool config for the custom tool
    return {
      id: customToolId,
      name: customTool.title,
      description: customTool.schema.function?.description || '',
      version: '1.0.0',
      params,

      // Request configuration - for custom tools we'll use the execute endpoint
      request: {
        url: '/api/function/execute',
        method: 'POST',
        headers: () => ({ 'Content-Type': 'application/json' }),
        body: createCustomToolRequestBody(customTool, false, workflowId),
      },

      // Same response handling as client-side
      transformResponse: async (response: Response) => {
        const data = await response.json()

        if (!data.success) {
          throw new Error(data.error || 'Custom tool execution failed')
        }

        return {
          success: true,
          output: data.output.result || data.output,
          error: undefined,
        }
      },
    }
  } catch (error) {
    logger.error(`Error fetching custom tool ${identifier} from API:`, error)
    return undefined
  }
}

export interface CsvParseOptions {
  /**
   * CSV delimiter. Defaults to ',' (comma).
   * Common delimiters: ',' (comma), ';' (semicolon), '\t' (tab)
   */
  delimiter?: string
  /**
   * Whether the first row contains headers. Defaults to true.
   */
  header?: boolean
  /**
   * Whether to skip empty lines. Defaults to true.
   */
  skipEmptyLines?: boolean
  /**
   * Whether to trim whitespace from values. Defaults to true.
   */
  trimHeaders?: boolean
  /**
   * Whether to trim whitespace from values. Defaults to true.
   */
  trimValues?: boolean
}

export interface CsvParseResult {
  /**
   * Parsed data as an array of objects (if header: true) or arrays (if header: false)
   */
  data: Array<Record<string, string>> | string[][]
  /**
   * Column headers (if header: true)
   */
  headers: string[]
  /**
   * Total number of data rows (excluding header)
   */
  totalRows: number
  /**
   * Raw CSV text that was parsed
   */
  rawCsv: string
  /**
   * Any parsing errors encountered
   */
  errors: Papa.ParseError[]
}

/**
 * Generic CSV parser for API responses using papaparse.
 * Supports different delimiters (comma, semicolon, tab) and can be used by any tool
 * that receives CSV responses from external APIs.
 *
 * @param csvText - Raw CSV text from API response
 * @param options - Parsing options
 * @returns Parsed CSV data with headers and rows
 *
 * @example
 * ```typescript
 * // Parse semicolon-delimited CSV (e.g., Semrush)
 * const result = parseCsvResponse(csvText, { delimiter: ';' })
 *
 * // Parse comma-delimited CSV (default)
 * const result = parseCsvResponse(csvText)
 *
 * // Parse CSV without headers
 * const result = parseCsvResponse(csvText, { header: false })
 * ```
 */
export function parseCsvResponse(csvText: string, options: CsvParseOptions = {}): CsvParseResult {
  const {
    delimiter = ',',
    header = true,
    skipEmptyLines = true,
    trimHeaders = true,
    trimValues = true,
  } = options

  if (!csvText || csvText.trim().length === 0) {
    logger.warn('Empty CSV text provided')
    return {
      data: header ? [] : [],
      headers: [],
      totalRows: 0,
      rawCsv: csvText,
      errors: [],
    }
  }

  try {
    const parseOptions: Papa.ParseConfig = {
      delimiter,
      header,
      skipEmptyLines,
      transformHeader: trimHeaders
        ? (header: string) => String(header).trim()
        : (header: string) => String(header),
      transform: trimValues
        ? (value: string) => String(value || '').trim()
        : (value: string) => String(value || ''),
    }

    const parseResult = Papa.parse<string[] | Record<string, string>>(csvText, parseOptions)

    // Log parsing errors if any (non-fatal)
    if (parseResult.errors && parseResult.errors.length > 0) {
      logger.warn('CSV parsing warnings', {
        errors: parseResult.errors,
        errorCount: parseResult.errors.length,
      })
    }

    let headers: string[] = []
    let data: Array<Record<string, string>> | string[][]
    let totalRows: number

    if (header) {
      // Headers are in meta.fields when header: true
      headers = parseResult.meta.fields || []
      data = parseResult.data as Array<Record<string, string>>
      totalRows = data.length
    } else {
      // First row is treated as data when header: false
      const allRows = parseResult.data as string[][]
      if (allRows.length > 0) {
        // Use first row as headers for consistency
        headers = allRows[0] || []
        data = allRows.slice(1)
        totalRows = data.length
      } else {
        headers = []
        data = []
        totalRows = 0
      }
    }

    logger.info('CSV parsed successfully', {
      delimiter,
      header,
      totalRows,
      columnCount: headers.length,
      hasErrors: parseResult.errors && parseResult.errors.length > 0,
    })

    return {
      data,
      headers,
      totalRows,
      rawCsv: csvText,
      errors: parseResult.errors || [],
    }
  } catch (error) {
    logger.error('CSV parsing failed', {
      error: error instanceof Error ? error.message : String(error),
      delimiter,
      preview: csvText.substring(0, 200),
    })
    throw new Error(
      `Failed to parse CSV response: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
