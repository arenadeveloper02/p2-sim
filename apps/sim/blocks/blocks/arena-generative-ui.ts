import { GenerativeUiIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { IntegrationType } from '@/blocks/types'
import { requestJson } from '@/lib/api/client/request'
import { listGenerativeAppDraftsContract } from '@/lib/api/contracts/arena-generative-apps'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'
import type { ArenaGenerativeUiResponse } from '@/tools/arena-generative-ui/types'

async function fetchGenerativeAppDrafts(): Promise<Array<{ label: string; id: string }>> {
  const workflowId = useWorkflowRegistry.getState().activeWorkflowId
  const data = await requestJson(listGenerativeAppDraftsContract, {
    query: workflowId ? { workflowId } : {},
  })
  return data.drafts.map((draft) => ({
    id: draft.id,
    label: draft.revision ? `${draft.title} (r${draft.revision})` : draft.title,
  }))
}

export const ArenaGenerativeUiBlock: BlockConfig<ArenaGenerativeUiResponse> = {
  type: 'arena_generative_ui',
  name: 'Arena Generative UI',
  description: 'Generate multi-page Arena apps with json-render and CTA APIs',
  longDescription:
    'Creates a multi-page json-render draft (home, results, and more) with in-app navigation and optional CTA bindings to deployed workflows or allowlisted HTTP APIs. Run the block to save a draft, then publish from Deploy → GUI App to get a public /gui-apps/{identifier} URL.',
  bestPractices: `
  - Use Generate for a new draft. Leave Pages blank so the model chooses the sitemap, or pin paths as JSON [{ "path": "home", "title": "Form" }].
  - Describe navigation in User Input: NavLinks, Back buttons, and "submit then go to results".
  - Add apiBindings JSON only when CTAs should call a deployed workflow or HTTP URL. Leave it blank for navigation-only; the model cannot invent keys.
  - After a successful run, open Deploy → GUI App, pick the draft, set an identifier, and Launch. The public URL is /gui-apps/{identifier}.
  - Use Edit mode with an existing draft to change pages, copy, or CTA wiring.
  - As an Agent tool: attach Arena Generative UI, pick Generate or Edit, then preview/launch from Deploy → GUI App on this workflow.
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
        'Generate: describe the app. Edit: describe the changes (copy, layout, pages, CTAs).',
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
      description:
        'Required in Edit mode. Pick the draft this block created (usually the latest on this workflow).',
      placeholder: 'Select a draft',
      options: [],
      searchable: true,
      dependsOn: ['operation'],
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
      placeholder: '[]',
      description:
        'Optional sitemap. Leave blank to let the model choose (Generate) or keep the current pages (Edit).',
    },
    {
      id: 'entryPath',
      title: 'Entry Path',
      type: 'short-input',
      placeholder: 'home',
      description: 'First page after open. Defaults to home. Leave blank in Edit to keep the current entry.',
    },
    {
      id: 'apiBindings',
      title: 'API Bindings',
      type: 'code',
      language: 'json',
      placeholder:
        '[{"key":"qualify_lead","kind":"workflow","workflowId":"...","label":"Qualify"}]',
      description:
        'Named APIs CTAs may call. Leave blank for a navigation-only app — the model cannot invent API keys.',
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
