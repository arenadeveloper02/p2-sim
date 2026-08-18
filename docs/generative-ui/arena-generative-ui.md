# Arena Generative UI

How to generate a multi-page Arena app with the **Arena Generative UI** block, then publish it.

This is not the older **Generative UI** block. That block still emits a static HTML/email Spec. Arena Generative UI creates an interactive draft (pages, navigation, forms, CTAs) and only becomes a public URL after you publish it from Deploy.

## What you get

| Surface | Path |
|---|---|
| Public app | `/gui-apps/{identifier}` |
| Draft preview (session only) | `/gui-apps/preview/{draftId}` |
| JSON APIs | `/api/gui-apps/...` |

A published GUI app is a Sim page at `/gui-apps/{identifier}`, the same way `/chat/{identifier}` is a page. Open it in a new browser tab, or embed it in Arena. The block does not generate a login form. Turn on **Require Arena emailId** only when Arena should pass `?emailId=` on the iframe URL.

## End-to-end flow

1. Add an **Arena Generative UI** block to a workflow.
2. Fill in the brief (and optional pages / API bindings).
3. Run the workflow. The block **saves a draft** — it does not publish.
4. Open **Deploy → GUI App** (not Deploy → App, which is the existing external-redirect flow).
5. Pick the draft and click **Preview** (or **Preview draft**) to click through pages and run CTAs before publish.
6. Set identifier / title / category / access, then **Launch GUI App**.
7. Share `{base}/gui-apps/{identifier}`. For Arena embeds, add `?emailId=` and turn on Require Arena emailId.

Edit later by switching the block to **Edit Existing Draft**, running again (new revision), then launching from Deploy again.

You can also attach **Arena Generative UI** as an Agent tool (Built-in Tools). Pick Generate or Edit on the tool. Drafts still belong to this workflow — preview and Launch from **Deploy → GUI App**. For Edit, pin a Draft or let the agent pass `existingDraftId` from a prior generate.

---

## Preview before publish

Preview is session-only. It does not publish a URL and does not use Chat or Deploy → App.

From **Deploy → GUI App**, pick a draft and open **Preview**. That loads `{base}/gui-apps/preview/{draftId}` (then the draft `entryPath`). You must be signed in and have access to the workflow.

- Navigation and forms work against the latest draft revision.
- CTAs use the same runner as production: bound workflows must already be deployed; HTTP hosts must pass the same allowlist rules.
- Preview skips Arena `emailId` and the published password / email / SSO gates.
- `preview` is a reserved public identifier because it is a static `/gui-apps` segment.

---

## Block fields

### Mode

- **Generate New App** — create a new draft on this workflow.
- **Edit Existing Draft** — load a draft, apply the User Input as change instructions, save a new revision.

### User Input (required)

Describe the app in **plain language**. This field is prose, not JSON. Only **Pages** and **API Bindings** are JSON — leave them empty unless you are pinning a sitemap or wiring CTAs.

The model uses this brief to invent pages, copy, forms, and navigation.

Include:

- App name and purpose
- Pages and what each one is for
- How the user moves between pages (tabs, Back, submit-then-go-to-results)
- CTA labels and which named API each CTA should call (must match an API Bindings key)
- Form fields

Example:

```
Lead qualifier. Home is a form: company, role, notes.
Submit calls qualify_lead, then go to Results.
Results shows score and a Back link.
```

Use the wand on this field if you want the brief expanded before you run.

### Pages (Generate only, optional JSON)

Pin the sitemap. If you leave this empty, the model proposes a small set of pages from User Input.

Each path must be kebab-case (`home`, `results`, `team-detail`).

```json
[
  { "path": "home", "title": "Form", "purpose": "Collect lead details" },
  { "path": "results", "title": "Score", "purpose": "Show qualification result" }
]
```

If you pass this list, the generator must emit **exactly these paths**.

### Entry Path (Generate only, optional)

First page after open. Defaults to `home`. Must match a page path.

### API Bindings (optional JSON)

Named backends that CTAs may call. The model **cannot invent keys**. Leave this empty (or `[]` / `{}`) for a navigation-only app — no workflow/HTTP calls.

Two kinds:

**Workflow** — runs another **already deployed** workflow through the host proxy. Form values become that workflow’s start inputs.

