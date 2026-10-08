import { createLogger } from '@sim/logger'
import { isRecordLike } from '@sim/utils/object'
import { z } from 'zod'
import { getValidationErrorMessage, isZodError } from '@/lib/api/server/validation'
import { OrchestrationError } from '@/lib/core/orchestration/types'
import { getBlockVisibilityForCopilot } from '@/lib/mothership/block-visibility'
import {
  Ffmpeg,
  GenerateAudio,
  GenerateImage,
  GenerateVideo,
} from '@/lib/mothership/generated/tool-catalog-v1'
import { ARENA_SERVER_TOOL_SCHEMA_ALIASES } from '@/lib/mothership/tools/arena-server-tool-aliases'
import { copilotToolCanWrite } from '@/lib/mothership/tools/permissions'
import {
  assertServerToolNotAborted,
  type BaseServerTool,
  type ServerToolContext,
} from '@/lib/mothership/tools/server/base-tool'
import { getBlocksMetadataServerTool } from '@/lib/mothership/tools/server/blocks/get-blocks-metadata-tool'
import { dashboardsServerTool } from '@/lib/mothership/tools/server/dashboards'
import { searchDocsServerTool } from '@/lib/mothership/tools/server/docs/search-docs'
import { createFileServerTool } from '@/lib/mothership/tools/server/files/create-file'
import { editContentServerTool } from '@/lib/mothership/tools/server/files/edit-content'
import { workspaceFileServerTool } from '@/lib/mothership/tools/server/files/workspace-file'
import { validateGeneratedToolPayload } from '@/lib/mothership/tools/server/generated-schema'
import { generateImageServerTool } from '@/lib/mothership/tools/server/image/generate-image'
import { normalizeGenerateImageArgs } from '@/lib/mothership/tools/server/image/normalize-args'
import {
  readDocumentServerTool,
  searchWorkspaceServerTool,
} from '@/lib/mothership/tools/server/knowledge/workspace-search'
import { ffmpegServerTool } from '@/lib/mothership/tools/server/media/ffmpeg'
import { generateAudioServerTool } from '@/lib/mothership/tools/server/media/generate-audio'
import { generateVideoServerTool } from '@/lib/mothership/tools/server/media/generate-video'
import { openResourceServerTool } from '@/lib/mothership/tools/server/open-resource'
import { searchOnlineServerTool } from '@/lib/mothership/tools/server/other/search-online'
import { userMemoryServerTool } from '@/lib/mothership/tools/server/other/user-memory'
import { organizationSearchSourcesServerTool } from '@/lib/mothership/tools/server/search-sources'
import { settingsServerTool } from '@/lib/mothership/tools/server/settings'
import { getCredentialsServerTool } from '@/lib/mothership/tools/server/user/get-credentials'
import { editWorkflowServerTool } from '@/lib/mothership/tools/server/workflow/edit-workflow'
import { listWorkspacesServerTool } from '@/lib/mothership/tools/server/workspace-list'
import { workspacesServerTool } from '@/lib/mothership/tools/server/workspaces'
import { listCustomBlocksWithInputsForWorkspace } from '@/lib/workflows/custom-blocks/operations'
import { withCustomBlockOverlay } from '@/blocks/custom/server-overlay'
import { withBlockVisibility } from '@/blocks/visibility/server-context'

export type ExecuteResponseSuccess = z.output<typeof ExecuteResponseSuccessSchema>

const ExecuteResponseSuccessSchema = z.object({
  success: z.literal(true),
  result: z.unknown(),
})

const logger = createLogger('ServerToolRouter')

const CUSTOM_BLOCK_OVERLAY_TOOLS = new Set(['edit_workflow', 'get_blocks_metadata'])

const VISIBILITY_GATED_TOOLS = new Set(['get_blocks_metadata', 'get_credentials'])

const WRITE_ACTIONS: Record<string, string[]> = {
  [GenerateImage.id]: ['generate'],
  [GenerateVideo.id]: ['generate'],
  [GenerateAudio.id]: ['generate'],
  [Ffmpeg.id]: ['*'],
  [createFileServerTool.name]: ['*'],
  create_file: ['*'],
  [workspaceFileServerTool.name]: ['create', 'append', 'update', 'delete', 'rename', 'patch'],
  workspace_file: ['create', 'append', 'update', 'delete', 'rename', 'patch'],
  [editContentServerTool.name]: ['*'],
  edit_content: ['*'],
  [userMemoryServerTool.name]: ['add', 'delete', 'correct'],
}

function isWriteAction(toolName: string, action: string | undefined): boolean {
  const writeActions = WRITE_ACTIONS[toolName]
  if (!writeActions) return false
  // '*' means the tool is always a write operation regardless of action field
  if (writeActions.includes('*')) return true
  return Boolean(action && writeActions.includes(action))
}

