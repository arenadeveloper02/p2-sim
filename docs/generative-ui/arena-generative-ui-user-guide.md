# Get the best out of Arena Generative UI

This is a short how-to for filling the **Arena Generative UI** block. The full reference is [arena-generative-ui.md](./arena-generative-ui.md).

The block does not publish a URL. For a production-ready app, **Plan App**, confirm or adjust the product contract, then **Generate from Plan**. After a spec exists, open **Deploy → GUI App → Preview**. Launch only when the preview looks right. Copilot and agents can still use **Generate New App** as a one-shot.

---

## Production path: lock the product contract first

Generate used to guess information architecture from User Input in the same expensive call as pixels. Production apps **plan first**:

1. **Plan App** — cheap. Intent + planner only. You get a draft with a product contract and no usable spec. Preview and Launch stay disabled.
2. Confirm or change the contract (dropdown knobs, an IA starting point, or **Adjust this plan**).
3. **Generate from Plan** — the spec model is locked to that sitemap and composition. It does not re-guess from prose.
4. **Preview**, then **Edit Existing Draft** for copy, bind, and paint. Architecture changes go back to Adjust this plan, then Generate from Plan again.

| Lane | When | What runs |
|---|---|---|
| **Patch knobs** | Known visibility flip (“stack results below the form”, “add History tab”) | No LLM. Dropdowns write the composition object. |
| **Adjust this plan** | Ambiguous product change (“inspect the task without leaving”) | Planner only, with the current blueprint + delta. Unmentioned pages stay. |
| **Generate from this plan** | Contract looks right | Spec LLM. Sitemap, composition, actions, and bindings are pinned. |
| **Edit Existing Draft** | Copy, bind, paint, one-page layout | Current scoped edit. Architecture stays unless you say `re-plan`. |

Do not paste the original brief into Requested Changes.

### Product contract knobs

These combine (hybrids are first-class). They are not a catalog of named products.

- **After submit:** replace the form / stack below / keep both visible
- **If replace:** leave immediately (wait on Results) / leave only if the API succeeds (wait and errors stay on the form)
- **Opening a row:** stay here / leave to a detail page / not applicable
- **Previous runs:** none / History tab
- **Create and edit:** on this page / separate pages

Streaming generate stays **leave immediately**. JSON qualify/lookup defaults to **leave only if the API succeeds**.

### IA starting points

Presets fill those knobs. They are starting points, not the taxonomy. Representation names (`table`, `kanban`, `calendar`) stay off this list — they are collection body.

| Preset | When | Knobs |
|---|---|---|
| **Stay on page** | Generate/analyze without leaving the form | stack below |
| **Task then results** | Submit replaces the form with a report | replace. Streaming → leave immediately. JSON → leave on success |
| **Agent with History** | Generator + results + previous runs | replace + History tab |
| **One list** | Dummy/local collection, create on the page | mutations on this page |
| **List then detail** | Browse, then leave to one record | inspect navigates |
| **Keep both visible** | Parent/child stay on screen | alongside + inspect stays here |
| **Monitor** | KPIs are the job | do not offer for a todo or research brief |
| **Step-by-step form** | Sequential *input* stages (KYC) | not a generate wait checklist |

---

## What to put where

| Field | What goes here |
|---|---|
| **Mode** | **Plan App** then **Generate from Plan** for production-ready apps. **Generate New App** is the one-shot for Copilot/agents. **Edit Existing Draft** later — type only the delta in **Requested Changes**. Architecture changes go back to Adjust this plan, not Requested Changes. |
| **User Input** | Plain language. Name the app, pages, fields, buttons, and which API key each remote CTA calls (if any). **Not JSON.** Use **Generate** on this field to expand a job note or repair a long brief before you run. |
| **Pages** | Optional. Leave blank and name the pages in User Input. Pin JSON only when you need exact paths. |
| **API Bindings** | Use **Add an API**, do not hand-write JSON. Invent a `key` (for example `recommend_articles`) and use **that same string** in User Input. Leave empty for dummy/local apps — do not add a fake workflow just to have a key. |
| **Output schema** (inside Add an API) | Last successful run first; if none, deployed Response, then Agent output. A pasted Sample response is kept through generate and edit. |
| **Design Notes** | Optional. Brand, density, dark mode. Skip unless you care. |

