# Arena Generative UI

How to generate a multi-page Arena app with the **Arena Generative UI** block, then publish it.

This is not the older **Generative UI** block. That block still emits a static HTML/email Spec. Arena Generative UI creates an interactive draft (pages, navigation, forms, CTAs) and only becomes a public URL after you publish it from Deploy.

## What you get

| Surface | Path |
|---|---|
| Public app | `/gui-apps/{identifier}` |
| Draft preview (session only) | `/gui-apps/preview/{draftId}` |
| JSON APIs | `/api/gui-apps/...` |

A published GUI app is a Sim page at `/gui-apps/{identifier}`, the same way `/chat/{identifier}` is a page. Open it in a new browser tab, or embed it in Arena. The block does not generate a login form.

Published apps are gated for authenticated Arena users by default, like deployed chats: **Require Arena emailId** is on and access control defaults to `email` against an allowlist. Turn the gate off deliberately if an app is meant to be reachable by anyone with the link.

## End-to-end flow

1. Add an **Arena Generative UI** block to a workflow.
2. Fill in the brief (and optional pages / API bindings).
3. Run the workflow. The block **saves a draft** — it does not publish.
4. Open **Deploy → GUI App** (not Deploy → App, which is the existing external-redirect flow).
5. Pick the draft and click **Preview** (or **Preview draft**) to click through pages and run CTAs before publish.
6. Set identifier / title / category / access, then **Launch GUI App**.
7. Share `{base}/gui-apps/{identifier}`. Arena embeds add `?emailId=`, which the default gate requires.

Generate itself is two cheap calls then one full spec: intent analyzer (task, entities, actions) → UI planner (archetype, sitemap, capabilities) → json-render manifest. You still type prose in User Input; those objects are not fields you fill in. Edit also makes two calls, but the first is a **scope** call rather than a plan — see **Requested Changes** below. An explicit re-plan phrase skips scope and runs analyzer + planner again.

Preview and the published URL both compile the same way: `compileGenerativeUx` relocates navigate-first loaders, injects pending chrome, and fills missing same-page Open chrome (`showWhen` on the list and detail, a `clearItem` Back). Preview compiles the full draft on the client. Published apps compile on the page API so a single-page fetch still gets the relocated spec. User Input describes the app, not that chrome.

Edit later by switching the block to **Edit Existing Draft**, describing only what should change in **Requested Changes**, running again (new revision), then launching from Deploy again.

You can also attach **Arena Generative UI** as an Agent tool (Built-in Tools). Pick Generate or Edit on the tool. Drafts still belong to this workflow — preview and Launch from **Deploy → GUI App**. For Edit, pin a Draft or let the agent pass `existingDraftId` from a prior generate; the agent supplies `editInstructions` (the delta) rather than a brief.

---

## Preview before publish

Preview is session-only. It does not publish a URL and does not use Chat or Deploy → App.

From **Deploy → GUI App**, pick a draft and open **Preview**. That loads `{base}/gui-apps/preview/{draftId}` (then the draft `entryPath`). You must be signed in and have access to the workflow.

- Navigation and forms work against the latest draft revision.
- CTAs use the same runner as production: bound workflows must already be deployed; HTTP hosts must pass the same allowlist rules.
- Preview skips Arena `emailId` and the published password / email / SSO gates.
- Preview captures runtime render problems (unresolved `statePath`, unknown component types, a SpecRenderer throw) and offers **Copy as edit instructions** to paste into **Requested Changes**.
- Preview always offers **Copy page edit prompt**, which starts Requested Changes with `On the "{path}" page, ` so Edit scopes to that screen.
- Preview includes a **theme picker** (brand, density, radius, light/dark). Changes are live in the iframe. Persist them by copying **Copy theme as edit instructions** into Requested Changes — theme-only edits skip the generator and patch `manifest.theme` in place.
- `preview` is a reserved public identifier because it is a static `/gui-apps` segment.

---

## Block fields

### Mode

- **Generate New App** — create a new draft on this workflow.
- **Edit Existing Draft** — apply only what you type in **Requested Changes** to a draft, and save a new revision.

### User Input (Generate only, required)

Describe the app in **plain language**. This field is prose, not JSON. Only **Pages** and **API Bindings** are JSON — leave them empty unless you are pinning a sitemap or wiring CTAs.

The model uses this brief to invent pages, copy, forms, and navigation. Do not describe loaders, toasts, or confirm dialogs — the host compiles those. Every generate run also applies the **Universal UI/UX Constitution** (hierarchy, one primary action, density, empty copy, Back) so those quality rules are not left to the archetype recipe.

Generation is Intent → Plan → spec: a cheap analyzer extracts task and entities, a cheap planner picks an archetype and sitemap (dashboard, form→result, list→detail, or wizard) plus capability tags, then the spec call renders the json-render manifest with **only that archetype's gold layout**, so a dashboard is not taught as a search hero. Analyzer and planner both fail open — generate still runs from the prose you typed, and the block's `content` / `plannerError` outputs say so instead of failing silently. Edit runs its own two stages instead (scope, then rewrite the pages in scope), except **theme-only** Requested Changes (`dark mode`, `density compact`, a brand hex) which patch `manifest.theme` without an LLM call, and **re-plan** phrases (`rebuild the app`, `turn this into a dashboard`) which run analyzer and planner again on this draft. The block `content` line starts with `Intent:`, `Planner:`, `Edit scope: pages [results].`, `Edit scope: theme only`, or `Edit scope: replan` so you can see what the run will rewrite.

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

