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
  'selection',
  'detail-drawer',
  'drawer',
  'modal',
  'create',
  'edit',
  'delete',
  'back',
  'skip',
  'review',
] as const

export type ArenaGenerativeCapability = (typeof ARENA_GENERATIVE_CAPABILITIES)[number]

const CAPABILITY_SET = new Set<string>(ARENA_GENERATIVE_CAPABILITIES)

/** Planned tags the planner may emit; host inference can still append wait/pagination. */
export const ARENA_GENERATIVE_PLANNED_CAPABILITY_LIMIT = 5

const CAPABILITY_ALIASES: Record<string, ArenaGenerativeCapability> = {
  editable: 'edit',
}

const CAPABILITY_PROMPTS: Record<ArenaGenerativeCapability, string> = {
  'long-running': [
    'CAPABILITY: LONG-RUNNING',
    'The wait is a named job (workflow, generate, analysis). Put WorkingCard on the destination (title interpolating form names, estimate, skeleton true) above the bound result. The host ticks the card. Do not emit ProgressSteps, ProgressBar, or Spinner. Do not leave waiting chrome on the form.',
  ].join('\n'),
  streaming: [
    'CAPABILITY: STREAMING',
    'Bind DataText statePath "content" (or layoutPlan hostKeys). The host streams chunks into that region. Do not invent Table columns from unstructured output. WorkingCard only when LONG-RUNNING or MULTI-STEP is also selected.',
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
    'A named wait with visible progress. Prefer WorkingCard (steps, estimate) on the destination. ProgressBar only when a real percent exists on a bound statePath. Do not emit ProgressSteps.',
  ].join('\n'),
  search: [
    'CAPABILITY: SEARCH',
    'The primary task is finding or looking up. Home is a SearchField hero (placeholder, submitLabel, actionId), not a labelled Grid of one TextInput. Bind the destination Repeat, Table, or DataText. Do not add a second SearchField on results.',
  ].join('\n'),
  filter: [
    'CAPABILITY: FILTER',
    'Narrowing an already-loaded collection. Put Filter children in a Toolbar above Table/Repeat. Filter fields must be query params the collection onLoad / CTA actually sends. Not a SearchField hero.',
  ].join('\n'),
  sort: [
    'CAPABILITY: SORT',
    'Ordering an already-loaded collection. Put a Select (or Chip set) in the Toolbar next to Filter. The control must be a query param the collection onLoad / CTA actually sends. Do not invent column-header sort on Table.',
  ].join('\n'),
  pagination: [
    'CAPABILITY: PAGINATION',
    'Load more only when the binding declares pagination. Button showWhen "hasMore" reuses the same actionId. Do not invent a second next-page action.',
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
    'A dashboard or collection module opens a more specific page or same-page detail. Use Button.navigateTo / NavLink.to with the row id, or selectItem when the row already has prose. Do not fetch the same record twice.',
  ].join('\n'),
  selection: [
    'CAPABILITY: SELECTION',
    'Opening a row that already has prose is Button selectItem true with no actionId. Stay on the list (showWhen selectedId / clearItem Back) or navigateTo a results page with no onLoad of that row. Do not fetch the same item twice.',
  ].join('\n'),
  'detail-drawer': [
    'CAPABILITY: DETAIL-DRAWER',
    'Keep the collection visible. Open is Button selectItem true; show the record in Drawer showWhen "selectedId". Close with a ghost Button clearItem true. Do not navigate away and do not onLoad the same row.',
  ].join('\n'),
  drawer: [
    'CAPABILITY: DRAWER',
    'Contextual secondary chrome that must keep the page visible. Drawer showWhen uses the same clause language as form fields. Close with clearItem or a ghost Button. Not a full record page that needs its own onLoad — that is a Detail page or DETAIL-DRAWER.',
  ].join('\n'),
  modal: [
    'CAPABILITY: MODAL',
    'A focused secondary action (rename, add a note). Modal showWhen uses the same clause language as form fields. Not a multi-step workflow and not delete confirm — the host owns destructive confirm.',
  ].join('\n'),
  create: [
    'CAPABILITY: CREATE',
    'A primary action that adds a record. Use Form + SubmitButton wired to the create binding, or a Task page. Not a Modal for a multi-field create unless the brief asked for a small add-in-place.',
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
  bindings: ReadonlyArray<{ kind?: string; stream?: boolean; pagination?: unknown }>
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
  return ARENA_GENERATIVE_CAPABILITIES.filter((capability) => selected.has(capability))
}
