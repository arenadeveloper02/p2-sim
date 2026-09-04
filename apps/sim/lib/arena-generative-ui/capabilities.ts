/**
 * Composable capability recipes for the spec LLM. The page archetype is the
 * structural shape; these modules say which product/wait behaviors to emit.
 * Catalog types only.
 */

export const ARENA_GENERATIVE_CAPABILITIES = [
  'long-running',
  'streaming',
  'multi-step',
  'cancellable',
  'progress',
  'search',
  'filter',
  'sort',
  'pagination',
  'grouping',
  'date-range',
  'refresh',
  'drill-down',
  'select',
  'inspect',
  'analyze',
  'generate',
  'drawer',
  'modal',
  'create',
  'complete',
  'edit',
  'delete',
  'back',
  'skip',
  'review',
  'chat',
] as const

export type ArenaGenerativeCapability = (typeof ARENA_GENERATIVE_CAPABILITIES)[number]

const CAPABILITY_SET = new Set<string>(ARENA_GENERATIVE_CAPABILITIES)

/** Planned tags the planner may emit; host inference can still append wait/pagination. */
export const ARENA_GENERATIVE_PLANNED_CAPABILITY_LIMIT = 12

const CAPABILITY_ALIASES: Record<string, ArenaGenerativeCapability> = {
  editable: 'edit',
  selection: 'select',
  detail: 'inspect',
  'detail-drawer': 'inspect',
}

