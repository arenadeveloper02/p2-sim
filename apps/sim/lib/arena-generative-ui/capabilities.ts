/**
 * Composable capability recipes for the spec LLM. The archetype is the sitemap;
 * these modules say which product/wait behaviors to emit. Catalog types only.
 */

export const ARENA_GENERATIVE_CAPABILITIES = [
  'long-running',
  'streaming',
  'multi-step',
  'cancellable',
  'search',
  'filter',
  'pagination',
  'selection',
  'editable',
] as const

export type ArenaGenerativeCapability = (typeof ARENA_GENERATIVE_CAPABILITIES)[number]

const CAPABILITY_SET = new Set<string>(ARENA_GENERATIVE_CAPABILITIES)

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
  search: [
    'CAPABILITY: SEARCH',
    'The primary task is finding or looking up. Home is a SearchField hero (placeholder, submitLabel, actionId), not a labelled Grid of one TextInput. Bind the destination Repeat, Table, or DataText. Do not add a second SearchField on results.',
  ].join('\n'),
  filter: [
    'CAPABILITY: FILTER',
    'Narrowing an already-loaded collection. Put Filter children in a Toolbar above Table/Repeat. Filter fields must be query params the collection onLoad / CTA actually sends. Not a SearchField hero.',
  ].join('\n'),
  pagination: [
    'CAPABILITY: PAGINATION',
    'Load more only when the binding declares pagination. Button showWhen "hasMore" reuses the same actionId. Do not invent a second next-page action.',
  ].join('\n'),
  selection: [
    'CAPABILITY: SELECTION',
    'Opening a row that already has prose is Button selectItem true with no actionId. Stay on the list (showWhen selectedId / clearItem Back) or navigateTo a results page with no onLoad of that row. Do not fetch the same item twice.',
  ].join('\n'),
  editable: [
    'CAPABILITY: EDITABLE',
    'Edit lives on the existing record as a Form of the fields the binding inputSchema names. Submit updates that record. Not a second create-flow page and not a Modal for the whole edit.',
  ].join('\n'),
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
  return CAPABILITY_SET.has(value)
}

function asCapability(value: string): ArenaGenerativeCapability | null {
  return CAPABILITY_SET.has(value) ? (value as ArenaGenerativeCapability) : null
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
  const selected = new Set<ArenaGenerativeCapability>()
  for (const raw of options.planned ?? []) {
    const capability = asCapability(raw)
    if (capability) selected.add(capability)
  }
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