The brief is stored on the draft, so Edit can send it as background context without you retyping it. The planner's structured brief (archetype and sitemap) is stored with it, so Edit keeps the same layout recipe without re-planning.

### Requested Changes (Edit only, required)

**An edit is a delta, not a rewrite.** Type only what should change; everything you do not mention — every page, element, prop, action, and copy string — is kept as it is. Do not paste the original brief again: the draft already carries it, and resending it invites the model to rebuild the app from scratch.

```
Center the search input and its submit button in one row.
Show a loader on the results page while the API runs.
```

The field starts empty on every run. **User Input** is hidden in Edit mode for the same reason.

#### Re-plan (rebuild the app)

If Requested Changes **explicitly** asks to start over — `re-plan`, `rebuild the app`, `start over`, `from scratch`, `replace the whole app`, or `turn this into a dashboard` / wizard / list-detail — Edit runs the **generate** path on this draft: a new structured brief, the matching gold layout, no preservation of the current pages. The same draft id gets a new revision, and the new brief is stored so later edits follow the rebuilt product.

Local wording (`rebuild the search row`, `regenerate the score`, `make it cleaner`) stays a delta.

#### How an edit is scoped

On an app of three or more pages, Edit first makes a cheap **scope** call that decides which pages your change request touches. Only those pages are sent to the model, and only those come back; Sim merges the reply over the stored draft, so **a page your request never mentions is byte-identical in the new revision — not because the model was asked to preserve it, but because it was never sent and never read back.**

That also makes an edit cost roughly what it changes. A one-page tweak on a five-page app provisions about 16k output tokens instead of 56k.

The edit falls back to rewriting the whole manifest when:

- the change is app-wide **layout** — "on every page", add/remove a page, or rewire CTAs (pure theme/density/dark mode skips this path; see theme-only edits below)
- it adds or removes a page, or changes which page opens first
- it touches more than three pages
- you pinned a sitemap in **Pages** (your pins already scope the run)
- the scope call fails for any reason

Nothing about this is a setting, and a fallback is not an error — it is the previous behaviour, which still works. The only visible difference is that the block's `content` output now ends with a one-line change list (`r2 → r3: changed results`), so you can see which pages actually moved without opening Deploy.

The scope call can occasionally include a page your change did not need, which only costs tokens. If it *misses* the page you meant, the edit will appear to do nothing — name the page explicitly ("on the **results** page, …") and run again. Preview's **Copy page edit prompt** pastes that prefix for you.

#### Theme-only edits

If Requested Changes is only branding (`dark mode`, `density compact`, `brandColor #1A73E8`, or the string copied from the preview theme picker), Sim patches `manifest.theme` and does **not** call the generator. Pages stay byte-identical. Mix in a layout word (`page`, `form`, `search`, `title`) and the usual edit path runs instead.

### Pages (optional JSON)

Pin the sitemap. On Generate, leaving this empty lets the model propose a small set of pages from User Input. On Edit, leaving it empty keeps the draft's current pages exactly as they are — the same applies to a blank **Entry Path**.

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

Two kinds. You rarely need to write either by hand — **Add an API** builds both:

| Source | What you give it |
|---|---|
| **Workflow** | Pick a workflow from this workspace. Sim reads the **deployed** start block and fills `inputSchema` for you. |
| **HTTP (curl)** | Paste a curl command. Auth headers are discarded; pick a **Secret var** instead. |

The workflow list marks anything without an active deployment as *not deployed*. You can still save that binding — wiring before deploying is normal — but the CTA fails until you deploy, and **Launch GUI App** blocks on it too.

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

**HTTP** — server-side fetch to an allowlisted URL. Production requires `https`. Private/loopback hosts are rejected. Optional `headersSecretName` is a workspace or personal **secret name**; the value is never sent to the browser (see **HTTP secrets** below).

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

`inputSchema` is the generator's form contract **and** a runtime allowlist. Declared `form` fields must appear on the CTA; `visitorEmail` / `constant` never render. Extra submitted keys are dropped. Bindings with no `inputSchema` still pass the form payload through.

### HTTP secrets (`headersSecretName`)

The binding stores **only the secret name** (and the header name, e.g. `X-API-Key`). Curl header **values are discarded** and never written to the draft, the model, or the browser.

Add the real token in **Settings → Secrets** (workspace or personal) under that same name, then pick it in **Add an API → Secret var**.

| When | What happens |
|---|---|
| You save in Settings → Secrets | The server encrypts the value with AES-256-GCM using `ENCRYPTION_KEY` (64-character hex). Postgres stores `iv:ciphertext:authTag` only. |
| You pick Secret var / paste curl | The draft keeps `headersSecretName` (e.g. `LINKEDIN_API_KEY`) and `authHeaderName`. Not the token. |
| Preview or published CTA runs | Sim decrypts **on the server** for the signed-in actor in that workspace, attaches the header, and fetches the allowlisted URL. The browser never sees the plaintext. |

Decrypt uses the **same** `ENCRYPTION_KEY` as encrypt. If `.env` has the example placeholder `your_encryption_key`, or a different key than the one that saved the secret, lookup finds the name but decrypt fails. Restart the Next.js process after changing `ENCRYPTION_KEY`.