The model **cannot invent API keys**. If User Input names a key (“Submit calls `recommend_articles`”), that key must exist in API Bindings. Leave Bindings empty for dummy/local apps (todos, boards) and for navigation-only apps — create, edit, and complete still work locally. Do not add a fake workflow just to have a key.

Name pages, fields, and CTA keys. Vague briefs (“make a research tool”) produce generic shells.

Pasted ChatGPT product specs (React, geolocation, custom CSS, seven data-state screens) are **compiled on generate**. Generate notes list what Arena mapped or dropped (Chart for an hourly series, SearchField instead of geolocation, omitted weather icons). Optional **Generate** / `fix this brief` on User Input rewrites the brief itself onto those closest catalog alternatives and declared API keys before you run.

---

## Generate wand (User Input)

**Generate** on User Input writes the **brief**. It does not generate the app — run the block after the field looks right. It is optional authoring. Generate already compiles ChatGPT pastes; do not use the wand as recovery after a failed run.

Add APIs first when you have them. The wand sees those keys (and their form / output field names) and remaps mismatched CTA keys and field names onto the closest declared binding — it will not invent new ones. Leave Bindings empty for dummy/local apps so it describes CTAs in words.

The Generate box cannot be empty. Type a job note, or an instruction such as `fix this brief`.

| What’s in User Input | What to type in Generate | What happens |
|---|---|---|
| Empty or a short job | The job (`article recommender`, `simple todo`) | Expands a planner-ready brief: audience, pages, camelCase fields, CTA keys, empty copy. |
| A long pasted spec | `align with Arena guidelines` or `fix this brief` | Repairs in place. Keeps original intent (product, audience, happy path, named pages/copy). Remaps invented API keys and form/output fields onto declared bindings. Rewrites unrepresentable layout/components to the closest catalog alternative (geolocation → SearchField, Gantt → Timeline). Strips loaders / toasts / login (host-owned). Drops dashboards, stats, history, and extra routes the job did not ask for. Conflicting asks keep the one that better serves the original job. |
| Anything | `start over` / `rebuild` plus the new job | Expands from that note and ignores the current brief as product scope. |

The wand writes **prose**, not json-render JSON. Recipes and the catalog apply when you run the block.

A repaired brief still needs the usual checks: same API key as **Add an API**, Results has no `onLoad` of the generate CTA, History Open is `selectItem` with no `actionId` / `navigateTo`, dummy lists seed sample rows.

---

## Output format (this is the layout lever)

**Add an API → Output schema** prefers the bound workflow’s **last successful run** (field names and types from `finalOutput`). If there is no completed run, Sim uses the **deployed** Response block, then Agent structured output. When Sample is empty, generate and edit re-read that chain so a newer run or deploy is picked up without saving the binding again.

**Sample response** can be the JSON you see in the network tab, including `{ "ok": true, "data": { ... } }`. Wrappers like `ok` and `data` are stripped. As soon as the paste is valid, **Output schema** tags should list the real collection (`run_data.history`, `history[].keyword`, …). If those tags never appear, the paste did not become schema. A pasted schema is kept through generate and edit — it is not replaced by the deployed snapshot. Sim keeps **names and types only** — pasted values never reach the model or the database.

Do **not** paste a Response-block envelope whose `data` is a markdown string (`{ "data": "# …", "status": 200, "headers": { … } }`) as **History**. That is one generated article, not a list of runs. Generate will treat it as prose (`content`). History needs a JSON array of runs (`items` / `history` with keyword, client, date, and optional `output`).

| You paste | The generator can do |
|---|---|
| JSON object with fields | `Table`, `Stat`, `KeyValue`, Repeat cards bound to those names |
| Nothing | Prose dump: one `DataText` on `content`. No invented table columns |
| Streaming **markdown / prose** | Match that heading shape in a live `DataText` |
| Streaming **plus JSON** at the end | Live prose while tokens arrive, then Table / Stat for the structured fields |

