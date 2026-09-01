import { ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS } from '@/lib/arena-generative-ui/timeout'
import { mapArenaGenerativeResultToToolResponse } from '@/tools/arena-generative-ui/map-response'
import type {
  ArenaGenerativeUiParams,
  ArenaGenerativeUiResponse,
} from '@/tools/arena-generative-ui/types'
import type { ToolConfig } from '@/tools/types'

export const arenaGenerativeUiGenerateTool: ToolConfig<
  ArenaGenerativeUiParams,
  ArenaGenerativeUiResponse
> = {
  id: 'arena_generative_ui_generate',
  name: 'Generate Arena Generative UI',
  description: 'Generate a multi-page json-render app draft with optional CTA API bindings',
  version: '1.0.0',
  params: {
    userInput: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'App brief: pages, flows, CTAs, and copy. The block fills this in when only screenshots are uploaded.',
    },
    screenshots: {
      type: 'file',
      required: false,
      visibility: 'user-only',
      description: 'UI screenshots to match. Workspace uploads only; do not invent this object.',
    },
    pages: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional sitemap [{ path, title, purpose? }]',
    },
    entryPath: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Opening page path (default home)',
    },
    apiBindings: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Named workflow or HTTP APIs CTAs may call',
    },
    designNotes: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional design guidance',
    },
  },
  request: {
    url: '/api/tools/arena_generative_ui/generate',
    method: 'POST',
    timeout: ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS,
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      userInput: params.userInput,
      screenshots: params.screenshots,
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
    revisionId: { type: 'string', description: 'Revision snapshot id' },
    entryPath: { type: 'string', description: 'Opening page path' },
    pages: { type: 'json', description: 'Generated page path and title list' },
    content: { type: 'string', description: 'Summary of the generated app' },
    manifest: { type: 'json', description: 'Full multi-page json-render manifest' },
  },
}