`*_API_KEY` names default to the `X-API-Key` header when `authHeaderName` is omitted. Set `authHeaderName` explicitly if the remote API expects something else (`Authorization`, etc.).

### Output format (`outputSchema`)

`outputSchema` tells the generator what the API returns so it can lay the result out as a `Table`, `Stat`, or `KeyValue` instead of dumping one blob of text. `inputSchema` names form fields (descriptions from the workflow start block are kept so labels are not generic) and is also the runtime allowlist for that CTA. The generator also sees a compact **synthetic** example object (`"score": 72`), never the pasted sample values.

If a binding has neither `outputSchema` nor `outputHint`, results are treated as prose: bind `DataText` to `content` and do not invent Table columns. Paste an Output format sample when the results page should be a table or KPI grid.

Generate and edit **fail** when a used binding's `layoutPlan.hostKeys` never appear as `statePath` (no Table for `articles`, no Stat for `score`). Live `outputSchema` drift stays **warn-only**: if a declared top-level name is missing from the response, the host logs a warning and preview shows an amber banner. The CTA still succeeds — schema drift is diagnosable, not a hard failure.

The easiest way to fill it is the **Output format** field in **Add an API**: paste a sample response and Sim derives the field names and types in the browser. **Only names and types are saved** — the pasted values are discarded and never reach the database or the model, so a sample containing real data is safe. A paste also stores `outputSchemaSource: "sample"` so generate and edit keep those fields instead of replacing them with the deployed Response snapshot. Leave Sample empty to keep refreshing from the deploy.

Field names are ready-to-use `statePath` values, because of how a successful CTA lands in app state:

| Response | State | `statePath` |
| --- | --- | --- |
| `{ "articles": [...], "count": 3 }` | top-level keys merged | `articles`, `count` |
| `{ "run_data": { "history": [...] } }` | last-segment host key; wrapper omitted | `history` (also `items`) |
| `[ { ... } ]` or `"text"` | wrapped | `result` |
| anything | markdown/prose body (a string field, not a JSON dump of the object) | `content` |

So `statePath` is the host key itself — `articles` or lifted `history`, never `data.articles`, `run_data.history`, or `output.articles`. An `articles[].title` entry means `articles` is an array of objects with a `title`, which the generator turns into `Table statePath="articles" columns="title, url"`. A markdown string field binds as that name or `content` — never `field.content` unless the value is an object with a `content` child.

When a binding has `stream: true`, prose still binds to `DataText statePath="content"`. If **Output format** also describes structured fields (for example `companies`), new drafts bind those as `Table` / `Stat` / `KeyValue` instead of dumping the whole body. Existing drafts keep their current layout until you **Edit Existing Draft** or generate again. Host state strips execution telemetry (`tokens`, `finishReason`, `model`) so it never appears as the report. `DataText` always renders markdown/prose — it does not turn a JSON blob into a Table. JSON-mode workflow answers that land in `content` show as formatted text; bind `Table` when the layout plan chose a collection.

Derivation walks 3 object levels, describes arrays from their first element, and caps at 40 fields.

### Design Notes (optional)

Brand, density, tone, or a theme knob (`brandColor`, `density`, `radius`, `colorScheme`). Layout is a **full page up to 1280px**; Grid and Columns collapse to one column in a narrow Arena iframe — do not author a permanently narrow centre column. No logo or wordmark — the host supplies the outer shell. Example: “Calm Arena-like layout. Density compact. Dark mode.”

Ask for `narrow` explicitly in Design Notes if you want the old focused single-column form look.

The generator is held to a few constraints you do not need to restate:

- **Two surfaces only** — the page canvas and the card. Hierarchy comes from heading level, weight and whitespace, not coloured fills. Name a brand colour, density, typeface, or dark mode in Design Notes and the generator emits `manifest.theme` instead of painting `backgroundColor` on Page/Card.
- **Readable measure** — dashboards and tables stay wide, but narrative prose drops into a `narrow` Section so a report body never runs the full 1280px.
- **Sequential headings** — `PageHeader.title` is the page `h1` and `Card.title` renders an `h2`, so levels never skip or invert.
- **Labeled, left-aligned fields** — short related fields pair up in a `Grid`, long free-text stays full width.
- **Real spacing** — `gap` and `padding` take spacing tokens (`lg`, `md`) that the host maps to density-aware CSS variables. Raw CSS lengths still work.

The system prompt also carries **one** validated gold-standard layout for the planned archetype ([gold-example.ts](../../apps/sim/lib/arena-generative-ui/gold-example.ts) for form-result, plus dashboard / list-detail / wizard in [gold-example-archetypes.ts](../../apps/sim/lib/arena-generative-ui/gold-example-archetypes.ts)). Tests assert each example against `validateArenaGenerativeManifest` so the few-shot never teaches an invalid shape.

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

A manifest that fails validation is not thrown away. The generator sends the failing reply back to the model with the exact error and asks for a corrected manifest, up to three repair turns, so a single invented API key or unreachable page usually self-corrects inside one run. Only if all four attempts fail does the block surface the remaining issues and what to change in User Input, Pages, or API Bindings. Common failures: invented API keys, unreachable pages, invalid kebab-case paths.

