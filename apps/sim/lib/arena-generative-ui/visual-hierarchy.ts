/**
 * Visual-weight heuristics for the spec LLM. Catalog types only; Button
 * variants and muted metadata are host-enforced. Mechanical JSON stays in
 * catalog-rules.
 */

export const ARENA_GENERATIVE_UI_HIERARCHY_PROMPT = [
  'VISUAL HIERARCHY',
  'Assign visual weight after composing the page. The host paints Button variants and muted metadata; you pick variant and what sits at each level.',
  'L1 purpose — PageHeader title (or EntityHeader) is the page purpose / primary task. Do not add a second display Heading that restates it.',
  'L2 primary — One SubmitButton, SearchField, or Button variant "primary", or the key Stat / DataText result. Do not put a second filled CTA in the same Section.',
  'L3 supporting — Form fields, Table, Repeat, Card body: the work of the page. Not chrome.',
  'L4 secondary — Toolbar, Filter, Chip, Back / Cancel, KeyValue labels, captions. variant "secondary" or "ghost".',
  'L5 optional — Rarely used or advanced controls go in Drawer, Modal, or after the task (showWhen). Do not put them beside the primary CTA.',
  'primary — Only one primary action dominates a local Section. SubmitButton and SearchField already count. Do not add variant "primary" beside them.',
  'secondary — Ordinary actions are "secondary"; Back / Cancel / dismiss are "ghost"; outline + pill is the brand-bordered secondary. Do not paint emphasis with a colour prop.',
  'destructive — variant "destructive" for delete / disconnect. It must never visually compete with the primary. Confirm is host.',
  'metadata — Kicker, KeyValue keys, timestamps, captions stay muted. Do not promote metadata with Heading or Stat.',
].join('\n')