const CAPABILITY_PROMPTS: Record<ArenaGenerativeCapability, string> = {
  'long-running': [
    'CAPABILITY: LONG-RUNNING',
    'The wait is a named job (workflow, generate, analysis). Honour pages[].interaction.execution. Put WorkingCard on the destination when the blueprint listed a results page (title interpolating form names, estimate, skeleton true) above the bound result. Workspace / execution that stays in a named region: WorkingCard in that region above the bound result — do not invent a destination page. The host ticks the card. Do not emit ProgressSteps, ProgressBar, or Spinner. Do not leave waiting chrome on a form-only page that navigates away.',
  ].join('\n'),
  streaming: [
    'CAPABILITY: STREAMING',
    'Bind DataText statePath "content" (or layoutPlan hostKeys). The host streams chunks into that region. Chat on the same page also paints content when DataText is omitted. Do not invent Table columns from unstructured output. WorkingCard only when LONG-RUNNING or MULTI-STEP is also selected.',
  ].join('\n'),
  'multi-step': [
    'CAPABILITY: MULTI-STEP',
    'WorkingCard.steps are the brief’s checklist (one line per step). The host ticks steps and the bar together. Do not emit ProgressSteps as a sibling.',
  ].join('\n'),
  cancellable: [
    'CAPABILITY: CANCELLABLE',
    'WorkingCard.cancelTo is the form path. Do not emit a second Cancel Button.',
  ].join('\n'),
  progress: [
    'CAPABILITY: PROGRESS',
    'A named wait with visible progress. Honour pages[].interaction.execution. Prefer WorkingCard (steps, estimate) on the destination when the blueprint listed a results page; otherwise in the named execution region. ProgressBar only when a real percent exists on a bound statePath. Do not emit ProgressSteps.',
  ].join('\n'),
  search: [
    'CAPABILITY: SEARCH',
    'The primary task is finding or looking up. Home is a SearchField hero (placeholder, submitLabel, actionId), not a labelled Grid of one TextInput. When a declared binding owns the query, set actionId and bind the destination Repeat, Table, or DataText. When no search API exists, omit actionId — the host filters the on-page Table/Repeat as the user types. Do not add a second SearchField on results.',
  ].join('\n'),
  filter: [
    'CAPABILITY: FILTER',
    'Narrowing an already-loaded or static collection. Put Filter children (Select, DateInput, Chip) above Table/Repeat. Name each field after a collection column (status, category). When a declared binding owns those params, they submit with onLoad / CTA. When no filter API exists, omit actionId — the host filters the visible rows locally. Workspace selection that drives another collection is not Filter chrome: give the child rows a foreign key (projectId) matching the selected row id; the host narrows that Repeat/Table. "All" / "All Categories" is unconstrained. Not a SearchField hero.',
  ].join('\n'),
  sort: [
    'CAPABILITY: SORT',
    'Ordering an already-loaded collection. Put a Select (or Chip set) in the Toolbar next to Filter. The control must be a query param the collection onLoad / CTA actually sends. Do not invent column-header sort on Table.',
  ].join('\n'),
  pagination: [
    'CAPABILITY: PAGINATION',
    'Load more only when the binding declares pagination. Button showWhen "hasMore" reuses the same actionId. Do not invent a second next-page action. Without binding.pagination the host pages Table and Repeat locally from the loaded rows.',
  ].join('\n'),
  grouping: [
    'CAPABILITY: GROUPING',
    'Segment an already-loaded collection. A Toolbar Select or Chip set sends a group/query param the onLoad / CTA actually uses. Do not invent a second collection fetch.',
  ].join('\n'),
  'date-range': [
    'CAPABILITY: DATE-RANGE',
    'A time window that narrows onLoad data. Put two DateInput children (from, to — or the binding inputSchema names) in Filter / Toolbar. They must be query params the fetch actually sends. Not a SearchField hero.',
  ].join('\n'),
  refresh: [
    'CAPABILITY: REFRESH',
    'The host already offers Refresh on pages that have attempted onLoad. Do not emit a Refresh Button, a second onLoad action, or a retry Alert.',
  ].join('\n'),
  'drill-down': [
    'CAPABILITY: DRILL-DOWN',
    'A dashboard or collection module opens a more specific page or same-page detail. Honour pages[].interaction and pages[].regions. Workspace selection keeps named regions visible — do not hide navigator or primary with !selectedId. History-style Open uses showWhen !selectedId. Cross-page Open (navigateTo or Chip view switch) only to a page the blueprint listed. Do not fetch the same record twice.',
  ].join('\n'),
  select: [
    'CAPABILITY: SELECT',
    'Honour pages[].interaction.selection and pages[].regions. Opening a row is Button selectItem true with no actionId. Workspace / selection that filters another collection or drives inspector: keep every named region visible — do not hide navigator or primary with showWhen !selectedId. Child collection rows include a foreign key (projectId) matching the selected row id; the host filters that Repeat/Table locally. History-style Open (prose already on the row, no inspector region): stay on the list (showWhen !selectedId / selectedId / clearItem Back). Cross-page: navigateTo only a page the blueprint listed, with no onLoad of that row, and never hide the History list with !selectedId. Do not fetch the same item twice.',
  ].join('\n'),
  inspect: [
    'CAPABILITY: INSPECT',
    'Open one entity. Honour pages[].interaction.inspect and pages[].regions.inspector. Same-page inspect (inspector region, or inspect that is not navigate) uses Workspace inspector or Drawer — Button selectItem true, showWhen selectedId, ghost clearItem. Do not navigateTo a Detail page and do not invent one. Inspect that replaces the collection is a Detail page the blueprint already listed (navigateTo with ?id=). A small focused view may use Modal; a row that already has prose may stay inline. Do not encode drawer vs page as a second capability. Do not fetch the same record twice.',
  ].join('\n'),
  analyze: [
    'CAPABILITY: ANALYZE',
    'The primary CTA produces analysis or generated output. Honour pages[].interaction.execution and pages[].regions. Wire the declared binding when one exists; dummy/local source uses onSuccess.setState to seed the report. Workspace / execution that stays in a named region: WorkingCard and the bound result stay in that region — do not invent a Results page and do not set onSuccess.navigate. Destination is a results page (onSuccess.navigate) only when the blueprint already listed one. Wait chrome is LONG-RUNNING / STREAMING — compose those modules; do not invent a second wait or a new catalog type.',
  ].join('\n'),
  generate: [
    'CAPABILITY: GENERATE',
    'The primary CTA produces generated output. Same wiring as ANALYZE — honour pages[].interaction.execution. Seed dummy report prose with onSuccess.setState when there is no binding. Do not invent a Results page, SWOT, metrics, or extra modules the blueprint omitted.',
  ].join('\n'),
  drawer: [
    'CAPABILITY: DRAWER',
    'Contextual secondary chrome that must keep the page visible. Drawer showWhen uses the same clause language as form fields. Close with clearItem or a ghost Button. Not a full record page that needs its own onLoad — that is INSPECT on a detail page.',
  ].join('\n'),
  modal: [
    'CAPABILITY: MODAL',
    'A focused secondary action (rename, add a note) or a collection create. Modal showWhen uses the same clause language as form fields. Open with Button setValue; close with setValue that clears the flag. Not a multi-step workflow and not delete confirm — the host owns destructive confirm.',
  ].join('\n'),
  create: [
    'CAPABILITY: CREATE',
    'A primary action that adds a record. On a collection page put a PageHeader trailing Button setValue "creating=true" and a Modal showWhen "creating" that holds Form + SubmitButton wired to the create action. Close with a ghost Button setValue "creating=". Dummy/local source appends via onSuccess.setState — do not invent an API key. Workspace child create: stamp the selected parent id onto the new row\'s foreign key (projectId) so the host filter keeps it visible. Stay on this page unless the blueprint named a create page. A one-field add may be an inline Form. Not a second create-flow page.',
  ].join('\n'),
  complete: [
    'CAPABILITY: COMPLETE',
    'Toggle done on the selected row. Stay on the collection — do not navigate. Dummy/local source flips a completed/done field via onSuccess.setState. Do not invent a second complete page.',
  ].join('\n'),
  edit: [
    'CAPABILITY: EDIT',
    'Edit lives on the existing record as a Form of the fields the binding inputSchema names. Submit updates that record. Not a second create-flow page and not a Modal for the whole edit.',
  ].join('\n'),
  delete: [
    'CAPABILITY: DELETE',
    'A destructive Button (variant destructive) wired to the delete binding. Do not emit a confirm Modal or Alert — the host confirms destructive actions.',
  ].join('\n'),
  back: [
    'CAPABILITY: BACK',
    'Workflow stages after the first have a Back NavLink (or ghost Button.navigateTo) to the previous stage. Do not invent a second back control.',
  ].join('\n'),
  skip: [
    'CAPABILITY: SKIP',
    'An optional workflow stage can be skipped. A ghost Skip Button.navigateTo the next stage (or the review/submit stage). Do not skip a required stage the brief named.',
  ].join('\n'),
  chat: [
    'CAPABILITY: CHAT',
    'The binding has chatProtocol.input. Put a Chat composer (actionId) where the brief places conversation. Typically the results page (often the right column) when the blueprint has one. Workspace / execution that stays in a named region: Chat stays in that region — do not invent a Results page. Do not emit TextInput/TextArea/SearchField named input, conversationId, or files. Declared inputSchema fields other than the input prefix stay on the Form. The first form CTA composes input; Chat follow-ups send the composer text. Chat-only bindings (no form fields) must emit Chat, not an empty Form. Streamed tokens land in host state content; Chat paints that when the page has no DataText statePath "content".',
  ].join('\n'),
  review: [
    'CAPABILITY: REVIEW',
    'A review stage before the final CTA. Echo submitted fields (inputs.* / form names) as KeyValue or DataText. The last stage is the only SubmitButton. Earlier stages use Next, not submit.',
  ].join('\n'),
}

