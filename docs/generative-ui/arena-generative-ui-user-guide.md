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
| **Output format** (inside Add an API) | A sample of what the API returns. This is how the model decides Table vs Stat vs prose. |
| **Design Notes** | Optional. Brand, density, dark mode. Skip unless you care. |

The model **cannot invent API keys**. If User Input says “Submit calls `qualify_lead`”, that key must exist in API Bindings. Leave Bindings empty only for a navigation-only app (no forms that call a backend).

Name pages, fields, and CTA keys. Vague briefs (“make a research tool”) produce generic shells.

---

## Output format (this is the layout lever)

**Add an API → Output format** is a sample of the response. Sim keeps **names and types only** — pasted values never reach the model or the database.

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

Results shows the score as a large stat, the reasons as a list, and a Back link to home.
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
- User Input names pages, fields, submit label, and “then go to {page}”.
- Edits are deltas. Do not paste the original brief again.
