# Composition Semantics

Human-readable expansion of the composition rules in `PLANNER_CONTRACT_PROMPT` (`apps/sim/lib/arena-generative-ui/planner-contract.ts`). The TypeScript prompt is what the planner sees. If this document and the prompt disagree, update this document. The full planner contract is [arena-generative-ui-planner-contract.md](./arena-generative-ui-planner-contract.md).

Workspace here is the **generated app's multi-region page archetype**. It is not a catalog component and not a product tenant.

---

## 1. Principle

Decide structure **before** inventing pages.

Applications are composed from independent semantic units:

```text
App
 → Shell
 → Pages
 → Regions
 → Archetypes
 → Capabilities
 → Representations
```

An archetype defines **purpose and behavior**, not a page template. The same archetype may occupy a whole page or one region. Layout is the renderer's job.

Do not treat conventional application patterns as mandatory composition.

---

## 2. Four questions

Answer WHAT, WHERE, HOW, WHEN in that order.

```text
WHAT can be composed?
WHERE can it be composed?
HOW do regions coordinate?
WHEN should composition happen?
```

---

## 3. WHAT can be composed

Composition units, in order:

```text
App
 → Shell
 → Pages
 → Regions
 → Archetypes
 → Capabilities
 → Representations
```

- An archetype is purpose and behavior, not a page template.
- Capabilities attach to an archetype instance (`create`, `inspect`, `complete` — not `create-page` or `detail-drawer`).
- Presentation (`dialog`, `drawer`, `inline`) is **not** a composition unit. The renderer chooses it.
- Shell (`minimal`, `sidebar`, `workspace`) is chrome, not an archetype. Shell and page archetype are independent decisions.
- Do not invent archetypes. Allowed: `collection`, `detail`, `task`, `results`, `dashboard`, `workflow`, `workspace`. `content` is legacy — do not pick it for a new plan.
- Domain modules (timeline, comments) are not peer archetypes. They are page `modules` on a non-workspace page, or part of a region's recipe.

---

## 4. WHERE it can be composed

```text
application    — many pages
page           — one archetype, or a Workspace page with 2–4 named regions
region         — navigator | primary | inspector | auxiliary
representation — list | table | cards, only inside a collection instance
```

Each region independently uses an existing archetype:

```text
collection
detail
task
results
dashboard
workflow
```

A region must not use `workspace` as its archetype. Nested Workspace is invalid.

### Single-archetype page

Prefer one archetype when one structure satisfies the page's primary job.

```text
Todo list → Collection
```

Create / complete are capabilities on that collection, not extra pages or regions.

### Multi-archetype page

A multi-archetype page is **only** a Workspace page.

Never treat Collection + Detail as two peer page archetypes. That is either:

- a Workspace page (collection in `primary`, detail in `inspector`), or
- a navigation boundary (see WHEN).

Do not compose multiple archetypes merely to make the page richer.

### Region roles

```text
navigator  — browse or select the primary context. Typical: collection
primary    — main working content. Typical: collection, detail, task, results, dashboard
inspector  — contextual information about the current selection. Typical: detail, results
auxiliary  — secondary tools. Use only when required
```

---

## 5. HOW regions coordinate

Regions do not float independently.

Name the flow in `pages[].interaction` (`selection`, `inspect`, `execution`) and each region's `purpose`.

```text
selection — navigator or primary selection updates inspector, or filters another collection
filter    — one region's query narrows another
entity    — primary entity drives inspector
```

`pages[].interaction` keys the host parses: `selection`, `inspect` (alias `detail`), `execution`, `completion`, `editing`. Values are short semantic phrases (`single`, `selected task`, `long-running`), not implementation (`open detail drawer`). `filter` and `entity` are coordination kinds — write them in region `purpose` and `interaction.selection` / `inspect`, not as extra keys.

Example:

```text
projects.selection → task collection
tasks.selection    → task inspector
```

Uncoordinated regions are invalid. Prefer fewer regions or separate pages.

### Wire format

Emit `pages[].regions` as a **named object**, not an array, and not a `relationship` object.

