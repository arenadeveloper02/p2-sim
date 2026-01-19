import { createLogger } from '@sim/logger'
import * as Papa from 'papaparse'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { AGENT, isCustomTool } from '@/executor/constants'
import { useCustomToolsStore } from '@/stores/custom-tools/store'
import { useEnvironmentStore } from '@/stores/settings/environment/store'
import { tools } from '@/tools/registry'
import type { TableRow, ToolConfig, ToolResponse } from '@/tools/types'

const logger = createLogger('ToolsUtils')

/**
 * Transforms a table from the store format to a key-value object
 * @param table Array of table rows from the store
 * @returns Record of key-value pairs
 */
export const transformTable = (table: TableRow[] | null): Record<string, any> => {
  if (!table) return {}

  return table.reduce(
    (acc, row) => {
      if (row.cells?.Key && row.cells?.Value !== undefined) {
        // Extract the Value cell as is - it should already be properly resolved
        // by the InputResolver based on variable type (number, string, boolean etc.)
        const value = row.cells.Value

        // Store the correctly typed value in the result object
        acc[row.cells.Key] = value
      }
      return acc
    },
    {} as Record<string, any>
  )
}

interface RequestParams {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

/**
 * Safely stringify a value to JSON, handling circular references and large objects
 * @param value - The value to stringify
 * @param context - Context for error messages (e.g., toolId)
 * @returns Stringified JSON
 * @throws Error if stringification fails
 */
export function safeStringify(value: any, context = 'unknown'): string {
  if (typeof value === 'string') {
    return value
  }

  // Use a WeakSet to track circular references
  const seen = new WeakSet()

  // Create the replacer function that will be used in JSON.stringify
  const replacer = (key: string, val: any): any => {
    // Handle undefined - JSON.stringify omits undefined, but we want to be explicit
    if (val === undefined) {
      return undefined
    }

    // Handle functions - replace with a placeholder
    if (typeof val === 'function') {
      return '[Function]'
    }

    // Handle Symbols - replace with a placeholder
    if (typeof val === 'symbol') {
      return '[Symbol]'
    }

    // Handle circular references
    if (val !== null && typeof val === 'object') {
      if (seen.has(val)) {
        return '[Circular Reference]'
      }
      seen.add(val)
    }

    return val
  }

  try {
    return JSON.stringify(value, replacer)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Check if it's a circular reference error
    if (
      errorMessage.includes('circular') ||
      errorMessage.includes('Converting circular structure')
    ) {
      logger.error(`Circular reference detected during JSON stringify in ${context}`, {
        error: errorMessage,
      })
      throw new Error(
        `Cannot stringify data: circular reference detected. This may occur when data structures reference themselves.`
      )
    }

    // Check if it's a size-related error
    if (errorMessage.includes('Invalid string length') || errorMessage.includes('too large')) {
      logger.error(`Data too large to stringify in ${context}`, {
        error: errorMessage,
        valueType: typeof value,
        isArray: Array.isArray(value),
        arrayLength: Array.isArray(value) ? value.length : undefined,
      })
      throw new Error(
        `Cannot stringify data: data is too large. Try reducing the size of the data being sent.`
      )
    }

    // Generic error
    logger.error(`Failed to stringify JSON in ${context}`, {
      error: errorMessage,
      valueType: typeof value,
      isArray: Array.isArray(value),
      arrayLength: Array.isArray(value) ? value.length : undefined,
    })
    throw new Error(
      `Failed to convert data to JSON: ${errorMessage}. The data may contain invalid values or be too large.`
    )
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
      let errorContent
      try {
        errorContent = await externalResponse.json()
      } catch (_e) {
        errorContent = { message: externalResponse.statusText }
      }

      const error = errorContent.message || `${toolId} API error: ${externalResponse.statusText}`
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
      workflowId: workflowId, // Pass workflowId for server-side context
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
    const customToolsStore = useCustomToolsStore.getState()
    const identifier = toolId.slice(AGENT.CUSTOM_TOOL_PREFIX.length)

    // Try to find the tool directly by ID first
    let customTool = customToolsStore.getTool(identifier)

    // If not found by ID, try to find by title (for backward compatibility)
    if (!customTool) {
      const allTools = customToolsStore.getAllTools()
      customTool = allTools.find((tool) => tool.title === identifier)
    }

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
    return getCustomTool(toolId, workflowId)
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

// Create a tool config from a custom tool definition
async function getCustomTool(
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