The output token budget scales with the number of pages the run has to emit rather than sitting at a flat cap, because a truncated reply surfaces as a JSON parse error rather than a partial app. Pinning Pages makes that estimate exact, and a scoped edit counts only the pages in scope.

---

## Block outputs

After a successful run:

| Output | Use |
|---|---|
| `draftId` | Select this draft in Deploy → GUI App |
| `revisionId` | Snapshot that Deploy publishes |
| `entryPath` | Opening page |
| `pages` | `{ path, title }[]` |
| `content` | Short summary, prefixed with planner status or edit scope |
| `manifest` | Full multi-page json-render JSON |
| `structuredBrief` | Planner sitemap (`title`, `archetype`, `pages`) when planning succeeded |
| `plannerError` | Why planning fell back to prose, if it did |
| `editScope` | `{ mode: pages \| global \| theme, pages }` on Edit |

The canvas preview of the workflow is **not** the hosted app. Open the published URL after Launch.

---

## Publish (Deploy → GUI App)

This tab is separate from **Deploy → App** (development / external redirect). GUI App publishes a Sim-hosted `/gui-apps/{identifier}` page.

If you have not run the block yet, the tab tells you to create a draft first.

Fields:

| Field | Notes |
|---|---|
| Draft | Latest drafts for **this workflow**. After revision 1, a one-line summary of what changed vs the previous revision (pages added/removed/changed, actions, theme) |
| Identifier | URL slug. Lowercase letters, numbers, hyphens. Unique among live apps. Live at `/gui-apps/{identifier}` |
| Title | Shown on the hosted app |
| Category | Required department/category |
| Description | Optional |
| Require Arena emailId | **On by default for `public` apps.** The host returns “Do not have access” unless `?emailId=` or the `arena_email_id` cookie is present. Password, email, and SSO apps skip this hard deny so a direct `/gui-apps/{identifier}` visit can complete their login. Turn the gate off for a public app that should be reachable by link alone |
| Access control | `public`, `password`, `email`, or `sso` (SSO only when enabled). **Defaults to `email`**, seeded with the deployer's address. Same style as deployed chat. This is a separate layer from the Arena emailId gate |
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

Embed in Arena by passing the query the default gate expects:

```
https://{host}/gui-apps/{identifier}?emailId=user@example.com
```

When `emailId` is present, the host stores `arena_email_id` (HttpOnly, `Path=/`) so in-app navigation keeps it.

If the emailId gate is on, access control is `public`, and there is no `emailId`, visitors see **Do not have access**. Allowed emails are not consulted for that hard deny — they only apply when Access control is `email` or `sso`.

Chat-style access control then applies on top. Under the default `email` setting, a signed-in Sim user whose address is on the allowlist passes through; anyone else gets the OTP challenge. `password` and `sso` behave as they do for deployed chat. Direct visits (no `?emailId=`) reach that login instead of the Arena hard deny.

Control-bar **Open** uses Chat/App first when those exist. If only a GUI App is published, Open goes to `/gui-apps/{identifier}` without `emailId`. For `email` / `password` / `sso` that shows the login. For a public Arena-gated app it reaches the app only when the `arena_email_id` cookie is already set from a prior Arena visit, or when the gate has been turned off. Launch GUI App from the Deploy tab always opens the Sim URL.

---

## How CTAs run (after publish)

Clicks never call third-party APIs from the browser. The published host POSTs to `/api/gui-apps/{identifier}/actions/{actionId}`. Draft preview POSTs to `/api/gui-apps/drafts/{id}/actions/{actionId}` (session required).

- **Workflow** — `executeWorkflow` on the bound workflow. That workflow must be **deployed**. Inputs are the form values, optionally remapped by `inputMapping` in the manifest.
- **HTTP** — server fetch. Host must match the allowlist frozen at publish time. Auth headers come from the workspace or personal env var named in `headersSecretName`. The value is decrypted on the server at request time (see **HTTP secrets** above); it is never sent to the client.
- **Retries** — GET and DELETE retry on 429 / 502 / 503 / 504 and on network failures, up to two extra attempts with jittered backoff (`Retry-After` is honoured on 429). POST / PUT / PATCH, streaming CTAs, and timeouts are not retried.
- **Rate limit** — 120 published CTA calls per 5 minutes per visitor IP per app, checked before the app is even looked up. Over that, the host returns 429 with `Retry-After`. It is a ceiling on abuse, not a pace for real use: ordinary clicking, including pages that run several `onLoad` actions, stays far below it. Draft preview is not limited.
- **Response size** — bodies over 1 MB fail with a clear error asking for a smaller page (pagination, `limit`, or fewer fields), not a generic size-limit message.

Non-streaming HTTP bindings time out after 60s and streaming ones after 180s. A binding that fronts a slower endpoint can set `http.timeoutMs`, which the runner clamps to 1s–300s.

### The visitor's email (`arenaEmailId`)

Every CTA input carries `arenaEmailId`, the Arena `emailId` for the visitor who clicked, so an app can be about *them* rather than the same thing for everyone.

**It is not verified. Never use it to decide what a user is allowed to see.**

The emailId gate checks only that *an* emailId is present, and the value can arrive in the query string, a cookie, or the request body — so a visitor can put any address there. A workflow that reads `arenaEmailId` and returns "that user's" records can be made to return anyone's. Use it to greet, prefill, tag, or log; use your own auth for anything that must be private.