```json
[
  {
    "key": "qualify_lead",
    "kind": "workflow",
    "workflowId": "wf_...",
    "label": "Qualify",
    "inputSchema": [
      { "name": "company", "type": "string" },
      { "name": "role", "type": "string" },
      { "name": "notes", "type": "string" }
    ]
  }
]
```

**HTTP** — server-side fetch to an allowlisted URL. Production requires `https`. Private/loopback hosts are rejected. Optional `headersSecretName` is a **workspace environment variable** name; the secret is never sent to the browser.

```json
[
  {
    "key": "crm_lookup",
    "kind": "http",
    "label": "Lookup",
    "http": {
      "method": "POST",
      "url": "https://api.example.com/lookup",
      "headersSecretName": "CRM_API_TOKEN"
    },
    "inputSchema": [{ "name": "email", "type": "string" }],
    "outputSchema": [
      { "name": "articles", "type": "array" },
      { "name": "articles[].title", "type": "string" },
      { "name": "articles[].url", "type": "string" },
      { "name": "count", "type": "number" }
    ]
  }
]
```

`inputSchema` is a hint for the generator (field names to collect and map). It is not a runtime validator.

### Output format (`outputSchema`)

`outputSchema` tells the generator what the API returns so it can lay the result out as a `Table`, `Stat`, or `KeyValue` instead of dumping one blob of text. Like `inputSchema` it is a generator hint only — nothing is validated against the live response, and a wrong entry cannot break a CTA.

The easiest way to fill it is the **Output format** field in **Add an API**: paste a sample response and Sim derives the field names and types in the browser. **Only names and types are saved** — the pasted values are discarded and never reach the database or the model, so a sample containing real data is safe.

Field names are ready-to-use `statePath` values, because of how a successful CTA lands in app state:

| Response | State | `statePath` |
| --- | --- | --- |
| `{ "articles": [...], "count": 3 }` | top-level keys merged | `articles`, `count` |
| `[ { ... } ]` or `"text"` | wrapped | `result` |
| anything | text rendering of the whole body | `content` |

So `statePath` is the response key itself — `articles`, never `data.articles` or `output.articles`. An `articles[].title` entry means `articles` is an array of objects with a `title`, which the generator turns into `Table statePath="articles" columns="title, url"`.

Derivation walks 3 object levels, describes arrays from their first element, and caps at 40 fields.

### Design Notes (optional)

Brand, density, tone. Generated apps are wide responsive full-page screens: the container fills the available width up to 1280px, collections become grids or tables, and `PageHeader` / `Tabs` carry the page chrome. No logo or wordmark — the host supplies the outer shell. Example: “Calm Arena-like layout, dense two-column dashboard, one primary CTA per screen.”

Ask for `narrow` explicitly in Design Notes if you want the old focused single-column form look.

The generator is held to a few constraints you do not need to restate:

- **Two surfaces only** — the page canvas and the white card. Hierarchy comes from heading level, weight and whitespace, not coloured fills. Name a specific colour in Design Notes if you want one.
- **Readable measure** — dashboards and tables stay wide, but narrative prose drops into a `narrow` Section so a report body never runs the full 1280px.
- **Sequential headings** — `PageHeader.title` is the page `h1` and `Card.title` renders an `h2`, so levels never skip or invert.
- **Labeled, left-aligned fields** — short related fields pair up in a `Grid`, long free-text stays full width.
- **Real spacing** — `gap` and `padding` are CSS lengths (`16px`), and size words are converted rather than silently dropped.

The system prompt also carries a validated gold-standard reference layout ([gold-example.ts](../../apps/sim/lib/arena-generative-ui/gold-example.ts)), which a test asserts against `validateArenaGenerativeManifest` so the example can never drift into teaching an invalid shape.

### Draft (Edit mode)

Dropdown of drafts you own. Prefer the draft that belongs to **this** workflow. Running Edit without a selected draft fails.

---

## Writing a good brief

Do:

- Name the pages and the CTA keys (`qualify_lead`, not “call the API”).
- Say what happens after submit: “then go to results”.
- Ask for Back / NavLink on every secondary page. Every page must be reachable from the entry page.
- Keep the sitemap small (two or three pages is typical).

Avoid:

- Asking for a login screen. Arena already passes `emailId`.
- Outbound `href` links for in-app pages. In-app nav uses `NavLink` / `navigateTo`.
- CTA keys that are not in API Bindings.

