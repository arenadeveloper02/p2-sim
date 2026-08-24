# Get the best out of Arena Generative UI

This is a short how-to for filling the **Arena Generative UI** block. The full reference is [arena-generative-ui.md](./arena-generative-ui.md).

The block does not publish a URL. Run it to save a **draft**, then open **Deploy → GUI App → Preview**. Launch only when the preview looks right.

---

## What to put where

| Field | What goes here |
|---|---|
| **Mode** | **Generate New App** for a first draft. **Edit Existing Draft** later — type only the delta in **Requested Changes**. |
| **User Input** | Plain language. Name the app, pages, fields, buttons, and which API key each button calls. **Not JSON.** |
| **Pages** | Optional. Leave blank and name the pages in User Input. Pin JSON only when you need exact paths. |
| **API Bindings** | Use **Add an API**, do not hand-write JSON. Invent a `key` (for example `qualify_lead`) and use **that same string** in User Input. |
| **Output schema** (inside Add an API) | Fetched from the workflow’s deployed Response / Agent output. Paste a sample only when the workflow declares none. |
| **Design Notes** | Optional. Brand, density, dark mode. Skip unless you care. |

The model **cannot invent API keys**. If User Input says “Submit calls `qualify_lead`”, that key must exist in API Bindings. Leave Bindings empty only for a navigation-only app (no forms that call a backend).

Name pages, fields, and CTA keys. Vague briefs (“make a research tool”) produce generic shells.

---

## Echo form values on another page

Submitted fields are available on the next page the moment the user clicks — you do not need the API to return them.

Give every field a **camelCase name** in User Input, then a label. On Results (or any later page), say to show those names as chips, a header, or a subtitle. The host fills `{targetKeyword}` and `inputs.targetKeyword` from what the user typed.

```
Article recommendations. Two pages.

Home is a form:
- targetKeyword (text) — label "Target Keyword", placeholder "Dental implants"
- clientBrand (text) — label "Client / Brand", placeholder "42 North Dental"

Submit "Generate Recommendations" calls recommend_articles, then go to Results.

Results shows two pills: "Keyword: {targetKeyword}" and "Client: {clientBrand}",
then the returned markdown. Back to Home.
Do not put a progress bar or checklist on the form — waiting chrome belongs on Results.
```

| Write this | What happens |
|---|---|
| `targetKeyword (text) — label "Target Keyword"` | Field `name` is `targetKeyword`. Results can show `{targetKeyword}` or `{Target Keyword}` (spaces and case are ignored). |
| `Keyword: {Target Keyword}` with only a label, no camelCase name | Often stays literal `{Target Keyword}` after generate. Name the field first. |
| Hope the API echoes `company` so Results can show it | Unnecessary. Submit already copies the form into `inputs`. |

`{item.title}` is only for rows inside a Repeat (a list from the API). Do not use `{item…}` for values the visitor just typed.

---

## Output format (this is the layout lever)

**Add an API → Output schema** is fetched from the bound workflow’s **deployed** Response block or Agent structured output (field names and types). Generate and edit re-read that snapshot, so a new deploy is picked up without saving the binding again.

**Sample response** is only needed when the workflow declares nothing. Sim keeps **names and types only** — pasted values never reach the model or the database.

| You paste | The generator can do |
|---|---|
| JSON object with fields | `Table`, `Stat`, `KeyValue`, Repeat cards bound to those names |
| Nothing | Prose dump: one `DataText` on `content`. No invented table columns |
| Streaming **markdown / prose** | Match that heading shape in a live `DataText` |
| Streaming **plus JSON** at the end | Live prose while tokens arrive, then Table / Stat for the structured fields |

Field names become `statePath` values as-is: `score`, `articles`, `articles[].title`. Never `data.score` or `output.articles`.

Turn **Response → Stream** on when the workflow or HTTP call streams tokens. Stream off waits for the full JSON body.

---

## Example 1 — Form, then a scored result (JSON, not streaming)

Use this when the backend returns a JSON object you want laid out as numbers and lists.

**Mode:** Generate New App

**User Input:**

```
Lead qualifier. Two pages.

Home is a form titled "Qualify a lead" with:
- company (text) — legal name of the account
- role (text)
- notes (textarea)

Submit label is "Qualify". It calls qualify_lead, then go to Results.

Results shows a pill "Company: {company}", the score as a large stat, the reasons as a list, and a Back link to home.
While qualify_lead is running, Results should look like it is loading — not empty.
```

**Add an API:**

1. Kind: **Workflow** (must already be **deployed**).
2. Key: `qualify_lead` (must match User Input).
3. Response: **JSON** (stream off).
4. **Output format** — paste a representative body, not a full CRM dump:

```json
{
  "score": 72,
  "reasons": ["Industry fit", "Headcount in range"],
  "company": "Northwind"
}
```