| Binding | Receives it |
|---|---|
| **Workflow** | Always. It runs inside your workspace. |
| **HTTP** | Only when the binding sets `"forwardEmailId": true` — the **Visitor's email** switch in **Add an API**. Off by default, because an HTTP call leaves your workspace. |

Sim always sets the value itself and discards anything a caller tried to send under that key, so there is exactly one source. It survives `inputMapping` even when the mapping does not list it, and a mapping can still rename it:

```json
{ "inputMapping": { "email": "arenaEmailId" } }
```

That sends both `email` and `arenaEmailId`. When no emailId resolves, the key is absent rather than empty.

On success the host may navigate (`onSuccess.navigate`) and merge `setState` so `DataText` can show results (for example `score`). Arrays listed in `appendKeys` concatenate into existing state instead of replacing, which is how Load more grows a list.

A Repeat `Button` with `selectItem: true` is not a CTA: it copies the loaded row into host state (`selected`, `selectedId`, `content`, scalar `inputs`) without POSTing a binding. On History, Open with no `navigateTo` hides the list while `selectedId` is set; a `clearItem` Back (or a NavLink/`navigateTo` to the current path) restores it. If the draft omitted those `showWhen` / `clearItem` props, the compiler adds them so markdown does not sit under the list. `navigateTo` a results page is the other pattern, when the brief wants a separate detail route. The compiler does not invent a missing `DataText`.

When an action fails, the host writes the message to state under `error` and shows a dismissible banner above the page, so a failure is visible even when the generated spec never bound `error` anywhere. HTTP failures carry the upstream detail rather than a bare status: a 422 whose body is `{"error":"company is required"}` surfaces as `HTTP 422: company is required`. The banner clears on the next action and on navigation. An `outputSchema` mismatch uses a separate amber warning, not this error banner.

### Data on page load (`onLoad`)

A page whose content does not come from a form the user just submitted declares `onLoad` in the manifest — an array of up to six action ids the host runs once when the page opens:

```json
{
  "pages": {
    "dashboard": { "path": "dashboard", "title": "Operations", "spec": { }, "onLoad": ["load_metrics"] }
  },
  "actions": {
    "load_metrics": { "apiKey": "fetch_dashboard_metrics" }
  }
}
```

Results merge into state exactly as a CTA's do, so the page's `Table`, `Repeat`, `Stat`, `KeyValue`, and `DataText` bind by `statePath` and get their loading placeholders for free. Without this a generated app can only be a form: dashboards, reports, lists, and record detail pages have no way to show anything on arrival.

The page's query params are the action's input values, so a page opened at `report?range=30d` receives `{ range: "30d" }` and the action's `inputMapping` remaps it to whatever the binding expects. `emailId` is the host's own param and is never forwarded.

Navigation targets carry those params: `NavLink.to`, `Button.navigateTo`, `Tabs.items` paths, and `onSuccess.navigate` all accept `page?key=value`. Only the part before `?` has to be an existing page path, and the host re-attaches `emailId` on top of whatever the target carried. Params also work on the entry URL, so an Arena link to `/gui-apps/{identifier}/order?id=ord_9` lands on a populated page.

Three behaviours worth knowing:

- **`onSuccess.navigate` is ignored for a load run.** Honouring it would bounce the user off the page they just opened. The same action can still navigate when a CTA invokes it.
- **A plain arrival clears prior state first**, so a detail page never flashes the previous record's data. Arriving mid-CTA — because a CTA navigated here before its request resolved — skips that clear so the in-flight result is not discarded.
- **Load-pending and action-pending are tracked separately**, so a page load finishing cannot clear the placeholders of a CTA that is still running.

Load actions run in parallel, and a failure surfaces in the same error banner as a CTA failure.

A Repeat template can put that row's id into the target: `NavLink.to` `"order?id={item.id}"` opens the detail page and its `onLoad` receives `{ id: "ord_9" }`. That is the list-to-detail path.

### Pagination (`pagination` + Load more)

A list API that returns pages declares `pagination` on the binding. The runner injects `limit` (default 20, max 100) and the cursor or offset, then writes `hasMore` plus `nextCursor` (cursor mode) or the next `offset` (offset mode) into state. Page 2+ **appends** the `items` array so Load more does not replace the rows already on screen. Appended lists cap at 96 items; hitting the cap turns `hasMore` off.

```json
{
  "key": "list_articles",
  "kind": "http",
  "http": { "method": "GET", "url": "https://api.example.com/articles" },
  "pagination": {
    "mode": "cursor",
    "items": "articles",
    "cursor": "nextCursor",
    "cursorParam": "cursor",
    "limit": 20
  }
}
```

Offset mode uses `"mode": "offset"` with `offsetParam` / `limitParam` (defaults `offset` / `limit`). Optional `hasMore` names a boolean field on the response when the API does not use a next cursor.

Load more is the **same action**, not a second binding. Put a Button with that `actionId`, `showWhen: "hasMore"`, and `inputMapping` `{ "cursor": "nextCursor" }` (or `{ "offset": "offset" }`). The host copies those pagination keys from state onto the click so the next request carries the cursor. A page's first `onLoad` has an empty cursor / offset 0, so it still **replaces** the list.

---

