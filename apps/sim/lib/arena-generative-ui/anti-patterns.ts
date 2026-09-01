/**
 * Explicit Never list for the spec LLM. Catalog types only; dead Buttons are
 * host-validated. Positive how stays in selection / layout / hierarchy.
 */

export const ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT = [
  'ANTI-PATTERNS',
  'Never emit these. Catalog types only; the host rejects a Button with no verb.',
  'data — Never hard-code dynamic data. Bind Stat, Table, Repeat, or DataText with statePath (or page onLoad). Do not put invented numbers in Stat.',
  'stats — Never create fake statistics. Stat only from layoutPlan / outputSchema hostKeys. Do not emit Stat to fill a dashboard.',
  'charts — Never create a decorative Sparkline. Sparkline needs values or statePath. Do not emit Sparkline as chrome.',
  'table — Never use Table for narrative entities. That is Repeat of Cards. Table is comparable scalars with no per-row identity.',
  'form — Never create a Form or SearchField when no user input is required (onLoad-only dashboard). Do not add a parameters form the brief did not ask for.',
  'tabs — Never use Tabs for unrelated actions. Tabs are three or more peer views. Unrelated CTAs are Button / NavLink.',
  'cards — Never nest Cards unnecessarily. Card is one conceptual group or a Repeat item. Do not wrap every Section in a Card.',
  'calls — Never duplicate API calls. One actionId per job. A results page must not onLoad the same CTA that already navigated there.',
  'nav — Never create navigation without a destination. NavLink.to / Button.navigateTo must be a page path. Do not use href for an in-app page.',
  'loading — Never show loading indefinitely without recovery. Bind statePath; the host skeletons, Refresh, and Retry. Do not emit a Spinner with no way out.',
  'errors — Never hide errors. The host shows a banner. Do not omit emptyText or emit a silent dead end.',
  'hover — Never use hover as the only way to discover actions. Put Button / Toolbar in the layout. Do not rely on hover-only chrome (the catalog has none).',
  'destructive — Never place a destructive Button beside the primary without distinction. variant "destructive" (host paints outline danger). Confirm is host.',
  'dead — Never generate dead buttons. Every Button needs actionId, navigateTo, href, selectItem, clearItem, or setValue (to open a Modal/Drawer). SubmitButton needs a Form or actionId.',
  'pages — Never create pagination without enough data. Load more only when the binding declares pagination, with showWhen "hasMore". Do not invent a second next-page action.',
  'filters — Never create a Filter that does not affect data. Name Filter children after collection columns (host filters locally) or query fields the collection onLoad / CTA actually sends.',
  'search — Never create a SearchField that does not modify the collection. Omit actionId to filter the on-page Table/Repeat; with actionId, bind the destination Repeat, Table, or DataText to that declared action.',
].join('\n')