If generation fails validation, tighten Pages + API Bindings and rerun. Common failures: invented API keys, unreachable pages, invalid kebab-case paths.

---

## Block outputs

After a successful run:

| Output | Use |
|---|---|
| `draftId` | Select this draft in Deploy → GUI App |
| `revisionId` | Snapshot that Deploy publishes |
| `entryPath` | Opening page |
| `pages` | `{ path, title }[]` |
| `content` | Short summary |
| `manifest` | Full multi-page json-render JSON |

The canvas preview of the workflow is **not** the hosted app. Open the published URL after Launch.

---

## Publish (Deploy → GUI App)

This tab is separate from **Deploy → App** (development / external redirect). GUI App publishes a Sim-hosted `/gui-apps/{identifier}` page.

If you have not run the block yet, the tab tells you to create a draft first.

Fields:

| Field | Notes |
|---|---|
| Draft | Latest drafts for **this workflow** |
| Identifier | URL slug. Lowercase letters, numbers, hyphens. Unique among live apps. Live at `/gui-apps/{identifier}` |
| Title | Shown on the hosted app |
| Category | Required department/category |
| Description | Optional |
| Require Arena emailId | Off by default so Sim Open / direct URLs work like `/chat`. On: host returns “Do not have access” unless `?emailId=` or the `arena_email_id` cookie is present (for Arena embeds) |
| Access control | `public`, `password`, `email`, or `sso` (SSO only when enabled). Same style as deployed chat. This is not the Arena emailId gate |
| Allowed emails | Required for `email` / `sso`. Supports addresses and `@domain.com` |
| API bindings | Read-only list from the selected draft |

Launch GUI App publishes the selected revision and opens the live Sim URL in a new tab.

**Archive deployment** unpublishes the live URL. It does not delete drafts. You can launch again later.

Updating: pick a newer draft/revision (after an Edit run), keep the same identifier, then **Update GUI App**.

---

## Opening the live app

Open in a browser tab (no iframe required):

```
https://{host}/gui-apps/{identifier}
https://{host}/gui-apps/{identifier}/results
```

Embed in Arena (optional). Turn on **Require Arena emailId** and pass the query:

```
https://{host}/gui-apps/{identifier}?emailId=user@example.com
```

When `emailId` is present, the host stores `arena_email_id` (HttpOnly, `Path=/`) so in-app navigation keeps it.

If the emailId gate is on and there is no `emailId`, visitors see **Do not have access**.

Then chat-style access control still applies (`password` / `email` OTP / `sso`) if you selected those.

Control-bar **Open** uses Chat/App first when those exist. If only a GUI App is published, Open goes to `/gui-apps/{identifier}` without `emailId` (works when the gate is off). Launch GUI App from the Deploy tab always opens the Sim URL.

---

## How CTAs run (after publish)

Clicks never call third-party APIs from the browser. The published host POSTs to `/api/gui-apps/{identifier}/actions/{actionId}`. Draft preview POSTs to `/api/gui-apps/drafts/{id}/actions/{actionId}` (session required).

- **Workflow** — `executeWorkflow` on the bound workflow. That workflow must be **deployed**. Inputs are the form values, optionally remapped by `inputMapping` in the manifest.
- **HTTP** — server fetch. Host must match the allowlist frozen at publish time. Timeout 15s, response cap 1MB. Auth headers come from the workspace env var named in `headersSecretName`.

On success the host may navigate (`onSuccess.navigate`) and merge `setState` so `DataText` can show results (for example `score`).

---

## UI catalog (what the model may emit)

Layout: `Page`, `Section` (`width`: `narrow` / `wide` default / `full`), `Stack` (`direction`, `justify`, `wrap`), `Card`, `Grid` (`columns` 2–4, collapses to one column when narrow), `Columns` (`equal` / `sidebar-left` / `sidebar-right`)

Chrome: `PageHeader` (title, subtitle, trailing action), `Toolbar`, `Tabs` (`items` as newline-separated `Label|path`, `activePath`)

Copy: `Heading`, `Text`, `DataText`, `Alert`, `List`, `ListItem`, `Divider`, `Image`

Data display: `Table` (static `columns` + `rows`, or `statePath` bound to an array of objects), `Stat` (`label` + `value` or `statePath`, plus an optional `delta` / `deltaTone` change indicator), `KeyValue` (`key: value` rows or a `statePath` object), `Badge`