## UI catalog (what the model may emit)

Layout: `Page`, `Section` (`width`: `narrow` / `wide` default / `full`, plus `showWhen`), `Stack` (`direction`, `justify`, `wrap`), `Card` (`variant` `default` / `muted`, `padding` token or CSS length, `showWhen`), `Grid` (`columns` 2–4, collapses to one column when narrow), `Columns` (`equal` / `sidebar-left` / `sidebar-right`), `Repeat` (children render once per element of a `statePath` array)

Chrome: `PageHeader` (title, subtitle, trailing action), `Toolbar`, `Filter` (narrow an already-loaded collection; children are Select / TextInput / DateInput / Chip), `Tabs` (`items` as newline-separated `Label|path`, `activePath`), `Drawer` (list-detail overlay, `showWhen`), `Modal` (focused secondary action, `showWhen`; not delete confirm)

Copy: `Heading`, `Text`, `DataText`, `Alert`, `Toast` (transient in-content feedback the brief asked for; not save success), `List`, `ListItem`, `Divider`, `Image`

Data display: `Table` (static `columns` + `rows`, or `statePath` bound to an array of objects), `Repeat` (per-item Card / action / link; bind fields with `statePath` `item.field` and put values into labels and hrefs with `{item.field}`), `Stat` (`label` + `value` or `statePath`, plus an optional `delta` / `deltaTone` change indicator), `KeyValue` (`key: value` rows or a `statePath` object), `Badge`, `EmptyState` (title, optional body/icon; child is the next useful action)

Input: `Form`, `TextInput`, `TextArea`, `NumberInput`, `DateInput`, `Select`, `RadioGroup`, `MultiSelect`, `Checkbox`, `Switch`, `SubmitButton`

Loading: `WorkingCard` (status steps, lockstep bar, elapsed, Cancel, optional document skeleton) when the brief names a generate wait. `Skeleton` (`variant`: `text` / `stat` / `table` / `card` / `form` / `outline`) for static-children regions. `Spinner` and `ProgressSteps` remain for legacy specs.

Nav / CTA: `NavLink` (`to` = page path), `Button` (`navigateTo` / `actionId` / `selectItem` / `clearItem` / outbound `href`, plus `variant`, `size`, and `showWhen`), `Link`

Theme (optional, on the manifest, not a component): `brandColor` (`#RGB` / `#RRGGBB`), `radius` (`sm` / `md` / `lg`), `density` (`compact` / `comfortable` / `roomy`), `font` (`sans` / `serif`), `colorScheme` (`light` / `dark` / `system`). The host applies these as scoped `--gui-*` CSS variables. Omit `theme` unless Design Notes name branding.

`Button.variant` is `primary` / `secondary` / `ghost` / `destructive` and defaults to `secondary`; `size` is `sm` / `md`. `showWhen` uses the same clause syntax as form fields (`hasMore`, `!selectedId`, `status=ready`) so Load more can hide when there is no next page. At most one `primary` per page, and none on a page whose main action is a `SubmitButton` — that already renders as the primary. Emphasis has no colour prop: `Button` takes no `backgroundColor` or `color`.

A `SubmitButton` normally lives inside the `Form` it submits. One that sits **outside** a Form runs its own `actionId` on click instead, so a stray submit button still works — including in apps generated before this behaviour existed. A `SubmitButton` with neither a `Form` around it nor an `actionId` of its own can do nothing at all, so generation rejects it and the model is asked to fix it.

Paths listed in `Tabs.items` count as navigation, so a page reachable only through a tab still validates.

### Repeat (collections)

`Table` is still the right component when every item is the same scalar fields. Use `Repeat` when each item needs its own Card, Badge, button, or link.

Put `Repeat` *inside* a `Grid` (or `Stack`). Its children are the per-item template and render once per element of the `statePath` array. Wrapping a Grid in Repeat produces N grids.

- Bound fields: `statePath` `"item.title"` (no braces). Nested Repeats can bind `statePath` `"item.comments"` to an array on the outer row.
- Labels, hrefs, and navigation: `"{item.id}"` — `NavLink.to` `"order?id={item.id}"` opens that row's detail page so its `onLoad` can fetch the record.
- A `Button.selectItem` inside Repeat copies the row into host state (`selected`, `selectedId`, `content` from `output` / `content`) without calling an API. It does **not** restamp `inputs`. Stay on the list page: omit `navigateTo`, hide Repeat with `showWhen: "!selectedId"`, show markdown with `showWhen: "selectedId"`, Back is `clearItem` (no `actionId`). Or `navigateTo` a results page that has **no** `onLoad`. Results after Generate still echo the **form `name`s** (`{targetKeyword}`), not History JSON keys (`{keyword}`). Do not append `DataText` below an always-visible Repeat. Do not set `actionId` on the Open button.
- A `Button.clearItem` drops `selected`, `selectedId`, and copied `content` so the list returns. It must not set `selectItem` or `actionId`. A `navigateTo` / `NavLink.to` equal to the current path also clears while a row is selected.
- A `Button.actionId` inside Repeat sends the item's fields as the action input, so `inputMapping` can pass `id` the same way page query params do.
- Never bind a long prose field (`output`, `content`, `body`) inside Repeat — not `item.output`, not `Card.description`, not a Table column. Select the row, then show the markdown once.
- The host renders at most 48 items.
- An empty array is not a blank hole: the host shows `emptyText` (default **No results**). Customise it when the brief names the collection.

