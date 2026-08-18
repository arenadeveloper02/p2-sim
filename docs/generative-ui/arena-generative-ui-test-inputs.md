# Arena Generative UI — test inputs

Two copy-paste sets for the **Arena Generative UI** block. Use **Generate New App** for both. User Input is prose; only Pages and API Bindings are JSON (leave those blank unless the set says otherwise).

After the run, open **Deploy → GUI App**, pick the draft, then **Preview**.

---

## Set 1 — Navigation only (no CTA)

Use this first. No deployed workflow or HTTP binding is required. Checks pages, NavLinks, and Back.

### Mode

`Generate New App`

### User Input

```
Team directory. Two pages.

Home is a short intro titled "People" with two lines of copy:
- Find someone on the team
- Open a person to see their role

Home has a NavLink labeled "View person" that goes to person.

Person shows name "Ada Lovelace", role "Engineer", and a one-line bio.
Person has a Back button that returns to home.

No forms. No API calls.
```

### Pages

Leave blank so the model chooses pages from User Input. Or pin:

```json
[
  { "path": "home", "title": "People", "purpose": "Intro and link to a person" },
  { "path": "person", "title": "Profile", "purpose": "Show one teammate and Back" }
]
```

### Entry Path

```
home
```

### API Bindings

Leave empty. An empty field, `[]`, or `{}` all mean navigation-only (no CTAs).

### Design Notes

```
Calm Arena-like layout. One primary link per page. No forms.
```

### What to check in Preview

1. Home shows the intro and **View person**.
2. **View person** opens `/gui-apps/preview/{draftId}/person`.
3. Person shows name, role, bio, and **Back**.
4. **Back** returns to home.
5. No submit / API errors (there are no CTAs).

---

## Set 2 — Form, workflow CTA, results

Use this after Set 1. Tests a live CTA. The bound workflow must already be **deployed**.

Replace `REPLACE_WITH_DEPLOYED_WORKFLOW_ID` with that workflow’s id. Its start inputs should accept `company`, `role`, and `notes`, and return something like `{ "score": 91 }`.

### Mode

`Generate New App`

### User Input

```
Lead qualifier. Two pages.

Home is a form titled "Qualify a lead" with three required fields:
- company (text)
- role (text)
- notes (textarea)

Home also has a NavLink labeled "Results" that goes to results (so you can open results without submitting).

The submit button label is "Qualify". It calls qualify_lead, then goes to results.

Results titled "Score" shows the score from state path "score" (fallback "—") and a short line of copy.
Results has a Back button that returns to home.
```

### Pages

Leave blank so the model chooses pages from User Input. Or pin:

```json
[
  { "path": "home", "title": "Form", "purpose": "Collect company, role, notes" },
  { "path": "results", "title": "Score", "purpose": "Show qualification score and Back" }
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
    "key": "qualify_lead",
    "kind": "workflow",
    "workflowId": "REPLACE_WITH_DEPLOYED_WORKFLOW_ID",
    "label": "Qualify",
    "inputSchema": [
      { "name": "company", "type": "string" },
      { "name": "role", "type": "string" },
      { "name": "notes", "type": "string" }
    ]
  }
]
```

### Design Notes

```
One card per page. Primary button is Qualify. Results is sparse: score plus Back.
```

### What to check in Preview

1. Home shows the three fields, **Qualify**, and **Results**.
2. **Results** NavLink opens the results page (score may be "—" until you submit).
3. Fill company / role / notes and click **Qualify**.
4. If the bound workflow is deployed, you land on results and see a score.
5. If it is not deployed, the CTA error is "Bound workflow is not deployed".
6. **Back** returns to home.

Do not use identifier `preview` when you later Launch — that name is reserved.