`DataText` always stays markdown. A JSON blob in `content` is formatted text, not an invented table. Bind `Table` / `KeyValue` when Output schema chose those fields.

Field names become `statePath` values as-is: `score`, `articles`, `articles[].title`. Nested arrays (`run_data.history`) bind as `history`, not `run_data.history`. Never `data.score` or `output.articles`. Generate fails if the draft never binds those host keys (no Table for `articles`). A live response that is missing a field still succeeds and shows a warning.

Turn **Response → Stream** on when the workflow or HTTP call streams tokens. Stream off waits for the full JSON body. A JSON-only API (score + reasons) is the same block setup with Stream off and a JSON sample.

---

## Example — Article Recommendation Agent

One brief covers the host features you actually use: camelCase field names echoed on Results, streaming markdown, waiting chrome on Results (not the form), History `onLoad`, and Open that swaps the History list for that row’s markdown on the same page — without dumping every `output` onto the cards.

Do **not** ask for a progress panel, elapsed timer, or Cancel **on the form**. Waiting lives on Results (or stacked below the form). Named wait steps while a request runs are wait chrome, not wizard pages. The host disables submit and shows error + Retry. Tabs only navigate — History must `onLoad` its API. Generator + History is two peer destinations (tabs); do not drop History because Generator is one view.

**Mode:** Generate New App

**User Input:**

```
Article Recommendation Agent. Three pages: home (Generator), results, history.

Tabs at the top-right of every top-level page: "Generator|home" and "History|history". Home is the default.

Home is a left-aligned form titled "Article Recommendation Agent" with subtitle
"Turn a target keyword and client into writer-ready article recommendations."
Fields:
- targetKeyword (text) — label "Target Keyword", placeholder "Dental implants"
- clientBrand (text) — label "Client / Brand", placeholder "42 North Dental"

Submit label is "Generate Recommendations". It calls recommend_articles, then go to results.
Do not put a progress bar, checklist, spinner, Cancel, or elapsed timer on the form.

Results:
- No onLoad — data comes from generate or from History Open, not a fetch on arrival
- Back to Generator at the top
- Two pills: "Keyword: {targetKeyword}" and "Client: {clientBrand}"
- Buttons "Copy Markdown" and "Download PDF" (host actions, no actionId — they copy or download the article, not recommend_articles)
- Bind the markdown on DataText statePath "content" (or the string field name).
  Do not bind `field.content` when the API returns a string (for example `artical_data.content`).
  (H1 title, repeating H2 sections with bold Writing Instructions and Target Keywords bullet lists,
  optional VISUAL & TABLE OPPORTUNITIES callouts, FAQ with bold Q: and plain A:)
- While recommend_articles is running, Results should look like it is loading — not empty.
  Header copy can be Working on "{targetKeyword}" for {clientBrand}…

History page onLoad calls run_history (do not call it from the tab click).
Repeat cards in a two-column Grid, most recent first: keyword, client, and date only.
ISO timestamps on the card are formatted by the host (default `Aug 24, 2026`) — bind `{item.date}`, do not paste a formatted copy of the API value.
To pick a format, bind `{item.date|DD/MM/YYYY}` or `{item.date|relative}`, or set Card `dateFormat` (`short`, `medium`, `long`, `iso`, `numeric`, `numeric-eu`, `datetime`, `relative`, `ago`, or a token pattern).
Bound numbers stay raw unless you name a format: Stat/Card `numberFormat` (`integer`, `currency`, `usd`, `percent`, `compact`) or `{item.price|currency}` / `{item.rate|percent}`. Table columns can use `price|currency`, `date|relative`, footer aggregates `amount|sum`, and an index column `#`. Table headers sort the loaded rows. DateInput uses a month-grid picker. Dated collections can bind `Calendar` (month/week) or `Timeline` (chronological spine). Locations with lat/lng bind `Map`. Nested folders bind `Tree`. A cycling gallery binds `Carousel`. Set `reorderable` on Table/Repeat only when you asked to drag dummy/local rows.
Do not bind item.output, content, body, or a Table column for the markdown — not on the card, not as Card.description.
Each card has a Button labeled "Open" with selectItem true, no actionId, and no navigateTo.
Open stays on History. Hide the list (Repeat or its wrapper showWhen "!selectedId") and show that row's markdown
(DataText statePath "content", showWhen "selectedId") with a ghost Back Button clearItem true, showWhen "selectedId".
Back is not an API call and must not navigateTo — it hides the detail and shows the list again.

