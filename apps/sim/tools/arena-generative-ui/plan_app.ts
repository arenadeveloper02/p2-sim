import { ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS } from '@/lib/arena-generative-ui/timeout'
import { mapArenaGenerativeResultToToolResponse } from '@/tools/arena-generative-ui/map-response'
import { arenaGenerativeToolRequestBody } from '@/tools/arena-generative-ui/request-body'
import type {
  ArenaGenerativeUiParams,
  ArenaGenerativeUiResponse,
} from '@/tools/arena-generative-ui/types'
import type { ToolConfig } from '@/tools/types'

export const arenaGenerativeUiPlanTool: ToolConfig<
  ArenaGenerativeUiParams,
  ArenaGenerativeUiResponse
> = {
  id: 'arena_generative_ui_plan',
  name: 'Plan Arena Generative UI',
  description:
    'Plan an Arena Generative UI product contract without generating pixels. Confirm or adjust the plan, then generate from it.',
  version: '1.0.0',
  params: {
    userInput: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'App brief for a new plan. Optional when existingDraftId plus planChanges or composition is set.',
    },
    screenshots: {
      type: 'file',
      required: false,
      visibility: 'user-only',
      description: 'UI screenshots to match. Workspace uploads only; do not invent this object.',
    },
    planChanges: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Plain-language delta against the current blueprint. Keeps unmentioned pages and regions.',
    },
    existingDraftId: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Draft whose current plan to adjust',
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
      description:
        'Named CTA backends. Prefer stubs [{ "key", "kind": "workflow", "workflowId", "stream"? }] or [{ "key", "kind": "http", "curl" }]. Leave blank when there is no backend.',
    },
    designNotes: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional design guidance',
    },
  },
  request: {
    url: '/api/tools/arena_generative_ui/plan',
    method: 'POST',
    timeout: ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS,
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => arenaGenerativeToolRequestBody({ ...params, planOnly: true }),
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
    draftId: { type: 'string', description: 'Draft id for Generate from Plan' },
    revisionId: { type: 'string', description: 'Revision snapshot id' },
    entryPath: { type: 'string', description: 'Opening page path' },
    pages: { type: 'json', description: 'Planned page path and title list' },
    content: { type: 'string', description: 'Summary of the planned product contract' },
    manifest: { type: 'json', description: 'Placeholder manifest until Generate from Plan' },
  },
}