Leave **Pages** blank. Run the workflow, then **Deploy → GUI App → Preview**. Fill the form and click Qualify. You should land on Results with a score, not a wall of raw JSON.

If you skip Output format, Results will usually be a single text block on `content`.

---

## Example 2 — Streaming write-up (markdown Output format)

Use this when the backend streams a report (markdown or long prose) and you want the page to fill as tokens arrive.

**Mode:** Generate New App

**User Input:**

```
Company briefing. Two pages.

Home is a single search field: company name or domain.
Placeholder: "Search a company or domain".
Submit label is "Brief". It calls research_company, then go to Brief.

Brief shows the streamed report as formatted markdown (headings and bullets).
Show stepped progress only while the run is pending.
Brief has a Back link to home.
Empty copy: "Search a company to generate a briefing."
```

**Add an API:**

1. Kind: **Workflow** (deployed) or **HTTP**.
2. Key: `research_company`.
3. Response: **Stream** on.
4. **Output format** — paste an **example of the token stream**, the same shape you want on screen. Markdown is the right paste here, not JSON:

```markdown
# Acme Corp

## Summary
One-paragraph overview of what the company does and who it sells to.

## Business
- Products
- Customers
- Geography

## Risks
- Short bullets
```

That sample is stored as a hint (`outputHint`). The generator matches headings and density; it does not invent a Table from the markdown.

**If the stream later also returns a JSON object** (for example a `companies` array flushed at the end), paste **that JSON** in Output format instead — or in addition as a JSON sample. New drafts then bind those fields as Table / Stat, and still stream the prose into `content`.

```json
{
  "companies": [
    { "name": "Acme Corp", "domain": "acme.com", "fit": "high" }
  ]
}
```

Paste JSON only when the API truly returns that object. A markdown example plus invented column names produces a bad results page.

---

## Example 3 — Article recommendations (form values on Results + History)

Use this when a long-running markdown API should show the typed keyword and brand on Results, with a History tab that loads its own list.

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
- Back to Generator at the top
- Two pills: "Keyword: {targetKeyword}" and "Client: {clientBrand}"
- Bind the text returned by recommend_articles on DataText statePath "content" as formatted markdown
  (H1 title, repeating H2 sections with bold Writing Instructions and Target Keywords bullet lists,
  optional VISUAL & TABLE OPPORTUNITIES callouts, FAQ with bold Q: and plain A:)
- While recommend_articles is running, Results should look like it is loading — not empty.
  Header copy can be Working on "{targetKeyword}" for {clientBrand}…

History page onLoad calls run_history (do not call it from the tab click).
Show past generations most recent first (keyword, client, date).
Clicking an item opens that generation in the same Results layout, read-only.

Do not show raw JSON anywhere.
```

**Add an API** (twice):

1. Key `recommend_articles` — **Workflow** (deployed) or **HTTP**. Response: **Stream** on if the body is markdown. **Output format** — a short markdown sample of one recommendation doc (same heading shape as above).
2. Key `run_history` — list payload. **Output format** JSON if you have it:

```json
{
  "items": [
    { "keyword": "Dental implants", "client": "42 North Dental", "date": "2026-08-23" }
  ]
}
```

Leave **Pages** blank. Copy Markdown / Download PDF are not host actions — add them later in **Requested Changes** only if you implement them yourself.

**History is empty but the API returned data:** Redeploy `run_history` after changing its Response block, then edit with a page-scoped prompt (`On the "history" page, bind Repeat or Table to items`). Generate/edit re-reads the deployed output schema. Saying “do not show raw JSON” without a list `statePath` that matches that schema replaces the working `DataText` dump with an empty Repeat.

---

## After the first run

1. Open **Preview**. Click through every page and run the CTA once.
2. If a `statePath` is unresolved, use **Copy as edit instructions** and paste into **Requested Changes**.
3. To change one screen, **Copy page edit prompt** first (`On the "brief" page, …`) so Edit does not rewrite the rest.
4. Theme (brand, density, dark mode): use the preview picker, copy the theme instructions, paste into Requested Changes. Theme-only edits do not call the generator.
5. Launch from **Deploy → GUI App** when Preview is good. Do not use identifier `preview`.

---

## Short checklist

- Same API **key** in User Input and Add an API.
- Bound workflows are **deployed** before Preview / Launch.
- JSON APIs: paste Output format JSON so Results is not a text dump.
- Streaming APIs: turn Stream **on**, then paste a markdown (or JSON) example of the real stream.
- User Input names pages, **camelCase field names**, submit label, and “then go to {page}”.
- To show typed values on Results, write `{targetKeyword}` (or the field name) there — do not wait for the API to echo them.
- Edits are deltas. Do not paste the original brief again.