Do not show raw JSON anywhere.
```

**Add an API** (twice):

1. Key `recommend_articles` — **Workflow** (must already be **deployed**) or **HTTP**. Response: **Stream** on. **Output format** — a short markdown sample of one recommendation doc (same heading shape as above):

```markdown
# Dental Implants: A Complete Guide

## Overview
Writer-ready angle for 42 North Dental.

## Writing Instructions
- Open with the patient outcome, not the procedure name.

## Target Keywords
- dental implants
- implant dentist near me

## FAQ
**Q:** How long do implants last?
A: With care, often a decade or more.
```

2. Key `run_history` — list payload. **Output format** JSON if you have it:

```json
{
  "items": [
    {
      "id": "run_1",
      "keyword": "Dental implants",
      "client": "42 North Dental",
      "date": "2026-08-23",
      "output": "# Title\n\nFull markdown for this run."
    }
  ]
}
```

Wrong (generate Response envelope — do not use this on History):

```json
{
  "data": "# Title\n\nMarkdown for one article",
  "status": 200,
  "headers": { "Content-Type": "application/json" }
}
```

The history sample may include `output` so generate knows the row shape. History cards must still bind only keyword, client, and date. Open uses `selectItem` (no `actionId`, no `navigateTo`); a `clearItem` Back restores the list. Generate still lands on Results.

Leave **Pages** blank. Copy Markdown / Download PDF are host actions (labels are enough, or `copyContent` / `downloadPdf` true, no `actionId`). They copy or download the visible article markdown.

### What this brief is asking the host to do

| In the brief | What happens |
|---|---|
| `targetKeyword (text) — label "Target Keyword"` | Field `name` is `targetKeyword`. Results can show `{targetKeyword}` or `{Target Keyword}` (spaces and case are ignored). |
| Pills `"Keyword: {targetKeyword}"` | Submit copies the form into `inputs` immediately. The API does not need to echo those fields. Use the **form `name`**, not History JSON keys (`keyword` / `client`). |
| `Keyword: {Target Keyword}` with only a label, no camelCase name | Often stays literal `{Target Keyword}` after generate. Name the field first. |
| Stream on + markdown sample | Results fills as tokens arrive. Heading shape follows the sample, not an invented Table. |
| History cards: keyword, client, date only | Repeat is a stamp. Binding `item.output` would paint the full markdown on **every** card. |
| Open: `selectItem true`, no `actionId`, no `navigateTo` | Copies that row into `selected` / `selectedId` / `content`. On History the host hides Repeat while `selectedId` is set. Workspace/Drawer keep the list visible. |
| Back: `clearItem true`, `showWhen "selectedId"` | Drops the copied row. The list returns. Do not `navigateTo "history"` — that is a no-op on History. |
| Generate Results: no `onLoad` | Loading the generate CTA on Results would refetch and replace streamed markdown. History `onLoad` no longer wipes it. History Open does not use this page. |
| Copy Markdown / Download PDF | Host copies or downloads the visible DataText (`content`). No `actionId`. Do not bind `recommend_articles`. |

`{item.title}` is only for rows inside a Repeat (a list from the API). Do not use `{item…}` for values the visitor just typed.

**What to check in Preview**

1. Generator → Generate Recommendations lands on Results; pills show the typed keyword and client; markdown fills `content`. Copy Markdown copies that markdown; Download PDF saves a `.pdf`.
2. History loads on arrival (not on tab click). Cards show keyword, client, date — **not** the full markdown. Two cards sit in a row on a wide History section; dates are readable (Aug 24, 2026), not `2026-08-24T06:28:56.717Z`.
3. Open on a row hides the History cards and shows **that** run’s markdown on the same page. Back restores the list. It must not call `run_history` or `recommend_articles`, and it must not leave History.
4. Back from Results returns to Generator. Opening History again still shows the short list.

**History is empty but the API returned data:** Run `run_history` once after changing its Response block (or paste a Sample), then edit with a page-scoped prompt (`On the "history" page, bind Repeat to items`). Generate/edit re-reads last-run, then the deployed output schema. Saying “do not show raw JSON” without a list `statePath` that matches that schema replaces the working `DataText` dump with an empty Repeat.

**History cards stay stacked in one column:** **Edit Existing Draft**, paste **Copy page edit prompt** from History, then ask in ordinary language:

```
On the "history" page, show two run cards in a row.
```

The host wraps Repeat in a two-column Grid. You do not need to say Grid.

Other ordinary-language edits the host applies without catalog jargon: “the title is too big — use a normal size”, “make the text a bit darker”, “don’t show the skeleton, use a circular loader”, “hide no-results while data is loading”. Moving results to a new page (“titled Requested Info, with Back”) is a scoped edit, not a full re-plan.

**History dates stay ISO timestamps:** bind `{item.date}` (or `{item.createdAt}`). The host formats ISO values. To change the format, **Edit Existing Draft** with `{item.date|DD/MM/YYYY}` or Card `dateFormat` `numeric-eu` — do not rewrite the API string.

**History Open appends markdown below the list:** Preview/Launch compile missing `showWhen` and a `clearItem` Back. If markdown still sits under the cards, the draft bound `item.output` on the list or never authored a `DataText` for `content`. **Edit Existing Draft**, paste **Copy page edit prompt** from History, then only this delta:

```
On the "history" page, Repeat cards must show only keyword, client, and date.
Do not bind item.output, content, or any DataText/Table column for the markdown on the list.
Each card has a Button "Open" with selectItem true, no actionId, no navigateTo.
Hide Repeat (or its Grid/Stack/Section) with showWhen "!selectedId".
Put the markdown in a sibling Section showWhen "selectedId" with DataText statePath "content"
and a ghost Back Button clearItem true, showWhen "selectedId", no navigateTo.
Do not append DataText below an always-visible Repeat.
```

---

## Example — Simple todo (collection)

Use this when the job is **one dummy list** (micro collection), not **task then results** and not **keep both visible**. Copy-paste set: [test inputs — collection](./arena-generative-ui-test-inputs.md#simple-todo-collection). No API Bindings — dummy data.

**Mode:** Generate New App

**User Input:**

```
Simple todo app. Dummy data. One page. List todos, add a todo, mark one complete.