/** Registry of all server tools. Tools self-declare their validation schemas. */
const baseServerToolRegistry: Record<string, BaseServerTool> = {
  [getBlocksMetadataServerTool.name]: getBlocksMetadataServerTool,
  [editWorkflowServerTool.name]: editWorkflowServerTool,
  [searchOnlineServerTool.name]: searchOnlineServerTool,
  search_online: searchOnlineServerTool,
  [userMemoryServerTool.name]: userMemoryServerTool,
  [createFileServerTool.name]: createFileServerTool,
  create_file: createFileServerTool,
  [dashboardsServerTool.name]: dashboardsServerTool,
  [searchDocsServerTool.name]: searchDocsServerTool,
  [searchWorkspaceServerTool.name]: searchWorkspaceServerTool,
  [listWorkspacesServerTool.name]: listWorkspacesServerTool,
  [workspacesServerTool.name]: workspacesServerTool,
  [organizationSearchSourcesServerTool.name]: organizationSearchSourcesServerTool,
  [settingsServerTool.name]: settingsServerTool,
  [openResourceServerTool.name]: openResourceServerTool,
  [readDocumentServerTool.name]: readDocumentServerTool,
  // The streamed file-writing pair: prepare opens the write (live preview),
  // apply continues it. The preview machinery keys off these exact names.
  [workspaceFileServerTool.name]: workspaceFileServerTool,
  workspace_file: workspaceFileServerTool,
  [editContentServerTool.name]: editContentServerTool,
  edit_content: editContentServerTool,
  [generateImageServerTool.name]: generateImageServerTool,
  [generateVideoServerTool.name]: generateVideoServerTool,
  [generateAudioServerTool.name]: generateAudioServerTool,
  [ffmpegServerTool.name]: ffmpegServerTool,
  // Not agent-reachable: the internal credentials route dispatches this directly.
  [getCredentialsServerTool.name]: getCredentialsServerTool,
}

function getServerToolRegistry(): Record<string, BaseServerTool> {
  return baseServerToolRegistry
}

const SERVER_TOOL_SCHEMA_ALIASES: Readonly<Record<string, string>> =
  ARENA_SERVER_TOOL_SCHEMA_ALIASES

function resolveServerToolSchemaName(toolName: string): string {
  return SERVER_TOOL_SCHEMA_ALIASES[toolName] ?? toolName
}

export function getRegisteredServerToolNames(): string[] {
  return Object.keys(getServerToolRegistry())
}

export async function routeExecution(
  toolName: string,
  payload: unknown,
  context?: ServerToolContext
): Promise<unknown> {
  const tool = getServerToolRegistry()[toolName]
  if (!tool) {
    throw new OrchestrationError('validation', `Unknown server tool: ${toolName}`)
  }

  logger.debug(
    context?.messageId ? `Routing to tool [messageId:${context.messageId}]` : 'Routing to tool',
    { toolName }
  )

  // Action-level permission enforcement for mixed read/write tools
  if (WRITE_ACTIONS[toolName]) {
    const p = payload as Record<string, unknown>
    const action = (p?.operation ?? p?.action) as string | undefined
    if (isWriteAction(toolName, action) && !copilotToolCanWrite(context?.userPermission)) {
      const actionLabel = action ? `'${action}' on ` : ''
      // Classified so the projection surfaces it: a permission denial is
      // caller-actionable (stop retrying, tell the user), not a system error.
      throw new OrchestrationError(
        'forbidden',
        `Permission denied: ${actionLabel}${toolName} requires write access. You have '${context?.userPermission ?? 'none'}' permission.`
      )
    }
  }

  assertServerToolNotAborted(
    context,
    `User stop signal aborted ${toolName} before payload normalization`
  )

  // Go injects chatId/workspaceId and may wrap the model's args inside a
  // nested "args" object. Unwrap that before validation so the generated
  // JSON Schema sees the flat tool contract shape.
  let normalizedPayload = payload ?? {}
  if (isRecordLike(normalizedPayload)) {
    const raw = normalizedPayload as Record<string, unknown>
    if (raw.args && typeof raw.args === 'object' && !raw.operation) {
      const nested = raw.args as Record<string, unknown>
      normalizedPayload = { ...nested, ...raw, args: undefined }
    }
  }

  if (toolName === GenerateImage.id && isRecordLike(normalizedPayload)) {
    normalizedPayload = normalizeGenerateImageArgs(normalizedPayload)
  }

  const schemaToolName = resolveServerToolSchemaName(toolName)
  let args: unknown
  try {
    args = tool.inputSchema
      ? tool.inputSchema.parse(normalizedPayload)
      : validateGeneratedToolPayload(schemaToolName, 'parameters', normalizedPayload)
  } catch (error) {
    if (!isZodError(error)) throw error
    const field = error.issues[0]?.path.join('.') || 'input'
    throw new OrchestrationError('validation', `${field}: ${getValidationErrorMessage(error)}`)
  }

  assertServerToolNotAborted(context, `User stop signal aborted ${toolName} after validation`)

  let run = () => tool.execute(args, context)
  if (VISIBILITY_GATED_TOOLS.has(toolName) && context?.userId) {
    const vis = await getBlockVisibilityForCopilot(context.userId, context.workspaceId)
    const inner = run
    run = () => withBlockVisibility(vis, inner)
  }
  if (CUSTOM_BLOCK_OVERLAY_TOOLS.has(toolName) && context?.workspaceId) {
    const rows = await listCustomBlocksWithInputsForWorkspace(context.workspaceId)
    const inner = run
    run = () => withCustomBlockOverlay(rows, inner)
  }
  const result = await run()

  return tool.outputSchema
    ? tool.outputSchema.parse(result)
    : validateGeneratedToolPayload(schemaToolName, 'resultSchema', result)
}