Input: `Form`, `TextInput`, `TextArea`, `Select`, `SubmitButton`

Loading: `Skeleton` (`variant`: `text` / `stat` / `table` / `card` / `form`, plus `lines`), `Spinner`, `ProgressSteps` (newline-separated step labels shown while a CTA is pending)

Nav / CTA: `NavLink` (`to` = page path), `Button` (`navigateTo` / `actionId` / outbound `href`), `Link`

Paths listed in `Tabs.items` count as navigation, so a page reachable only through a tab still validates.

There are no charts in this catalog. The chart and dashboard sketches in `charts-overview.md` target the separate static-HTML `generative_ui` block, not this one.

### Component aliases

Models often reach for names from other design systems. Those are rewritten to the canonical type before validation rather than rejected, so a draft is not lost to a naming mismatch:

| Emitted | Rendered as |
| --- | --- |
| `Container`, `Box` | `Stack` |
| `Metric`, `KPI` | `Stat` (`title` becomes `label`, `data.trend` becomes `delta` / `deltaTone`) |
| `InputField`, `Input` | `TextInput` |
| `SelectField`, `Dropdown` | `Select` |
| `Textarea` | `TextArea` |
| `Paragraph` | `Text` |
| `Loader`, `Loading` | `Skeleton` |

The same pass repairs shape as well as names: a nested `children` tree of objects is flattened into the `{ root, elements }` map, a non-`Page` root is wrapped in `Page` (and `Section`), `Form.submitLabel` becomes a `SubmitButton` child, `Grid.cols: { default: 1, md: 3 }` becomes `columns: "3"`, spacing words such as `md` and `lg` become real lengths, and list props supplied as arrays (`Select.options`, `Table.rows`, `Tabs.items`) are joined into the string encodings the catalog expects. An unknown component type is left alone so validation still reports it instead of silently dropping content.

### Loading states

Every region that fills from a CTA response gets a placeholder while the action is in flight:

- **Automatic.** `Table`, `Stat`, `KeyValue` and `DataText` bound to a `statePath` render a shape-matched skeleton whenever an action is pending and the value is still empty. Nothing is needed in the manifest, so apps generated before this existed gain the behaviour too.
- **Explicit.** `Skeleton` covers regions built from static children. It renders only while an action is pending, so it disappears on its own.
- `Spinner` remains for short inline waits, and `ProgressSteps` for a stepped run the user explicitly asked for.

---

## Typical setups

### Navigation-only brochure

Leave API Bindings empty. Describe pages and NavLinks. Publish as public. Turn on Require Arena emailId only for Arena embeds.

### Form → workflow → results

1. Deploy the backend workflow first (the one that scores / looks up / writes).
2. Put its id in API Bindings as `kind: "workflow"`.
3. In User Input, say the Home form submits that key then goes to Results.
4. Generate, then Launch.

### Form → HTTP API

Same as above with `kind: "http"`. Put tokens in a workspace env var and reference the name via `headersSecretName`. Do not paste secrets into the block.

---

## Troubleshooting

| Symptom | What to check |
|---|---|
| Preview says Draft not found | Sign in; the draft must belong to a workflow you can access |
| Preview CTA fails with “Bound workflow is not deployed” | Deploy the bound workflow first — preview uses the same rule as publish |
| Identifier “preview” is reserved | That path is the draft preview host. Choose another identifier |
| Deploy tab says run the block first | Run Arena Generative UI on **this** workflow; drafts are per workflow in Deploy |
| Generation error about pages / API keys | Pages JSON paths kebab-case; CTA keys ⊆ API Bindings |
| CTA fails with “Bound workflow is not deployed” | Deploy the target workflow, then republish the app |
| CTA fails with host not allowlisted | HTTP URL host is locked at publish. Change the binding, regenerate, Launch again |
| “Do not have access” | Gate is on and `emailId` is missing. Add `?emailId=` or turn off Require Arena emailId |
| Open goes to chat or an external App URL | Control-bar Open prefers Chat/App. Use Launch GUI App from Deploy → GUI App |
| Edit cannot find the draft | Draft must belong to this workflow; Generate created it on another workflow |

Tool APIs used by the block (you do not call these yourself):

- `POST /api/tools/arena_generative_ui/generate`
- `POST /api/tools/arena_generative_ui/edit`