Create and complete stay on this page (dialog or inline) — not a create page
and not a detail page.

No dashboard, stats, history, filters, or extra routes.
```

**What to check in Preview**

1. One `home` page. Collection, not Workspace. No create or detail route.
2. Sample todos on arrival — the list must not start empty.
3. Add and complete work locally (dialog or inline). Do not invent an API key.

### Editing a row

Edit is **not inferred** — “list todos, add a todo, mark one complete” gets you no Edit button. Ask for it: `Edit a todo on this page (dialog or inline), not an edit page.`

Create and edit are two dialogs on the **same** page, not two routes. The host opens the one you clicked, and Edit copies that row into the form for you — you do not describe the prefill.

| In the brief | What happens |
|---|---|
| `Edit a todo on this page` | Each row gets an Edit button that opens a dialog. The host selects that row and prefills the form with its current values. |
| `not an edit page` | Keeps edit as an overlay. Without it the planner may add a route you did not want. |
| Nothing about edit | No Edit button. Rows stay read-only apart from complete. |

**Edit saves a duplicate instead of updating the row:** the draft closed the *create* flag when saving the edit, so the host filed the save as a new row. **Edit Existing Draft**, **Copy page edit prompt** from the page, then only this delta:

```
On the "home" page, the row Edit button opens the edit dialog, not the create dialog.
Saving the edit must clear the editing flag, not the creating flag, so the host
updates the selected row instead of appending a new one.
```

Preview catches the other half of this: if the plan asked for edit but the draft only ever built a create dialog, **Copy as edit instructions** now asks for the missing edit overlay instead of staying silent.

---

## Example — Projects and tasks (Workspace)

Use this when the job is **keep both visible** (compose), not **replace the current view** (navigate). Copy-paste set: [test inputs — compose](./arena-generative-ui-test-inputs.md#projects-and-tasks-compose). No API Bindings — dummy data.

**Mode:** Generate New App

**User Input:**

```
Project board. Keep projects, the tasks in the selected project, and the selected
task visible together — inspect the task without leaving the board.

