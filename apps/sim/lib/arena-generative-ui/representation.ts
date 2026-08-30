/**
 * Collection-body representation. Archetype is the job; this picks how a
 * collection is shown. Kanban and Timeline have no catalog types — they
 * degrade to grouped or dated Repeat/Table.
 */

export const ARENA_GENERATIVE_REPRESENTATIONS = [
  'auto',
  'table',
  'cards',
  'list',
  'kanban',
  'timeline',
] as const

export type ArenaGenerativeRepresentation = (typeof ARENA_GENERATIVE_REPRESENTATIONS)[number]

const REPRESENTATION_SET = new Set<string>(ARENA_GENERATIVE_REPRESENTATIONS)

const REPRESENTATION_ALIASES: Record<string, ArenaGenerativeRepresentation> = {
  card: 'cards',
  grid: 'cards',
  rows: 'table',
}

/**
 * Maps a planner/stored value onto the closed enum. Unknown values fail open
 * to `auto` so an old or sloppy tag does not null the whole brief.
 */
export function parseArenaGenerativeRepresentation(
  value: unknown
): ArenaGenerativeRepresentation {
  if (typeof value !== 'string') return 'auto'
  const kebab = value.trim().toLowerCase().replace(/_/g, '-')
  if (REPRESENTATION_SET.has(kebab)) return kebab as ArenaGenerativeRepresentation
  return REPRESENTATION_ALIASES[kebab] ?? 'auto'
}

export const ARENA_GENERATIVE_UI_REPRESENTATION_PROMPT = [
  'REPRESENTATION',
  'Archetype is the job. Representation is how a collection body is shown. Do not invent catalog types (no Kanban, Timeline, or List component).',
  'auto — BindingLayoutPlan wins: same-page prose collection → Cards or List; uniform scalars with no per-row identity → Table; else Cards.',
  'table — comparable rows, mostly scalars, scanning or comparison. Use Table. Honour this even if a gold few-shot used Cards.',
  'cards — each entity has heterogeneous information (description, image, context). Repeat inside Grid of Card. Never unroll an array into static Cards.',
  'list — entities are primarily text or content. Repeat of text rows (Heading/Text/Chip), no Card chrome.',
  'kanban — entities have a meaningful workflow or status dimension. No Kanban type: grouping + Repeat (or Table) segmented by the status hostKey.',
  'timeline — chronological ordering is the primary relationship. No Timeline type: sort by the date hostKey, Repeat in time order.',
  'table, cards, and list override gold and auto. auto never fights layoutPlan.hostKeys or same-page prose selection.',
].join('\n')
