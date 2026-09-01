import { createUserToolSchema } from '@/tools/params'
import { getTool, resolveToolId } from '@/tools/utils'

const LOCAL_INVOKE_NOTE =
  'Arena Copilot: call invoke_integration_tool({ toolId: "<id>", params: { ... } }) or the Cloud alias call_integration_tool({ toolId, arguments }). Pass credentialId from connectedIntegrations for OAuth tools — prefer isOwn: true (the signed-in user\'s account). When the user has one matching own credential, or only one matching credential exists, Arena injects credentialId automatically. For Gmail separate drafts, call once per recipient with a single email in params.to / arguments.to — never put multiple recipients in one draft when the user asked for separate drafts. load_integration_tool is optional here (it only records ids and returns params).'

interface ListedIntegrationTool {
  id: string
  operation?: string
  name?: string
  description?: string
  paramsSchema?: ReturnType<typeof createUserToolSchema>
  [key: string]: unknown
}

/**
 * Rewrites shared Cloud `list_integration_tools` output for Arena Copilot:
 * - Points at `invoke_integration_tool` / `call_integration_tool`
 * - Attaches each tool's parameter schema so the model can pass valid params
 */
export function adaptListIntegrationToolsForLocal(output: unknown): unknown {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return output
  }

  const record = output as Record<string, unknown>
  const listed = Array.isArray(record.tools) ? record.tools : []

  const tools: ListedIntegrationTool[] = listed.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { id: '', ...(entry as object) } as ListedIntegrationTool
    }
    const toolEntry = entry as ListedIntegrationTool
    const toolId = typeof toolEntry.id === 'string' ? toolEntry.id : ''
    if (!toolId) return toolEntry

    const registryTool = getTool(resolveToolId(toolId))
    if (!registryTool) return toolEntry

    return {
      ...toolEntry,
      paramsSchema: createUserToolSchema(registryTool, { surface: 'copilot' }),
    }
  })

  return {
    ...record,
    note: LOCAL_INVOKE_NOTE,
    tools,
  }
}
