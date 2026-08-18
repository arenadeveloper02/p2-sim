import { ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS } from '@/lib/arena-generative-ui/timeout'
import { mapArenaGenerativeResultToToolResponse } from '@/tools/arena-generative-ui/map-response'
import type {
  ArenaGenerativeUiParams,
  ArenaGenerativeUiResponse,
} from '@/tools/arena-generative-ui/types'
import type { ToolConfig } from '@/tools/types'

export const arenaGenerativeUiEditTool: ToolConfig<
  ArenaGenerativeUiParams,
  ArenaGenerativeUiResponse
> = {
  id: 'arena_generative_ui_edit',
  name: 'Edit Arena Generative UI',
  description: 'Edit an existing Arena Generative UI draft and save a new revision',
  version: '1.0.0',
  params: {
    editInstructions: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Only the requested changes. Anything not mentioned is kept exactly as it is, so do not resend the original brief',
    },
    existingDraftId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Draft id to edit',
    },
    pages: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional replacement sitemap',
    },
    entryPath: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Opening page path',
    },
    apiBindings: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Updated API bindings; omit to keep the previous list',
    },
    designNotes: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional design guidance',
    },
  },
  request: {
    url: '/api/tools/arena_generative_ui/edit',
    method: 'POST',
    timeout: ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS,
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      editInstructions: params.editInstructions,
      existingDraftId: params.existingDraftId,
      pages: params.pages,
      entryPath: params.entryPath,
      apiBindings: params.apiBindings,
      designNotes: params.designNotes,
      workspaceId: params._context?.workspaceId,
      workflowId: params._context?.workflowId,
      executionId: params._context?.executionId,
    }),
  },
  transformResponse: async (response) => {
    const data = await response.json()
    if (!response.ok) {
      return mapArenaGenerativeResultToToolResponse({
        success: false,
        error: typeof data.error === 'string' ? data.error : response.statusText,
      })
    }
    return data as ArenaGenerativeUiResponse
  },
  outputs: {
    draftId: { type: 'string', description: 'Draft id for the Deploy modal' },
    revisionId: { type: 'string', description: 'New revision snapshot id' },
    entryPath: { type: 'string', description: 'Opening page path' },
    pages: { type: 'json', description: 'Generated page path and title list' },
    content: { type: 'string', description: 'Summary of the edited app' },
    manifest: { type: 'json', description: 'Full multi-page json-render manifest' },
  },
}
