/**
 * Catalog generator rules grouped for the spec prompt pipeline.
 * `ARENA_GENERATIVE_UI_OUTPUT_RULES` is the concatenation for existing imports.
 */

/** Mechanical JSON envelope — numbered RULES after the catalog reference. */
export const ARENA_GENERATIVE_UI_ENVELOPE_RULES = [
  'Output a single complete JSON object. Do NOT wrap it in markdown fences. Do NOT output JSONL patches.',
  'Shape: { "title": string, "content": string, "manifest": { "entryPath": string, "theme?", "pages": { [path]: { "title", "path", "spec", "onLoad?" } }, "actions": { [actionId]: { "apiKey?", "inputMapping?", "append?", "onSuccess?", "onError?" } } } } }',
  'manifest.pages MUST be an object keyed by kebab-case path, never an array. Example: { "home": { "path": "home", "title": "People", "spec": { ... } }, "person": { "path": "person", "title": "Profile", "spec": { ... } } }.',
  'Return one JSON object only. Do not emit a short summary object before the manifest.',
  'Each page spec is a json-render Spec: { "root": string, "elements": { [key]: { type, props, children } } }.',
  'Every page Spec root element must be type Page.',
  'Every element must include a children array (use [] for leaves).',
  'Every element needs type, props, and children, under a unique descriptive key in its page elements map ("home-header", "stat-revenue").',
  'Before finishing a page, walk its tree from root: every key in every children array must exist as its own entry in that page elements map. Add any element you referenced but did not define.',
  'Only use component types from the catalog.',
  'Use NavLink.to or Button.navigateTo for in-app navigation. Never use href for another page in this app.',
  'CTA forms must set Form.actionId or SubmitButton.actionId to a key in manifest.actions.',
  'When an action has apiKey, it MUST be one of the declared API binding keys. Do not invent API keys. Dummy/local actions omit apiKey and use onSuccess.setState / navigate.',
  'If no API bindings were declared, keep dummy/local actions in manifest.actions with no apiKey. Do not omit create, complete, analyze, dummy collection seed/onLoad, or other requested mutations. Navigation-only apps may leave actions empty.',
  'onSuccess.navigate and NavLink.to / Button.navigateTo / navigate action `to` must be existing page paths, optionally followed by a query string such as "report?range=30d".',
  'Every page must be reachable from entryPath via NavLink, navigateTo, navigate, or onSuccess.navigate.',
  'DataText, Text, Alert, and ListItem render markdown. Put a prose API body on a single DataText; do not split markdown into Heading/List elements.',
  'emailId is optional. Do not invent a login form. App identity is AppHeader, not Image.',
] as const

/**
 * Mechanical wiring. When-to-pick-a-type lives in component-decisions.ts.
 */
