import postgres from 'postgres'

const GUI_WORKFLOW_ID = '7fca0609-b724-4c8a-9be5-749d5f30f192'
const ARENA_TYPE = 'arena_generative_ui'

const USER_INPUT = `Article Recommendation Agent. Three pages: home (Generator), results, history.

Tabs at the top-right of every top-level page: "Generator|home" and "History|history". Home is the default.

Home is a left-aligned form titled "Article Recommendation Agent" with subtitle
"Turn a target keyword and client into writer-ready article recommendations."
Fields:
- keyword (text) — label "Target Keyword", placeholder "Dental implants"
- client (text) — label "Client / Brand", placeholder "42 North Dental"

Submit label is "Generate Recommendations". It calls recommend_article, then go to results.
Do not put a progress bar, checklist, spinner, Cancel, or elapsed timer on the form.
Do not add an email field.

Results:
- No onLoad — data comes from generate or from History Open, not a fetch on arrival
- Back to Generator at the top
- Two pills: "Keyword: {keyword}" and "Client: {client}"
- Bind the markdown on DataText statePath "content" (or the string field name).
  Do not bind field.content when the API returns a string.
  (H1 title, repeating H2 sections with bold Writing Instructions and Target Keywords bullet lists,
  optional Visual / Table Opportunities callouts, FAQ with bold Q: and plain A:)
- While recommend_article is running, Results should look like it is loading — not empty.
  Header copy can be Working on "{keyword}" for {client}…

History page onLoad calls run_history (do not call it from the tab click).
Repeat cards bound to history, most recent first: keyword, client, and date only
({item.keyword} or {item.input.keyword}, {item.client} or {item.input.client}, {item.date} or {item.createdAt}).
Do not bind item.output, content, body, or a Table column for the markdown — not on the card, not as Card.description.
Each card has a Button labeled "Open" with selectItem true, no actionId, and no navigateTo.
Open stays on History. Hide the list (Repeat or its wrapper showWhen "!selectedId") and show that row's markdown
(DataText statePath "content", showWhen "selectedId") with a ghost Back Button clearItem true, showWhen "selectedId".
Back is not an API call and must not navigateTo — it hides the detail and shows the list again.

Do not show raw JSON anywhere.
Do not add Copy Markdown, Download PDF, a 1250px shell, or a History badge count.`

const RECOMMEND_SAMPLE = JSON.stringify({
  content: `# Digital Camera Guide (2026): Types, Key Features, and How to Choose the Right One

## What Is a Digital Camera (and Why Use One in 2026)?
**Writing Instructions:**
- Define digital camera and that it records photos and videos digitally
- Contrast dedicated cameras vs smartphones
**Target Keywords:**
- digital camera
- what is a digital camera
**Visual / Table Opportunities:**
- Simple comparison table: smartphone vs digital camera

## FAQ
**Q: Do I still need a camera if I have a phone?**
A: A dedicated camera still wins for lenses, handling, and tracking when those matter more than convenience.
`,
})

const HISTORY_SAMPLE = JSON.stringify({
  history: [
    {
      id: 'run_1',
      email: 'writer@example.com',
      input: { keyword: 'digital camera', client: 'Panasonic' },
      output:
        '# Digital Camera Guide (2026): Types, Key Features, and How to Choose the Right One\n\n## What Is a Digital Camera\n**Writing Instructions:**\n- Define digital camera\n',
      createdAt: '2026-09-03T12:05:00.000Z',
    },
  ],
})

const RECOMMEND_SCHEMA = [{ name: 'content', type: 'string' }]
const HISTORY_SCHEMA = [
  { name: 'history', type: 'array' },
  { name: 'history[].id', type: 'string' },
  { name: 'history[].email', type: 'string' },
  { name: 'history[].input', type: 'object' },
  { name: 'history[].input.keyword', type: 'string' },
  { name: 'history[].input.client', type: 'string' },
  { name: 'history[].output', type: 'string' },
  { name: 'history[].createdAt', type: 'string' },
]

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('DATABASE_URL missing')
}

const sql = postgres(url, { ssl: 'require', max: 1 })

const rows = await sql`
  select id, sub_blocks
  from workflow_blocks
  where workflow_id = ${GUI_WORKFLOW_ID} and type = ${ARENA_TYPE}
  limit 1
`
const row = rows[0]
if (!row) {
  throw new Error('Arena Generative UI block not found')
}

const subBlocks = row.sub_blocks as Record<string, { value?: unknown }>
const rawBindings = subBlocks.apiBindings?.value
const bindings = (
  typeof rawBindings === 'string' ? JSON.parse(rawBindings) : rawBindings
) as Array<Record<string, unknown>>

if (!Array.isArray(bindings)) {
  throw new Error('apiBindings is not an array')
}

const nextBindings = bindings.map((binding) => {
  if (binding.key === 'recommend_article') {
    return {
      ...binding,
      outputSample: RECOMMEND_SAMPLE,
      outputSchema: RECOMMEND_SCHEMA,
      outputSchemaSource: 'sample',
    }
  }
  if (binding.key === 'run_history') {
    const inputSchema = Array.isArray(binding.inputSchema)
      ? (binding.inputSchema as Array<Record<string, unknown>>).map((field) =>
          field.name === 'type'
            ? { ...field, source: 'constant', value: 'article_recommendation' }
            : field
        )
      : binding.inputSchema
    return {
      ...binding,
      inputSchema,
      outputSample: HISTORY_SAMPLE,
      outputSchema: HISTORY_SCHEMA,
      outputSchemaSource: 'sample',
    }
  }
  return binding
})

const storedBindings =
  typeof rawBindings === 'string' ? JSON.stringify(nextBindings) : nextBindings

subBlocks.userInput = { ...(subBlocks.userInput ?? {}), value: USER_INPUT }
subBlocks.operation = { ...(subBlocks.operation ?? {}), value: 'generate' }
subBlocks.pages = { ...(subBlocks.pages ?? {}), value: '' }
subBlocks.apiBindings = { ...(subBlocks.apiBindings ?? {}), value: storedBindings }

await sql`
  update workflow_blocks
  set sub_blocks = ${sql.json(subBlocks as never)}, updated_at = now()
  where id = ${row.id as string}
`

const verify = await sql`
  select sub_blocks
  from workflow_blocks
  where id = ${row.id as string}
`
const saved = verify[0].sub_blocks as Record<string, { value?: unknown }>
let savedBindings = saved.apiBindings?.value
if (typeof savedBindings === 'string') {
  savedBindings = JSON.parse(savedBindings)
}
const summary = Array.isArray(savedBindings)
  ? savedBindings.map((binding: Record<string, unknown>) => ({
      key: binding.key,
      outputSchemaSource: binding.outputSchemaSource,
      outputSchemaNames: Array.isArray(binding.outputSchema)
        ? (binding.outputSchema as Array<{ name?: string }>).map((field) => field.name)
        : [],
      typeSource: Array.isArray(binding.inputSchema)
        ? (binding.inputSchema as Array<Record<string, unknown>>).find(
            (field) => field.name === 'type'
          )?.source
        : undefined,
    }))
  : []

console.log(
  JSON.stringify(
    {
      operation: saved.operation?.value,
      userInputLen: String(saved.userInput?.value ?? '').length,
      bindings: summary,
    },
    null,
    2
  )
)

await sql.end()
