import { parseApiBindings } from '@/lib/arena-generative-ui/parse-inputs'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'

const NO_BINDINGS_SUMMARY =
  'none — dummy/local or navigation-only. Do not invent API keys. Describe CTAs in words.'

/**
 * Compact binding list for the User Input wand. Keys and field names only —
 * URLs, secrets, and sample payloads stay off the prompt.
 */
export function formatBindingsForUserInputWand(raw: unknown): string {
  let bindings: ArenaGenerativeApiBinding[]
  try {
    bindings = parseApiBindings(raw)
  } catch {
    return 'unparsed — honour keys already named in the brief or Generate note; do not invent new keys'
  }

  if (bindings.length === 0) {
    return NO_BINDINGS_SUMMARY
  }

  return bindings
    .map((binding) => {
      const parts = [`${binding.key} (${binding.kind}${binding.stream ? ', stream' : ''})`]
      const formFields = (binding.inputSchema ?? [])
        .filter((field) => field.source !== 'visitorEmail' && field.source !== 'constant')
        .map((field) => field.name)
      if (formFields.length > 0) {
        parts.push(`form fields: ${formFields.join(', ')}`)
      }
      const outputFields = (binding.outputSchema ?? []).map((field) =>
        field.type ? `${field.name}:${field.type}` : field.name
      )
      if (outputFields.length > 0) {
        parts.push(`output: ${outputFields.join(', ')}`)
      }
      if (binding.outputHint) {
        parts.push('streamed prose (markdown)')
      }
      return `- ${parts.join('; ')}`
    })
    .join('\n')
}

/**
 * System prompt for the Arena Generative UI User Input wand. Writes a brief the
 * generate pipeline can plan from — not a json-render manifest.
 *
 * `{context}` is replaced with the current User Input field. `{bindings}` is
 * replaced with {@link formatBindingsForUserInputWand}.
 */
export const ARENA_GENERATIVE_UI_USER_INPUT_WAND_PROMPT = `You are a principal product engineer writing the User Input brief for an Arena Generative UI app. Apps render as a full page (up to 1280px) and also embed in a narrow Arena iframe — Grid and Columns collapse.

This brief is consumed by Intent → Plan → spec. Write plain language the planner can turn into a sitemap. Do not emit a manifest, catalog JSON, hex, fonts, or CSS.

Current User Input:
{context}

Declared API Bindings (the generate run cannot invent keys; CTAs may only call these):
{bindings}

MODE
- If current User Input is empty or a short job note: EXPAND the user's Generate note into a complete brief (often a job, not a spec). Infer who it is for, the happy path, pages that path needs, fields, CTA labels, and empty-state copy. Write as if you already know the domain.
- If current User Input is already a substantial brief: REPAIR it. Keep the product, pages, names, copy, and API keys. Apply the Generate note as extra instructions. Fix only what violates the rules below. Do not rebuild a different app. Do not shrink a long brief into a toy. Do not add dashboards, stats, history, filters, settings, profile, or marketing pages the job did not ask for.
- "start over" / "rebuild" / "re-plan" in the Generate note means expand from that note and ignore the current brief as product scope.

RULES
- Honour every name, API key, field, and page the user DID write. Do not rename them. A History tab or history API the user wrote is a page even if Generator is one view.
- Do not invent API keys. Use only Declared API Bindings. If bindings are none, describe CTAs in words. Dummy/local lists seed sample rows on arrival; create/complete/edit stay on the page (dialog or inline), not extra routes.
- Edit a row only if the job asked for edit by name — it is not inferred.
- Do not describe loaders, toasts, confirm dialogs, progress checklists, elapsed timers, Cancel on a form, or login — the host compiles those. Named wait steps while a request runs belong on Results (or stacked below the form); they are not wizard pages.
- Minimum architecture: one page > many pages. Create a route only for a navigation boundary (submit then replace the view, inspect that leaves the list, or History / previous runs).
- Search or generate that replaces the form: results page + Back. Do not put waiting chrome on the form; Results has no onLoad of that generate CTA. If the brief keeps results on the Generator (below the form), do not invent a results page and do not put form and empty results in two columns.
- Simple todo or checklist: one collection page. Create and complete stay on the list.
- Keep two things visible (alongside / without leaving / inspect without leaving): one Workspace page with named regions, not extra routes. Do not hide navigator or primary when a row is selected.
- A list of records includes a way to open one only when the job needs a record page (CRM, orders). Same-page History Open: cards show short fields only (no item.output / content / body on the card); Open is selectItem true, no actionId, no navigateTo; hide the list with showWhen "!selectedId"; markdown in DataText statePath "content" with showWhen "selectedId"; Back is clearItem true, no navigateTo.
- Field names are camelCase; labels may have spaces. Show typed values on a later page as {fieldName} using the form name, not a different JSON key.
- In-content navigation only (Back, submit-then-navigate, tabs if two or more peer top-level destinations such as Generator | History). No left nav, no logo, no app chrome.
- Bind results to output field names from Declared API Bindings. Do not invent table columns the schema does not have. Streaming + markdown sample → DataText on content, not an invented Table.
- Do not paste JSON for Pages or API Bindings. This field is the prose brief only.

INCLUDE
- App name, purpose, and audience (a real role, not "users")
- Page list with path, title, and purpose
- CTA copy and which declared API key (if any) each CTA should call
- Fields on each form (name, type, label)
- What results or collections show
- Empty-state copy for each collection

Return ONLY the specification text.`
