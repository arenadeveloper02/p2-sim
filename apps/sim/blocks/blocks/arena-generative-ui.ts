import { GenerativeUiIcon } from '@/components/icons'
import { requestJson } from '@/lib/api/client/request'
import { listGenerativeAppDraftsContract } from '@/lib/api/contracts/arena-generative-apps'
import type { BlockConfig } from '@/blocks/types'
import { IntegrationType } from '@/blocks/types'
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
  - User Input describes the app: pages, copy, which API, navigation, empty states. Do not ask for loaders, toasts, or confirm dialogs — the host compiles those.
  - Describe navigation in User Input: NavLinks, Back buttons, and "submit then go to results".
  - Add apiBindings JSON only when CTAs should call a deployed workflow or HTTP URL. Leave it blank for navigation-only; the model cannot invent keys. Set "stream": true to stream tokens into DataText on the form page.
  - Use "Add an API" rather than writing bindings by hand: pick a workflow and Sim fills inputSchema from its deployed start block, or paste a curl for an HTTP endpoint.
  - Every CTA input carries arenaEmailId, the visitor's Arena email. It is NOT verified, so never use it to decide what a user may see. HTTP bindings only receive it when the binding opts in.
  - After a successful run, open Deploy → GUI App, pick the draft, set an identifier, and Launch. The public URL is /gui-apps/{identifier}.
  - Use Edit mode with an existing draft to change pages, copy, or CTA wiring. Put only the delta in Requested Changes — the draft already carries the original brief, and anything you do not mention is kept as-is.
  - Name the page you mean in Requested Changes ("on the results page, ..."). Edits are scoped to the pages your request names, so a page it never mentions is left byte-identical and costs nothing to re-emit.
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
      rows: 10,
      required: { field: 'operation', value: 'generate' },
      condition: { field: 'operation', value: 'generate' },
      placeholder:
        'Plain language, not JSON. Describe the app. Only Pages and API Bindings are JSON.',
      tooltip:
        'Plain language, not JSON. Name pages, fields, and navigation. If a form should call an API, use the same key you put in API Bindings (you invent that key).\n\nLead qualifier. Home is a form: company, role, notes. Submit calls qualify_lead, then go to Results. Results shows the score and a Back link.',
      wandConfig: {
        enabled: true,
        prompt: `You are a principal product engineer writing the User Input brief for an Arena Generative UI app. Apps render as a full page (up to 1280px) and also embed in a narrow Arena iframe — Grid and Columns collapse.

The user's note is often a job, not a spec. Infer the product a senior engineer would ship: who it is for, the happy path, pages that path needs (form → results, list → detail, history of past runs), fields the APIs need, CTA labels, and empty-state copy. Write as if you already know the domain.

Rules:
- Honour every name, API key, field, and page the user DID write. Do not rename them.
- Do not invent API keys. If they named a key, keep it. If they did not, describe the CTA in words rather than minting a key.
- Do not describe loaders, toasts, confirm dialogs, progress checklists, or login — the host compiles those.
- Do not add settings, profile, or marketing pages the job does not need.
- A search or generate job always includes a results destination and Back. A list of records includes a way to open one.
- Field names are camelCase; labels may have spaces.

Include:
- App name, purpose, and audience (a real role, not "users")
- Page list with path, title, and purpose
- In-content navigation (Back, submit-then-navigate, tabs if three or more top-level destinations). No left nav, no logo, no app chrome.
- CTA copy and which named API (if any) each CTA should call
- Fields on each form (name, type, label)
- What results show, without inventing schema keys the user did not name
- Empty-state copy for each collection

Return ONLY the specification text.`,
        placeholder: 'Describe the Arena app you want to generate...',
      },
    },
    {
      id: 'editInstructions',
      title: 'Requested Changes',
      type: 'long-input',
      required: { field: 'operation', value: 'edit' },
      condition: { field: 'operation', value: 'edit' },
      placeholder:
        'Only what should change. Everything you do not mention is kept exactly as it is.',
      description:
        'Only the changes. The draft already holds the original brief — do not paste it again.',
      tooltip:
        'Describe only the delta, and name the page it applies to. Pages your request does not name are never sent to the model and stay byte-identical, so a short instruction is both safer and cheaper than a rewritten brief.\n\nCentre the search input and its submit button in one row. Show a loader on the results page while the API runs.',
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
      previewHelper: 'arena-draft-brief',
    },
    {
      id: 'pages',
      title: 'Pages',
      type: 'code',
      language: 'json',
      placeholder: '[]',
      description:
        'Optional sitemap. Blank lets the model choose (Generate) or keeps the current pages untouched (Edit).',
      tooltip:
        'Optional JSON sitemap. Leave blank to let the model choose pages from User Input. In Edit, blank keeps the existing pages exactly as they are.\n\n[{"path":"home","title":"Form"},{"path":"results","title":"Score"}]',
    },
    {
      id: 'entryPath',
      title: 'Entry Path',
      type: 'short-input',
      placeholder: 'home',
      description:
        'First page after open. Defaults to home. Blank in Edit keeps the current entry.',
      tooltip:
        'First page after open. Kebab-case path. Defaults to home if blank on Generate, and keeps the existing entry if blank on Edit.\n\nhome',
    },
    {
      id: 'apiBindings',
      title: 'API Bindings',
      type: 'code',
      language: 'json',
      importHelper: 'arena-api-binding',
      readOnly: true,
      maxHeight: 96,
      placeholder:
        '[{"key":"qualify_lead","kind":"workflow","workflowId":"...","label":"Qualify","stream":true}]',
      description:
        'Named APIs CTAs may call. Leave blank for a navigation-only app — the model cannot invent API keys.',
      tooltip:
        'Named CTA backends. Leave blank for navigation-only. Use Add an API to pick a workflow or paste a curl. You invent key; use that same string in User Input (e.g. "Submit calls qualify_lead"). Set "stream": true to stream tokens into DataText on the form page. Add "outputSchema" (or paste a sample in Add an API) so the result is laid out as a Table or Stat instead of one text blob. Set "forwardEmailId": true on an HTTP binding to send the visitor\'s unverified Arena email.\n\n[{"key":"qualify_lead","kind":"workflow","workflowId":"wf_...","label":"Qualify","stream":true,"outputSchema":[{"name":"score","type":"number"}]}]',
    },
    {
      id: 'designNotes',
      title: 'Design Notes',
      type: 'long-input',
      placeholder: 'Optional Arena DS / brand / density notes',
      tooltip:
        'Optional. Tone and density, or name a theme knob (brandColor, density, radius, colorScheme). Layout is full-page up to 1280px and stacks in a narrow Arena iframe.\n\nCalm Arena-like layout. Density compact. Dark mode.',
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
              editInstructions: params.editInstructions,
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
    userInput: { type: 'string', description: 'App brief (Generate)' },
    editInstructions: { type: 'string', description: 'Requested changes only (Edit)' },
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
    content: { type: 'string', description: 'Generation summary, including planner or edit scope' },
    manifest: { type: 'json', description: 'Full manifest JSON' },
    structuredBrief: {
      type: 'json',
      description: 'Planner sitemap when generate planning succeeded',
    },
    plannerError: { type: 'string', description: 'Why planning fell back to prose, if it did' },
    editScope: { type: 'json', description: 'Pages rewritten on Edit, or theme-only' },
  },
}