### Empty collections

A successful call that returned zero rows used to make the region vanish. Bound `Table`, `Repeat`, and `KeyValue` now render a short empty message instead:

| Component | Default copy | Override |
| --- | --- | --- |
| `Table`, `Repeat` | No results | `emptyText` |
| `KeyValue` | No details | `emptyText` |
| `DataText` | (none) | `fallback` — already empty-state copy, not loading copy |

The message is skipped while an action is pending (the skeleton still wins) and is skipped for static `Table`/`KeyValue` that never bound a `statePath`. Inside a Grid, the empty message spans the full row so it does not shrink to a single card cell.

When the page itself has no collection yet, emit catalog `EmptyState` with a child SearchField, Button, or NavLink as the next useful action. Bound `emptyText` stays a sentence.

Host **Refresh** (not a spec Button) re-runs the page `onLoad` without blanking regions that already have data.

### Form controls

Beyond text and a dropdown, a form may use:

| Component | Submits | When to use |
| --- | --- | --- |
| `NumberInput` | a number | counts, amounts, scores (`min` / `max` / `step` as decimal strings) |
| `DateInput` | `YYYY-MM-DD` | dates |
| `RadioGroup` | one label | a short exclusive list (use `Select` past about five options) |
| `MultiSelect` | an array of labels | several of a comma-separated `options` list |
| `Checkbox` | `true` / `false` | a must-tick acknowledgement |
| `Switch` | `true` / `false` | an on/off preference |

Every field needs `name` and `label`. Shared props:

- `defaultValue` seeds the control (`defaultChecked` also works on Checkbox/Switch; MultiSelect takes a comma-separated list)
- `statePath` reads a host-state key instead when that value is present
- `required` plus optional `errorText` validate on submit and show inline — do not add a second `Text` for the error
- `showWhen` hides the field until a sibling matches: `notify` (truthy), `channel=email`, `channel!=sms`. Comma-separated clauses are AND. Hidden fields are not submitted.

There is no file-upload field in this catalog.

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
| `Number`, `NumberField`, `NumericInput` | `NumberInput` |
| `Date`, `DateField`, `DatePicker` | `DateInput` |
| `Radio`, `RadioButtons` | `RadioGroup` |
| `MultiSelectField`, `TagSelect` | `MultiSelect` |
| `CheckBox`, `CheckboxField` | `Checkbox` |
| `Toggle`, `ToggleSwitch`, `SwitchField` | `Switch` |
| `Paragraph` | `Text` |
| `Loader`, `Loading` | `Skeleton` |
| `ForEach`, `Collection` | `Repeat` |
| `StatusCard`, `LoadingCard`, `JobStatus`, `GenerationStatus` | `WorkingCard` |
| `Dialog` | `Modal` |
| `FilterBar` | `Filter` |
| `Notification` | `Toast` |
| `Sheet` | `Drawer` |

The same pass repairs shape as well as names: a nested `children` tree of objects is flattened into the `{ root, elements }` map, a non-`Page` root is wrapped in `Page` (and `Section`), `Form.submitLabel` becomes a `SubmitButton` child, `Grid.cols: { default: 1, md: 3 }` becomes `columns: "3"`, spacing words such as `md` and `lg` become real lengths, and list props supplied as arrays (`Select.options`, `Table.rows`, `Tabs.items`) are joined into the string encodings the catalog expects. An unknown component type is left alone so validation still reports it instead of silently dropping content.

### Loading states

Every region that fills from a CTA response gets a placeholder while the action is in flight:

- **Automatic.** `Table`, `Repeat`, `Stat`, `KeyValue` and `DataText` bound to a `statePath` render a shape-matched skeleton while **the action that writes that path** is pending and the value is still empty. A list `onLoad` does not skeleton unrelated Stats on the same page. Nothing is needed in the manifest, so apps generated before this existed gain the behaviour too. A `DataText` `fallback` is empty-state copy, not loading copy — it no longer suppresses the skeleton. Once the action has finished, an empty array or object on `Table` / `Repeat` / `KeyValue` shows the empty message instead of disappearing. A page that already has `WorkingCard` skips those bound skeletons so the wait card is the only pending surface.
- **Explicit.** `Skeleton` covers regions built from static children. It renders only while an action is pending, so it disappears on its own. A `Stat` with a literal `value`, or a `Table` with literal `rows`, is not bound to anything and needs one.
- **Named generate wait.** When the brief lists status lines, an estimate, or Cancel, emit `WorkingCard` on the destination (or below submit if the brief stays on the form). The host rotates one step every ~2.5s and fills the bar in lockstep. Cancel abandons the in-flight CTA and navigates to `cancelTo`. Do not also emit `ProgressSteps` or a filling `ProgressBar`. `ProgressBar` is only for a real 0–100 value from the API.
- The host also compiles busy chrome on pending CTAs, an error banner with Retry, a same-page save toast, and a confirm step for destructive buttons.

**Loaders survive `onSuccess.navigate`.** A CTA that navigates on success sends the user to the destination page *before* the request is issued, and the action stays pending until it resolves — so the loading state belongs on the destination page, not on the form page the user has already left. This holds for streaming and non-streaming CTAs alike. If the action fails, the error is written to state and the user stays where they landed.

