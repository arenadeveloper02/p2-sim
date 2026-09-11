/**
 * Collection-body representation. Archetype is the job; this picks how a
 * collection is shown. Kanban has no catalog type — it degrades to grouped
 * Repeat/Table. Timeline is a catalog type.
 */

export const ARENA_GENERATIVE_REPRESENTATIONS = [
  'auto',
  'table',
  'cards',
  'list',
  'calendar',
  'kanban',
  'timeline',
] as const

export type ArenaGenerativeRepresentation = (typeof ARENA_GENERATIVE_REPRESENTATIONS)[number]

const REPRESENTATION_SET = new Set<string>(ARENA_GENERATIVE_REPRESENTATIONS)

const REPRESENTATION_ALIASES: Record<string, ArenaGenerativeRepresentation> = {
  card: 'cards',
  grid: 'cards',
  rows: 'table',
  chronology: 'timeline',
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
  'Archetype is the job. Representation is how a collection body is shown. Do not invent catalog types (no Kanban or List component).',
  'auto — BindingLayoutPlan wins: same-page prose collection → Cards or List; uniform scalars with no per-row identity → Table; else Cards.',
  'table — comparable rows, mostly scalars, scanning or comparison. Use Table. Honour this even if a gold few-shot used Cards. Headers sort loaded rows.',
  'cards — each entity has heterogeneous information (description, image, context). Repeat inside Grid of Card. Never unroll an array into static Cards.',
  'list — entities are primarily text or content. Repeat of Disclosure when each row has a short title and a longer body (FAQ, criteria); otherwise Repeat of text rows (Heading/Text/Chip), no Card chrome.',
  'calendar — dated entities plotted on a month or week grid. Use Calendar (statePath, dateField, titleField, view month|week). Do not degrade to a dated Repeat.',
  'kanban — entities have a meaningful workflow or status dimension. No Kanban type: grouping + Repeat (or Table) segmented by the status hostKey.',
  'timeline — chronological ordering is the primary relationship. Use Timeline (statePath, dateField, titleField). Do not degrade to a dated Repeat.',
  'table, cards, list, calendar, and timeline override gold and auto. auto never fights layoutPlan.hostKeys or same-page prose selection.',
].join('\n')