One page. Dummy data. Create and complete a task on this page (dialog or inline),
not a create page and not a task-detail page.

Projects on the left. Tasks for the selected project in the middle. Selected task
on the right. Selecting a project filters the task list. Selecting a task fills
the inspector.
```

**What to check in Preview**

1. One `home` page. No `/projects`, `/tasks`, or task-detail route.
2. Three regions stay on screen. Project selection filters tasks. Task selection fills the inspector. Do not hide navigator or primary with `!selectedId`. Task rows include `projectId` matching the selected project.
3. Create / complete is local (dialog or inline), not another page.
4. Planner `content` does not say `Uncoordinated regions`.

“Then go to results” is Article Recommendation. One dummy list is Simple todo above.

---

## After the first run

1. Open **Preview**. Click through every page and run the CTA once.
2. If a `statePath` is unresolved, use **Copy as edit instructions** and paste into **Requested Changes**.
3. To change one screen, **Copy page edit prompt** first (`On the "results" page, …`) so Edit does not rewrite the rest.
4. Theme (brand, density, dark mode): use the preview picker, copy the theme instructions, paste into Requested Changes. Theme-only edits do not call the generator.
5. Launch from **Deploy → GUI App** when Preview is good. Do not use identifier `preview`. Reopening the tab should show the saved description, category, access control, and allowed emails. A direct `/gui-apps/{identifier}` URL (no `?emailId=`) uses Access control — email OTP, password, or SSO — not the Arena hard deny. Allowed emails do not bypass **Require Arena emailId** on a `public` app.

**Host owns these — Requested Changes that ask for them are ignored.** Generate still succeeds; Preview/Launch drop the extra chrome.

- Custom spinner, progress bar, elapsed timer, or Cancel on the form (wait belongs on Results / WorkingCard)
- Custom error Alert, save-success Toast, or delete-confirm Modal
- A Refresh button (the host already offers Refresh)
- Extra dashboard / stats / history pages the job did not ask for
- A second primary button on the same screen (the critic demotes it)
- Binding `item.output` onto every History card

---

## Short checklist

- **Generate** on User Input is optional authoring (expand a job or `fix this brief`). `fix this brief` remaps binding mismatches and unrepresentable layout to closest catalog alternatives without changing the job. Generate still compiles ChatGPT pastes on run. Add APIs first so keys match. Then run the block.
- Same API **key** in User Input and Add an API. Leave Bindings empty for dummy/local apps; do not invent a workflow key.
- Dummy lists (todos, boards) should show sample rows on arrival. Create / edit / complete stay local, as dialogs on the same page. Ask for edit by name — it is not inferred.
- Bound workflows are **deployed** before Preview / Launch.
- JSON APIs: paste Output format JSON so Results is not a text dump.
- Streaming APIs: turn Stream **on**, then paste a markdown (or JSON) example of the real stream.
- User Input names pages, **camelCase field names**, submit label, and “then go to {page}”. To keep two things on screen, say **alongside** / **without leaving** — that is one Workspace page, not extra routes.
- To show typed values on Results, write `{targetKeyword}` (or the form `name`) there — not History keys like `{keyword}` / `{client}`, and do not wait for the API to echo them.
- History lists that include a huge `output`: bind only short fields; Open is `selectItem` (no `actionId`, no `navigateTo`); hide the list with `!selectedId`; Back is `clearItem`. Do not bind `item.output` on the list. Workspace and Drawer keep the collection visible — do not hide navigator or primary with `!selectedId`; child rows use `projectId` so the host can filter.
- Edits are deltas. Do not paste the original brief again.
- The host owns wait, error, save toast, delete confirm, and Refresh. Asking for a form spinner, error Alert, or Refresh button in Requested Changes is ignored.
