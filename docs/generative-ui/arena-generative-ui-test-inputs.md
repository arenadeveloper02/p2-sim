# Arena Generative UI — test input

One copy-paste set for the **Arena Generative UI** block. Matches the [user-guide example](./arena-generative-ui-user-guide.md#example--article-recommendation-agent). Use **Generate New App**. User Input is prose; only Pages and API Bindings are JSON (leave Pages blank unless you want to pin paths).

After the run, open **Deploy → GUI App**, pick the draft, then **Preview**.

Both bound workflows must already be **deployed**. Replace the two `REPLACE_WITH_…` ids. `recommend_articles` should stream markdown. `run_history` should return a list whose rows include `keyword`, `client`, `date`, and a large `output` string.

### Mode

`Generate New App`

### User Input

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
- Bind the markdown on DataText statePath "content"
  (H1 title, repeating H2 sections with bold Writing Instructions and Target Keywords bullet lists,
  optional VISUAL & TABLE OPPORTUNITIES callouts, FAQ with bold Q: and plain A:)
- While recommend_articles is running, Results should look like it is loading — not empty.
  Header copy can be Working on "{targetKeyword}" for {clientBrand}…

History page onLoad calls run_history (do not call it from the tab click).
Repeat cards, most recent first: keyword, client, and date only.
Do not bind item.output, content, body, or a Table column for the markdown — not on the card, not as Card.description.
Each card has a Button labeled "Open" with selectItem true, no actionId, navigateTo "results".
Open is not an API call. The host copies that row's output into content so Results shows the same markdown layout, read-only.

Do not show raw JSON anywhere.
```

### Pages

Leave blank so the model chooses pages from User Input. Or pin:

```json
[
  { "path": "home", "title": "Generator", "purpose": "Collect keyword and client, submit recommend_articles" },
  { "path": "results", "title": "Recommendations", "purpose": "Show streamed markdown; no onLoad" },
  { "path": "history", "title": "History", "purpose": "onLoad run_history; Open copies the row into Results" }
]
```

### Entry Path

```
home
```

### API Bindings

```json
[
  {
    "key": "recommend_articles",
    "kind": "workflow",
    "workflowId": "REPLACE_WITH_RECOMMEND_WORKFLOW_ID",
    "label": "Generate Recommendations",
    "stream": true,
    "inputSchema": [
      { "name": "targetKeyword", "type": "string" },
      { "name": "clientBrand", "type": "string" }
    ]
  },
  {
    "key": "run_history",
    "kind": "workflow",
    "workflowId": "REPLACE_WITH_HISTORY_WORKFLOW_ID",
    "label": "History",
    "outputSchema": [
      { "name": "items", "type": "array" },
      { "name": "items[].id", "type": "string" },
      { "name": "items[].keyword", "type": "string" },
      { "name": "items[].client", "type": "string" },
      { "name": "items[].date", "type": "string" },
      { "name": "items[].output", "type": "string" }
    ]
  }
]
```

Paste a markdown **Sample response** on `recommend_articles` (same heading shape as User Input). On `run_history`, paste JSON if the deployed schema is empty:

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

### Design Notes

```
Calm Arena-like layout. Generator form left-aligned. History cards are compact: keyword, client, date, Open.
```

### What to check in Preview

1. Generator shows the two fields, **Generate Recommendations**, and tabs **Generator** / **History**.
2. Submit lands on Results. Pills show the typed keyword and client. Markdown fills as the stream arrives.
3. History loads on arrival. Cards show keyword, client, date — **not** the full markdown.
4. **Open** on a row goes to Results with **that** run’s markdown. Network must not fire `run_history` or `recommend_articles` again.
5. Results has no empty flash from an `onLoad` reset. **Back** returns to Generator.

If History dumps every `output`, do not regenerate from this set. **Edit Existing Draft** with a page-scoped delta: History cards bind only keyword/client/date; Open is `selectItem` with no `actionId`; Results has no `onLoad`.

Do not use identifier `preview` when you later Launch — that name is reserved.
