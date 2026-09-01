import { GENERATOR_OMITTED_PAGES_ERROR } from '@/lib/arena-generative-ui/validate-manifest'

const DEFAULT_ISSUE = 'Generated manifest failed validation'

const SUGGEST_API_KEY =
  'Add that key to API Bindings, or change User Input to a key you already declared.'
const SUGGEST_PAGES = 'Pin a JSON sitemap in Pages and retry.'
const SUGGEST_NAV = 'Name every page in User Input and how you move between them.'
const SUGGEST_PATHS = 'Fix Pages paths (kebab-case) so they match User Input.'
const SUGGEST_CONTROLS = 'Say what each control does (submit, navigate, or an API key).'
const SUGGEST_HOST_CRITIC =
  'Simplify that page in User Input: one primary action, Back on secondary pages, Table or cards instead of invented types, and bind KPIs or drop them.'
const SUGGEST_FALLBACK =
  'Tighten User Input, Pages, and API Bindings to match the issue above, then rerun.'

/**
 * One user action that usually unblocks the remaining generate error.
 */
export function suggestionForGenerateFailure(error: string): string {
  if (error === GENERATOR_OMITTED_PAGES_ERROR || /omitted pages/i.test(error)) {
    return SUGGEST_PAGES
  }
  if (/unknown API key|references unknown API key|unknown action/i.test(error)) {
    return SUGGEST_API_KEY
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
    `- ${suggestionForGenerateFailure(listed[0] ?? DEFAULT_ISSUE)}`,
  ].join('\n')
}