/**
 * Maps a raw planner/stored tag onto the closed capability enum. `editable`
 * becomes `edit` so old drafts still resolve.
 */
export function canonicalizeCapability(value: string): ArenaGenerativeCapability | null {
  const aliased = CAPABILITY_ALIASES[value] ?? value
  return CAPABILITY_SET.has(aliased) ? (aliased as ArenaGenerativeCapability) : null
}

/**
 * Prompt fragment for selected capabilities, in canonical enum order. Empty when
 * none were selected.
 */
export function capabilityRecipePrompt(capabilities: readonly ArenaGenerativeCapability[]): string {
  return ARENA_GENERATIVE_CAPABILITIES.filter((capability) => capabilities.includes(capability))
    .map((capability) => CAPABILITY_PROMPTS[capability])
    .join('\n\n')
}

export function isCapability(value: string): value is ArenaGenerativeCapability {
  return canonicalizeCapability(value) !== null
}

/**
 * Planned tags in canonical order, capped so the spec prompt stays short. Host
 * inference in {@link resolveCapabilities} can still append wait/pagination.
 */
export function plannedCapabilities(values: readonly string[]): ArenaGenerativeCapability[] {
  const selected = new Set<ArenaGenerativeCapability>()
  for (const raw of values) {
    const capability = canonicalizeCapability(raw)
    if (capability) selected.add(capability)
  }
  return ARENA_GENERATIVE_CAPABILITIES.filter((capability) => selected.has(capability)).slice(
    0,
    ARENA_GENERATIVE_PLANNED_CAPABILITY_LIMIT
  )
}

/**
 * Combine planner tags with binding signals. Workflow → long-running; stream →
 * streaming; pagination config → pagination. `short` is not a capability (omit
 * wait modules). Applies to every archetype.
 */
export function resolveCapabilities(options: {
  planned?: readonly string[]
  bindings: ReadonlyArray<{
    kind?: string
    stream?: boolean
    pagination?: unknown
    chatProtocol?: { input?: boolean }
  }>
}): ArenaGenerativeCapability[] {
  const selected = new Set<ArenaGenerativeCapability>(plannedCapabilities(options.planned ?? []))
  if (options.bindings.some((binding) => binding.stream === true)) {
    selected.add('streaming')
  }
  if (options.bindings.some((binding) => binding.kind === 'workflow')) {
    selected.add('long-running')
  }
  if (options.bindings.some((binding) => Boolean(binding.pagination))) {
    selected.add('pagination')
  }
  if (options.bindings.some((binding) => binding.chatProtocol?.input === true)) {
    selected.add('chat')
  }
  return ARENA_GENERATIVE_CAPABILITIES.filter((capability) => selected.has(capability))
}
