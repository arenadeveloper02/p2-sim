/**
 * When / not-when component selection for the spec LLM. Mechanical wiring
 * (item.field, showWhen syntax, form controls) stays in catalog-rules.
 */

export const ARENA_GENERATIVE_UI_COMPONENT_SELECTION_PROMPT = [
  'COMPONENT SELECTION RULES',
  'Pick the catalog type that matches the job. Do not invent types.',
  'EntityHeader — the page represents one record (company, order, person). Not a task or search home.',
  'AppHeader — sticky product chrome (mark + app name). Direct child of Page, once per page. Not PageHeader and not Icon + Heading in a Stack.',
  'PageHeader — task-oriented pages with no single entity (search, generate, workflow step). Use instead of a bare Heading. Lives in Section, under AppHeader.',
  'Card — an independent conceptual group, or a Repeat entity item.',
  'Table — comparable rows of the same scalar fields, no per-row visual identity.',
  'Repeat — each item has its own visual representation (Card, avatar, action). Put Repeat inside Grid; never wrap Grid in Repeat.',
  'Grid — two or more peer cells. Do not use Grid merely to place one component.',
  'Tabs — three or more peer top-level views. Not sequential workflow steps (those are Stepper plus pages or sections). Not Workspace regions.',
  'Stepper — sequential workflow progress. Not Tabs and not ProgressSteps.',
  'Workspace — simultaneous navigator + primary + optional inspector. Children in that order. Not Columns twice and not Tabs.',
  'Modal — create a record or a focused secondary action (rename, add a note). Open with Button setValue + showWhen. Not a multi-step workflow. Not delete confirm — the host owns that.',
  'Drawer — contextual detail that must keep the list visible. Prefer this over navigating away when the row already has prose (selectItem + showWhen). Not a full record page that needs its own onLoad.',
  'SearchField — the primary task is finding or looking up entities (one query). Not a labelled Grid of one TextInput.',
  'Filter — narrowing an already-loaded collection. Place it in a Toolbar above Table/Repeat. Not a second SearchField hero.',
  'Stat — a small set of high-value metrics. Never use Stat for arbitrary text (that is Text or DataText).',
  'Alert — persistent in-content status the brief asked for (a disclaimer). Not field errors, API failure, or save success (host banner/toast).',
  'Toast — transient in-content feedback the brief asked for. Not save success or API failure (host).',
  'Skeleton — only for a static-children region whose layout is known. Bound Table, Repeat, Stat, KeyValue, and DataText already skeleton; prefer statePath.',
  'KeyValue — one record’s scalar pairs. Not a collection (Table/Repeat) and not prose (DataText).',
  'WorkingCard — a long-run wait the brief named (steps, estimate, or Cancel). Not ProgressSteps, ProgressBar, or Spinner.',
  'DataText — a markdown or prose body. Do not invent Table columns from unstructured output.',
  'EmptyState — the page has no collection yet and Repeat/Table emptyText is not enough. The child is the next useful action (SearchField, Button, or NavLink). Not a loading state.',
  'Columns — main area plus a supporting sidebar. Not a 2-column form (that is Grid).',
  'Toolbar — a row of filters or secondary actions. Filters belong here, not scattered through content.',
].join('\n')