The same automatic placeholders cover a page's `onLoad` run, which is why a page that fetches its own data should bind its regions by `statePath` rather than hard-coding static children.

### Alignment

Fields are left-aligned by default. To centre a search field beside its button, wrap both in a horizontal `Stack`:

```json
{ "type": "Stack", "props": { "direction": "horizontal", "justify": "center", "align": "end", "gap": "12px" } }
```

`justify` accepts `start`, `center`, `between`, `end`; `align` accepts `start`, `center`, `end`, `stretch`. CSS spellings such as `space-between` or `flex-end` are rewritten to the catalog value rather than dropped. A whole form centres with `Form` `align: "center"`. `SubmitButton` has no alignment prop of its own — wrap it.

---

## Typical setups

### Navigation-only brochure

Leave API Bindings empty. Describe pages and NavLinks. Keep the default Arena gate unless the page is genuinely meant for anyone with the link, in which case switch access control to `public` and turn Require Arena emailId off.

### Form → workflow → results

1. Deploy the backend workflow first (the one that scores / looks up / writes).
2. Put its id in API Bindings as `kind: "workflow"`.
3. In User Input, say the Home form submits that key then goes to Results.
4. Generate, then Launch.

### Form → HTTP API

Same as above with `kind: "http"`. Put tokens in a workspace env var and reference the name via `headersSecretName`. Do not paste secrets into the block.

### Form → results + History list (select a loaded row)

Use this when Generate streams markdown onto Results, and History `onLoad`s a list whose rows already include that markdown (`output`).

1. Two bindings: the generate workflow (`stream: true` + a markdown Output format sample) and `run_history` (JSON sample with `items[].keyword`, `items[].client`, `items[].date`, and `items[].output`).
2. In User Input: History cards bind **only** the short fields. Open is `selectItem true`, **no** `actionId`, **no** `navigateTo`. Hide the list with `showWhen "!selectedId"`. Detail is `showWhen "selectedId"` plus a ghost Back `clearItem true`. Generate still goes to Results (`DataText` on `content`, no `onLoad`).
3. Do not bind `item.output` on the list — Repeat would render the full markdown on every card.
4. Generate, Preview History, click Open. The cards hide and that row’s markdown shows on History. Back restores the list — not a second API call and not a trip to Results.

The copy-paste brief is the [user-guide example](./arena-generative-ui-user-guide.md#example--article-recommendation-agent).

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
| CTA: Secret `"NAME"` was not found | Name in Secret var must match Settings → Secrets. Accessible names are listed in the error. Try `W_NAME` vs `NAME`. |
| CTA: Secret exists but could not be decrypted | `ENCRYPTION_KEY` must be a 64-char hex string and match the key used when the secret was saved. Restart the app after changing `.env`, then re-save the secret if the key changed. |
| “Do not have access” | Access control is `public` (or unset), Require Arena emailId is on, and `emailId` is missing. Allowed emails do not bypass this. Add `?emailId=`, open from Arena so the cookie is set, switch Access control to `email`, or turn the gate off |
| Open goes to chat or an external App URL | Control-bar Open prefers Chat/App. Use Launch GUI App from Deploy → GUI App |
| Edit cannot find the draft | Draft must belong to this workflow; Generate created it on another workflow |
| Edit ran but nothing changed | The scope call may have missed the page you meant. Name the page in **Requested Changes** ("on the results page, …") or paste **Copy page edit prompt** from preview, then rerun. The block's `content` output lists which pages actually changed |
| CTA fails with 429 / "Too many requests for this app" | The per-IP CTA limit (120 per 5 minutes per app) tripped. Wait for `Retry-After`. If real use hits it, the page is probably running `onLoad` actions on every navigation — cut them down or widen the limit |
| A workflow CTA gets no `arenaEmailId` | It is only absent when no emailId resolved for that visitor. `inputMapping` does not drop it. For an **HTTP** binding it is withheld unless the binding sets `forwardEmailId` |
| Generation error about a SubmitButton doing nothing | A `SubmitButton` ended up outside its `Form` with no `actionId`. Rerun; if it repeats, say in the brief which form the button submits |
| Preview shows unresolved statePath / unknown type | Copy **Copy as edit instructions** into the block's **Requested Changes** and rerun Edit. Bind a real top-level response field or add `onLoad`. |
| History list shows every row’s full markdown | The draft bound `item.output` (or dumped `content`). Edit History only: cards bind keyword/client/date; Open is `selectItem` with no `actionId` |
| History Open appends markdown below the list | Repeat stayed visible. Hide it while `selectedId` is set (`showWhen "!selectedId"`). Back is `clearItem`, not `navigateTo "history"` on History |
| History Open calls an API or leaves History | Open must not set `actionId` or `navigateTo` when the brief stays on History |
| Generation error about selectItem | `selectItem` is Repeat-only and cannot combine with `actionId` or `clearItem`. Put Open inside the Repeat card template |
| Block error `fetch failed` during generate/edit | Claude can take several minutes. Check **Deploy → GUI App** — a revision may already have been saved even if the block showed an error. Retry the run. |

Tool APIs used by the block (you do not call these yourself):

- `POST /api/tools/arena_generative_ui/generate`
- `POST /api/tools/arena_generative_ui/edit`