```text
navigator?
primary?
inspector?
auxiliary?
```

Each region is `{ archetype, entity?, representation?, purpose? }`.

Coordination belongs in `pages[].interaction` and region `purpose`. Do not emit:

```json
{ "source": "projects.selection", "target": "tasks.projectId" }
```

The host drops unknown region keys and ignores `relationship`.

---

## 6. WHEN — compose vs navigate vs local

Ask: must the user see both at once?

| Signal | Decision |
| --- | --- |
| alongside, while keeping X visible, inspect without leaving, simultaneously, split view | Compose on one Workspace page |
| result replaces the current view (task submit then report) | Navigate to another page |
| create / edit / confirm is temporary | Local interaction (dialog, drawer, inline) — not a page, not a region |
| parent / child entities | Do not auto-create extra routes. Default: one Workspace page unless the user asked to leave the current view |
| separate section, dedicated page, open, navigate, manage independently | Navigation |

Inspect navigates to a Detail page unless the user asked to keep the collection visible.

Do not create a Results page merely because an operation returns data if the result must stay beside the task. If the result **replaces** the task, two pages are correct.

Parent / child does not automatically produce `/projects`, `/tasks`, `/tasks/:id`.

### Local interaction

Not every capability requires another region or page.

Prefer:

```text
Collection
 + create → dialog
 + edit → inline / dialog
 + delete → confirmation
```

Use additional regions or pages only when interaction complexity justifies them.

### Task + Results

If the result replaces the task view:

```text
Task → Results          (two pages)
```

If both must remain visible:

```text
Task | Results          (one Workspace page)
```

### Dashboard + Collection

Use both only when monitoring and operational work are required. Do not add a Dashboard because statistics exist. If metrics are secondary, keep them on the collection page.

### Composition depth

Avoid unnecessary nesting.

Prefer:

```text
Workspace
├── Collection
├── Collection
└── Detail
```

over Workspace → Detail → Collection → Detail → Results, unless the user explicitly requires the nested workflow.

---

## 7. Decision order

Run **before** sitemap:

```text
1. What is the user trying to do?
2. Which composition units are required?
3. Must they remain visible together? → compose / navigate / local
4. If compose: which regions, which archetype per region, what coordination?
5. Only then: page count, paths, shell
```

Always prefer the smallest valid composition.

`micro` / `simple` almost never a Workspace page. `moderate` / `complex` may be.

---

## 8. Invariants

- Do not invent pages to satisfy an archetype.
- Do not invent regions to look like a Workspace page.
- Do not promote a capability into a page.
- Do not treat presentation as architecture.
- Renderer owns layout and chrome; planner owns structure and coordination.
- Each region has one purpose and one primary archetype.
- No region exists solely for visual decoration or convention.
- Additional regions must reduce friction or satisfy a requirement.

---

## 9. Examples

**Todo** — one collection page. create / complete are capabilities, not pages or regions.

**CRM** — collection pages plus a Detail page (inspect navigates), unless the prompt asked for a persistent inspector.

**Competitor analysis** — task page then results page (replace, not compose).

**Project management** — one `home` Workspace page:

```text
navigator → project collection
primary   → task collection
inspector → task detail
```

`interaction.selection` and `inspect` name the flows. No second page for tasks.

---

## 10. Composition output

The planner defines semantic composition. The renderer determines catalog types and layout.

```json
{
  "path": "home",
  "title": "Projects",
  "purpose": "Keep projects, tasks, and the selected task visible together",
  "archetype": "workspace",
  "regions": {
    "navigator": {
      "archetype": "collection",
      "entity": "project",
      "representation": "list",
      "purpose": "Browse projects"
    },
    "primary": {
      "archetype": "collection",
      "entity": "task",
      "representation": "list",
      "purpose": "Tasks in the selected project"
    },
    "inspector": {
      "archetype": "detail",
      "entity": "task",
      "purpose": "Selected task"
    }
  },
  "interaction": {
    "selection": "project filters tasks",
    "inspect": "selected task"
  }
}
```
