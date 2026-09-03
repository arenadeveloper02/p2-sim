import { GENERATOR_OMITTED_PAGES_ERROR } from '@/lib/arena-generative-ui/validate-manifest'

const DEFAULT_ISSUE = 'Generated manifest failed validation'

const SUGGEST_API_KEY =
  'Add that key in Add an API (or change User Input to a key you already declared), then rerun.'
const SUGGEST_PAGES = 'Pin a JSON sitemap in Pages that lists every path the brief names, then rerun.'
const SUGGEST_NAV = 'Name every page in User Input and how you move between them (Submit → results, Back, Tabs).'
const SUGGEST_PATHS = 'Fix Pages paths (kebab-case like home or results) so they match User Input.'
const SUGGEST_CONTROLS = 'Say what each control does: submit an API key, navigate to a page, or Open a row.'
const SUGGEST_HOST_CRITIC =
  'Simplify that page in User Input: one primary action, Back on secondary pages, Table or cards instead of invented types, and bind KPIs or drop them.'
const SUGGEST_HOST_KEY =
  'Open Add an API and paste a Sample response that includes those fields (the list or object the table binds), not a Response envelope `{ data, status, headers }`. Then rerun.'
const SUGGEST_CHAT =
  'That binding is a chat Start. In User Input, put Chat on the results page, or add form fields in Add an API so the first turn can be a Form.'
const SUGGEST_STREAM =
  'On that binding, turn Stream off if the API returns JSON, or say in User Input that results use Chat or DataText bound to content.'
const SUGGEST_FORM_FIELDS =
  'Rename those form fields to match the Start inputs shown in Add an API, or add the missing Start fields on the binding.'
const SUGGEST_FALLBACK =
  'Tighten User Input to the job, confirm Add an API shows the fields the UI should bind, pin Pages if the sitemap drifted, then rerun.'

/**
 * One user action that usually unblocks a remaining generate error.
 */
export function suggestionForGenerateFailure(error: string): string {
  if (error === GENERATOR_OMITTED_PAGES_ERROR || /omitted pages/i.test(error)) {
    return SUGGEST_PAGES
  }
  if (/unknown API key|references unknown API key|unknown action/i.test(error)) {
    return SUGGEST_API_KEY
  }
  if (/never binds required host key/i.test(error)) {
    return SUGGEST_HOST_KEY
  }
  if (/chat protocol/i.test(error)) {
    return SUGGEST_CHAT
  }
  if (/streams with chat protocol|stream: true|DataText statePath "content"/i.test(error)) {
    return SUGGEST_STREAM
  }
  if (/form field|inputSchema|not a declared input/i.test(error)) {
    return SUGGEST_FORM_FIELDS
  }
  if (
    /Unreachable pages|navigates to unknown path|onSuccess\.navigate ".+" is not a page/i.test(
      error
    )
  ) {
    return SUGGEST_NAV
  }
  if (
    /Invalid page path|Missing requested pages|Generated pages not in the requested list|kebab-case/i.test(
      error
    )
  ) {
    return SUGGEST_PATHS
  }
  if (/would do nothing|no actionId, navigateTo/i.test(error)) {
    return SUGGEST_CONTROLS
  }
  if (
    /nested inside another Card|more than one primary|Cards outside Repeat|onSuccess\.navigate target|not a catalog type|Bind the metric|Bind the series|Workspace/i.test(
      error
    )
  ) {
    return SUGGEST_HOST_CRITIC
  }
  return SUGGEST_FALLBACK
}

function uniqueSuggestions(issues: string[]): string[] {
  const seen = new Set<string>()
  const suggestions: string[] = []
  for (const issue of issues) {
    const suggestion = suggestionForGenerateFailure(issue)
    if (seen.has(suggestion)) continue
    seen.add(suggestion)
    suggestions.push(suggestion)
  }
  return suggestions
}

/**
 * Block-facing text after catalog, host-critic, or critic-repair turns are spent.
 */
export function formatGenerateFailureForUser(options: {
  issues: string[]
  repairAttempts: number
}): string {
  const issues = options.issues.map((issue) => issue.trim()).filter((issue) => issue.length > 0)
  const listed = issues.length > 0 ? issues : [DEFAULT_ISSUE]
  return [
    `Could not generate a valid app after ${options.repairAttempts} repair attempts.`,
    '',
    'What still needs to be fixed:',
    ...listed.map((issue) => `- ${issue}`),
    '',
    'What you can do:',
    ...uniqueSuggestions(listed).map((suggestion) => `- ${suggestion}`),
  ].join('\n')
}