export const ARENA_GENERATIVE_UI_COMPONENT_RULES = [
  'Spacing: group related elements into a Card or Stack so data reads as chunks, and leave real space between groups. gap and padding take spacing tokens (none, xs, sm, md, lg, xl, 2xl). Prefer gap "lg" between groups. CSS lengths still work; do not invent arbitrary px.',
  'Surfaces: there are exactly two — the page canvas and the Card/Stat surface, both supplied by the host from the Arena Design System (manifest.theme or host defaults). Do not set backgroundColor unless the brief names a specific colour. Do not paint hierarchy with fills or borders — DESIGN GUIDELINES owns weight.',
  'Collections: put a Repeat inside a Grid (columns 2 or 3) or Stack, bound to the array statePath; Repeat\'s children are the per-item template and render once per element. Never unroll a live array into one static Card per item, and never wrap Grid in Repeat (that produces N grids). Bind per-item fields with statePath "item.field". Put per-item values into navigation and hrefs with "{item.id}" — NavLink.to "order?id={item.id}" opens the detail page so its onLoad receives that id. A Button.selectItem inside Repeat copies the row into host state without an API call; a Button.actionId sends the item fields as the action input. Never bind a long prose field (output, content, body) inside Repeat — not item.output, not Card.description, not a Table column.',
  'Loaded row selection: when list items already include a prose field (history[].output, items[].content), Open is Button selectItem true with no actionId. It copies prose to content plus selected/selectedId — it does not restamp inputs. If the brief opens a separate results/detail page, add navigateTo that page (no onLoad there) so DataText statePath "content" shows the row. Same-page History (prose already on the row, no Workspace or Drawer inspector): omit navigateTo, hide the Repeat (or its Grid/Stack/Section) with showWhen "!selectedId", put the markdown in a sibling Section showWhen "selectedId" with a ghost Back Button clearItem true (no navigateTo). Do not append History markdown below an always-visible Repeat. Workspace and Drawer keep the collection visible — do not hide navigator or primary with !selectedId; inspectorWhen or Drawer showWhen "selectedId" reveals the inspect region. Do not invent a second fetch for a field already on the row. When the list API only returns an id, keep the fetch-one detail onLoad instead. History cards bind item.keyword / item.client only inside Repeat. Results after Generate still echo the home form names ({targetKeyword}, {clientBrand}), not those history keys ({keyword}, {client}).',
  'Forms: every interactive field carries an explicit label. Pair short related fields (TextInput, NumberInput, DateInput, Select) side by side in a Grid (columns 2) and keep long free-text, RadioGroup, MultiSelect, Checkbox, and Switch full width. Multi-field forms have one SubmitButton and an optional Back NavLink, and default to left-aligned. A one-field search is SearchField (placeholder is enough; optional label) — never a labelled Grid of one TextInput.',
  'Form controls: SearchField (pill query with nested submit and optional suggestion chips), TextInput (one line), TextArea (prose), NumberInput (counts and amounts; min/max/step as decimal strings), DateInput (YYYY-MM-DD), Select (one of a comma-separated options list), RadioGroup (a short visible exclusive list — use Select when there are more than five options), MultiSelect (several of that list, submitted as an array), Checkbox (must-tick boolean), Switch (on/off preference). Every field needs name; labelled fields also need label. defaultValue seeds the control (comma-separated for MultiSelect); Checkbox/Switch also accept defaultChecked. statePath reads a host-state key instead when set. showWhen hides a field until a sibling matches: "notify" means that field is truthy, "!selectedId" means it is unset, "channel=email" means equality, "channel!=sms" inequality, and comma-separated clauses are AND. Hidden fields are not submitted and are not validated. required plus optional errorText run on submit — do not add a second Text for the error. File attach lives on Chat, not on the form. Never name a form control input, conversationId, or files.',
  'Hero: a search field beside its button is SearchField, not a centred Stack of TextInput and SubmitButton. Multi-field forms stay left-aligned. justify accepts exactly start, center, between, end (never "space-between" or a CSS value).',
  'Chrome: Page children are AppHeader then Section. AppHeader is the sticky product bar (icon + name, optional trailing actions) — a direct child of Page, never inside Section. Start the Section with PageHeader (kicker, title, subtitle, optional trailing child) instead of a bare Heading. Filter children are Select, TextInput, DateInput, or Chip named after collection columns — the host filters locally when those fields have no actionId. Modal and Drawer use showWhen; open with a Button setValue that sets the flag (`creating=true` for create, `editing=true` for edit); close with a ghost Button setValue that clears it (`creating=` / `editing=`), or clearItem when showWhen is selectedId. Do not reuse creating for edit.',
  'Emphasis: Button variant is primary, secondary, ghost, outline, or destructive and defaults to secondary. SubmitButton and SearchField already render as primary. There is no colour prop on Button — which variant to pick is DESIGN GUIDELINES.',
  'Navigation: Tabs items are newline-separated "Label|path" lines with distinct page paths; set activePath to the current path. A search hero omits Tabs. Detail and progress pages are reached with NavLink/navigateTo and offer a Back NavLink.',
  'Avatars: content logos and initials belong on Avatar or EntityHeader (src, initials, or statePath including "{item.logo}"). App identity is AppHeader. Do not fake a wordmark with Icon + Heading inside Section, and do not use Image as a wordmark.',
] as const

export const ARENA_GENERATIVE_UI_INTERACTION_RULES = [
  'WorkingCard: the host ticks steps and the bar. Use it when a CAPABILITY selected long-running, multi-step, or cancellable. Do not emit ProgressSteps, a filling ProgressBar, or Spinner as the wait. A Stat with a literal value or a Table with literal rows never shows a skeleton. For a static-children region you may add {"type":"Skeleton","props":{"variant":"card","lines":3},"children":[]}.',
  'Empty copy: bound Table, Repeat, and KeyValue use emptyText (defaults: "No results" for Table and Repeat, "No details" for KeyValue). A DataText fallback is the empty copy for prose. Customise emptyText when the brief names the collection ("No matching articles"). Do not add a second Text or Alert for that.',
  'Result pages: when onSuccess.navigate is set, bind the destination Table/Repeat/Stat/Chart/KeyValue/DataText.',
] as const

export const ARENA_GENERATIVE_UI_RESPONSIVE_RULES = [
  'Layout: compose for a full page up to 1280px. Grid and Columns collapse to one column in a narrow Arena iframe — do not design as a permanently narrow single column, and do not assume the iframe is 1280px. Do not set maxWidth unless the brief demands an exact cap.',
  'This app renders as a full page up to 1280px and also embeds in a narrow Arena iframe (Grid and Columns collapse).',
] as const

export const ARENA_GENERATIVE_UI_ACCESSIBILITY_RULES = [
  'Typography: one h1-level page title per page (PageHeader.title counts), then a short supporting subtitle. Never title a page "Page 1" or use lorem ipsum.',
  'Heading order: nest levels sequentially and never skip or invert them. PageHeader.title is the page h1 and Card.title renders an h2, so a Heading inside a Card starts at h3.',
  'Every interactive field carries an explicit label. Do not use color as the only state indicator.',
] as const

/** Full catalog contract. Generate uses the grouped exports via the prompt pipeline. */
export const ARENA_GENERATIVE_UI_OUTPUT_RULES = [
  ...ARENA_GENERATIVE_UI_ENVELOPE_RULES,
  ...ARENA_GENERATIVE_UI_COMPONENT_RULES,
  ...ARENA_GENERATIVE_UI_INTERACTION_RULES,
  ...ARENA_GENERATIVE_UI_RESPONSIVE_RULES,
  ...ARENA_GENERATIVE_UI_ACCESSIBILITY_RULES,
] as const
