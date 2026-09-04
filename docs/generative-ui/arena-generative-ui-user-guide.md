# Get the best out of Arena Generative UI

This is a short how-to for filling the **Arena Generative UI** block. The full reference is [arena-generative-ui.md](./arena-generative-ui.md).

The block does not publish a URL. Run it to save a **draft**, then open **Deploy → GUI App → Preview**. Launch only when the preview looks right.

---

## What to put where

| Field | What goes here |
|---|---|
| **Mode** | **Generate New App** for a first draft. **Edit Existing Draft** later — type only the delta in **Requested Changes**, or say `re-plan` / `rebuild the app` to regenerate the sitemap. |
| **User Input** | Plain language. Name the app, pages, fields, buttons, and which API key each button calls. **Not JSON.** |
| **Pages** | Optional. Leave blank and name the pages in User Input. Pin JSON only when you need exact paths. |
| **API Bindings** | Use **Add an API**, do not hand-write JSON. Invent a `key` (for example `recommend_articles`) and use **that same string** in User Input. |
| **Output schema** (inside Add an API) | Fetched from the workflow’s deployed Response / Agent output. A pasted Sample response is kept through generate and edit. |
| **Design Notes** | Optional. Brand, density, dark mode. Skip unless you care. |

The model **cannot invent API keys**. If User Input says “Submit calls `recommend_articles`”, that key must exist in API Bindings. Leave Bindings empty only for a navigation-only app (no forms that call a backend).

Name pages, fields, and CTA keys. Vague briefs (“make a research tool”) produce generic shells.

---

## Output format (this is the layout lever)

**Add an API → Output schema** is fetched from the bound workflow’s **deployed** Response block or Agent structured output (field names and types). When Sample is empty, generate and edit re-read that snapshot so a new deploy is picked up without saving the binding again.

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

Do **not** ask for a progress panel, elapsed timer, or Cancel **on the form**. Waiting lives on Results. The host disables submit and shows error + Retry. Tabs only navigate — History must `onLoad` its API.

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
- Bind the markdown on DataText statePath "content" (or the string field name).
  Do not bind `field.content` when the API returns a string (for example `artical_data.content`).
  (H1 title, repeating H2 sections with bold Writing Instructions and Target Keywords bullet lists,
  optional VISUAL & TABLE OPPORTUNITIES callouts, FAQ with bold Q: and plain A:)
- While recommend_articles is running, Results should look like it is loading — not empty.
  Header copy can be Working on "{targetKeyword}" for {clientBrand}…

History page onLoad calls run_history (do not call it from the tab click).
Repeat cards, most recent first: keyword, client, and date only.
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

Leave **Pages** blank. Copy Markdown / Download PDF are not host actions — add them later in **Requested Changes** only if you implement them yourself.

### What this brief is asking the host to do

| In the brief | What happens |
|---|---|
| `targetKeyword (text) — label "Target Keyword"` | Field `name` is `targetKeyword`. Results can show `{targetKeyword}` or `{Target Keyword}` (spaces and case are ignored). |
| Pills `"Keyword: {targetKeyword}"` | Submit copies the form into `inputs` immediately. The API does not need to echo those fields. Use the **form `name`**, not History JSON keys (`keyword` / `client`). |
| `Keyword: {Target Keyword}` with only a label, no camelCase name | Often stays literal `{Target Keyword}` after generate. Name the field first. |
| Stream on + markdown sample | Results fills as tokens arrive. Heading shape follows the sample, not an invented Table. |
| History cards: keyword, client, date only | Repeat is a stamp. Binding `item.output` would paint the full markdown on **every** card. |
| Open: `selectItem true`, no `actionId`, no `navigateTo` | Copies that row into `selected` / `selectedId` / `content`. Host hides Repeat while `selectedId` is set. |
| Back: `clearItem true`, `showWhen "selectedId"` | Drops the copied row. The list returns. Do not `navigateTo "history"` — that is a no-op on History. |
| Generate Results: no `onLoad` | Loading the generate CTA on Results would refetch and replace streamed markdown. History `onLoad` no longer wipes it. History Open does not use this page. |

`{item.title}` is only for rows inside a Repeat (a list from the API). Do not use `{item…}` for values the visitor just typed.

**What to check in Preview**

1. Generator → Generate Recommendations lands on Results; pills show the typed keyword and client; markdown fills `content`.
2. History loads on arrival (not on tab click). Cards show keyword, client, date — **not** the full markdown.
3. Open on a row hides the History cards and shows **that** run’s markdown on the same page. Back restores the list. It must not call `run_history` or `recommend_articles`, and it must not leave History.
4. Back from Results returns to Generator. Opening History again still shows the short list.

**History is empty but the API returned data:** Redeploy `run_history` after changing its Response block, then edit with a page-scoped prompt (`On the "history" page, bind Repeat to items`). Generate/edit re-reads the deployed output schema. Saying “do not show raw JSON” without a list `statePath` that matches that schema replaces the working `DataText` dump with an empty Repeat.

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

## After the first run

1. Open **Preview**. Click through every page and run the CTA once.
2. If a `statePath` is unresolved, use **Copy as edit instructions** and paste into **Requested Changes**.
3. To change one screen, **Copy page edit prompt** first (`On the "results" page, …`) so Edit does not rewrite the rest.
4. Theme (brand, density, dark mode): use the preview picker, copy the theme instructions, paste into Requested Changes. Theme-only edits do not call the generator.
5. Launch from **Deploy → GUI App** when Preview is good. Do not use identifier `preview`. Reopening the tab should show the saved description, category, access control, and allowed emails. A direct `/gui-apps/{identifier}` URL (no `?emailId=`) uses Access control — email OTP, password, or SSO — not the Arena hard deny. Allowed emails do not bypass **Require Arena emailId** on a `public` app.

---

## Short checklist

- Same API **key** in User Input and Add an API.
- Bound workflows are **deployed** before Preview / Launch.
- JSON APIs: paste Output format JSON so Results is not a text dump.
- Streaming APIs: turn Stream **on**, then paste a markdown (or JSON) example of the real stream.
- User Input names pages, **camelCase field names**, submit label, and “then go to {page}”.
- To show typed values on Results, write `{targetKeyword}` (or the form `name`) there — not History keys like `{keyword}` / `{client}`, and do not wait for the API to echo them.
- History lists that include a huge `output`: bind only short fields; Open is `selectItem` (no `actionId`, no `navigateTo`); hide the list with `!selectedId`; Back is `clearItem`. Do not bind `item.output` on the list.
- Edits are deltas. Do not paste the original brief again.
