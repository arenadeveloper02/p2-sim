import { GenerativeUiIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { IntegrationType } from '@/blocks/types'
import { ARENA_GENERATIVE_APP_API_BASE_PATH } from '@/lib/arena-generative-ui/types'
import type { ArenaGenerativeUiResponse } from '@/tools/arena-generative-ui/types'

let _inflightDraftFetch: Promise<Array<{ label: string; id: string }>> | null = null

async function fetchGenerativeAppDrafts(): Promise<Array<{ label: string; id: string }>> {
  if (_inflightDraftFetch) {
    return _inflightDraftFetch
  }

  _inflightDraftFetch =
    // boundary-raw-fetch: internal JSON GET for Arena Generative UI draft dropdown hydration
    fetch(`${ARENA_GENERATIVE_APP_API_BASE_PATH}/drafts`, { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((data) => {
        _inflightDraftFetch = null
        if (!Array.isArray(data?.drafts)) {
          return []
        }
        return data.drafts.map((draft: { id: string; title: string; revision?: number }) => ({
          id: draft.id,
          label: draft.revision ? `${draft.title} (r${draft.revision})` : draft.title,
        }))
      })
      .catch(() => {
        _inflightDraftFetch = null
        return []
      })

  return _inflightDraftFetch
}

export const ArenaGenerativeUiBlock: BlockConfig<ArenaGenerativeUiResponse> = {
  type: 'arena_generative_ui',
  name: 'Arena Generative UI',
  description: 'Generate multi-page Arena apps with json-render and CTA APIs',
  longDescription:
    'Creates a multi-page json-render draft (home, results, and more) with in-app navigation and optional CTA bindings to deployed workflows or allowlisted HTTP APIs. Run the block to save a draft, then publish from Deploy → GUI App to get a public /gui-apps/{identifier} URL.',
  bestPractices: `
  - Use Generate for a new draft. List pages as JSON [{ "path": "home", "title": "Form" }, { "path": "results", "title": "Score" }] when you want a fixed sitemap.
  - Describe navigation in User Input: NavLinks, Back buttons, and "submit then go to results".
  - Add apiBindings JSON to allow CTAs to call a deployed workflow or HTTP URL. The model can only use keys you declare.
  - After a successful run, open Deploy → GUI App, pick the draft, set an identifier, and Launch. The public URL is /gui-apps/{identifier}.
  - Use Edit mode with an existing draft to change pages, copy, or CTA wiring.
  `,
  docsLink: 'https://docs.sim.ai/blocks/development',
  category: 'blocks',
  integrationType: IntegrationType.AI,
  bgColor: '#0F172A',
  icon: GenerativeUiIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Mode',
      type: 'dropdown',
      options: [
        { label: 'Generate New App', id: 'generate' },
        { label: 'Edit Existing Draft', id: 'edit' },
      ],
      value: () => 'generate',
    },
    {
      id: 'userInput',
      title: 'User Input',
      type: 'long-input',
      required: true,
      placeholder:
        'Describe pages, navigation, CTAs, and copy. Example: Home form submits qualify_lead then goes to Results. Results has Back.',
      wandConfig: {
        enabled: true,
        prompt: `You are an expert product designer for Sim GUI apps that may open as a page or in an Arena iframe. Expand the user's idea into a brief for a multi-page json-render UI.

Include:
- App name and purpose
- Page list with path, title, and purpose
- Navigation between pages (tabs, Back, submit-then-navigate)
- CTA copy and which named API (if any) each CTA should call
- Fields on each form

Return ONLY the specification text.`,
        placeholder: 'Describe the Arena app you want to generate...',
      },
    },
    {
      id: 'existingDraftId',
      title: 'Draft',
      type: 'dropdown',
      required: { field: 'operation', value: 'edit' },
      condition: { field: 'operation', value: 'edit' },
      description: 'Select an existing generative app draft to edit.',
      options: [],
      fetchOptions: async () => fetchGenerativeAppDrafts(),
      fetchOptionById: async (_blockId: string, optionId: string) => {
        const drafts = await fetchGenerativeAppDrafts()
        const match = drafts.find((draft) => draft.id === optionId)
        return match ?? { id: optionId, label: optionId }
      },
    },
    {
      id: 'pages',
      title: 'Pages',
      type: 'code',
      language: 'json',
      placeholder: '[{"path":"home","title":"Form"},{"path":"results","title":"Score"}]',
      description: 'Optional sitemap. Empty lets the model propose pages from User Input.',
      condition: { field: 'operation', value: 'generate' },
    },
    {
      id: 'entryPath',
      title: 'Entry Path',
      type: 'short-input',
      placeholder: 'home',
      description: 'First page after open. Defaults to home.',
      condition: { field: 'operation', value: 'generate' },
    },
    {
      id: 'apiBindings',
      title: 'API Bindings',
      type: 'code',
      language: 'json',
      placeholder:
        '[{"key":"qualify_lead","kind":"workflow","workflowId":"...","label":"Qualify"}]',
      description:
        'Named APIs CTAs may call. kind is workflow or http. HTTP rows need http.method and http.url.',
    },
    {
      id: 'designNotes',
      title: 'Design Notes',
      type: 'long-input',
      placeholder: 'Optional Arena DS / brand / density notes',
    },
  ],
  tools: {
    access: ['arena_generative_ui_generate', 'arena_generative_ui_edit'],
    config: {
      tool: (params) =>
        params.operation === 'edit' ? 'arena_generative_ui_edit' : 'arena_generative_ui_generate',
      params: (params) =>
        params.operation === 'edit'
          ? {
              userInput: params.userInput,
              existingDraftId: params.existingDraftId,
              pages: params.pages,
              entryPath: params.entryPath,
              apiBindings: params.apiBindings,
              designNotes: params.designNotes,
            }
          : {
              userInput: params.userInput,
              pages: params.pages,
              entryPath: params.entryPath,
              apiBindings: params.apiBindings,
              designNotes: params.designNotes,
            },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'generate or edit' },
    userInput: { type: 'string', description: 'App brief or edit instructions' },
    existingDraftId: { type: 'string', description: 'Draft to edit' },
    pages: { type: 'json', description: 'Optional page sitemap' },
    entryPath: { type: 'string', description: 'Opening page path' },
    apiBindings: { type: 'json', description: 'Named CTA backends' },
    designNotes: { type: 'string', description: 'Optional design notes' },
  },
  outputs: {
    draftId: { type: 'string', description: 'Draft id for Deploy → GUI App' },
    revisionId: { type: 'string', description: 'Revision snapshot id' },
    entryPath: { type: 'string', description: 'Opening page path' },
    pages: { type: 'json', description: 'Generated pages' },
    content: { type: 'string', description: 'Generation summary' },
    manifest: { type: 'json', description: 'Full manifest JSON' },
  },
}
