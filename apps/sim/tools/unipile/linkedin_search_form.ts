/**
 * Form builder for Unipile `POST /api/v1/linkedin/search` (Classic multi-value filters).
 * @see https://developer.unipile.com/docs/linkedin-search
 */

/** Classic search: array-of-string ID filters (from List search parameters by type). */
const CLASSIC_STRING_ARRAY_FILTER_KEYS = [
  'industry',
  'location',
  'company',
  'past_company',
  'school',
  'service',
  'connections_of',
  'followers_of',
] as const

const FILTER_KEY_LABELS: Record<string, string> = {
  industry: 'Industry (id)',
  location: 'Location (id)',
  company: 'Current company (id)',
  past_company: 'Past company (id)',
  school: 'School (id)',
  service: 'Service category (id)',
  connections_of: 'Connections of (id)',
  followers_of: 'Followers of (id)',
  profile_language: 'Profile language (ISO 639-1, 2 letters)',
  network_distance: 'Network (1, 2, or 3)',
  open_to: 'Open to (proBono or boardMember)',
  has_job_offers: 'Has job offers (companies: true / false)',
}

export type UnipileLinkedinSearchFormFilterKey =
  | (typeof CLASSIC_STRING_ARRAY_FILTER_KEYS)[number]
  | 'profile_language'
  | 'network_distance'
  | 'open_to'
  | 'has_job_offers'

export function getLinkedinSearchFilterComboboxOptions(): { label: string; value: string }[] {
  const keys: UnipileLinkedinSearchFormFilterKey[] = [
    ...CLASSIC_STRING_ARRAY_FILTER_KEYS,
    'profile_language',
    'network_distance',
    'open_to',
    'has_job_offers',
  ]
  return keys.map((value) => ({
    value,
    label: FILTER_KEY_LABELS[value] ?? value,
  }))
}

export function getLinkedinSearchFilterLabel(key: string): string {
  return FILTER_KEY_LABELS[key] ?? key
}

const stringArrayKeySet = new Set<string>(CLASSIC_STRING_ARRAY_FILTER_KEYS)

type FilterRow = { name?: string; value?: string }

/**
 * Build JSON body for LinkedIn search from block form fields.
 * If `linkedin_search_public_url` is set, returns `{ url }` (overrides other form fields).
 */
export function buildLinkedinSearchBodyFromForm(
  params: Record<string, unknown>
): Record<string, unknown> {
  const url =
    typeof params.linkedin_search_public_url === 'string'
      ? params.linkedin_search_public_url.trim()
      : ''
  if (url.length > 0) {
    return { url }
  }

  const api =
    typeof params.linkedin_search_api === 'string' && params.linkedin_search_api.trim() !== ''
      ? params.linkedin_search_api.trim()
      : 'classic'
  const category =
    typeof params.linkedin_search_category === 'string' &&
    params.linkedin_search_category.trim() !== ''
      ? params.linkedin_search_category.trim()
      : 'people'
  const kw =
    typeof params.linkedin_search_keywords === 'string'
      ? params.linkedin_search_keywords.trim()
      : ''

  const body: Record<string, unknown> = { api, category }
  if (kw.length > 0) {
    body.keywords = kw
  }

  if (api === 'sales_navigator' || api === 'recruiter') {
    return body
  }

  // Classic: merge filter rows (input-format: name = filter key, value = id or token)
  const raw = params.linkedin_search_filters_input
  if (!Array.isArray(raw)) {
    return body
  }

  const openTo: string[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as FilterRow
    const key = typeof row.name === 'string' ? row.name.trim() : ''
    const val = typeof row.value === 'string' ? row.value.trim() : ''
    if (!key || !val) continue

    if (key === 'has_job_offers') {
      if (val === 'true') {
        body.has_job_offers = true
      } else if (val === 'false') {
        body.has_job_offers = false
      }
      continue
    }
    if (key === 'open_to') {
      if (val === 'proBono' || val === 'boardMember') {
        openTo.push(val)
      }
      continue
    }
    if (key === 'network_distance') {
      const n = Number.parseInt(val, 10)
      if (n === 1 || n === 2 || n === 3) {
        if (!Array.isArray(body.network_distance)) {
          body.network_distance = []
        }
        ;(body.network_distance as number[]).push(n)
      }
      continue
    }
    if (key === 'profile_language') {
      if (val.length === 2) {
        if (!Array.isArray(body.profile_language)) {
          body.profile_language = []
        }
        ;(body.profile_language as string[]).push(val)
      }
      continue
    }
    if (stringArrayKeySet.has(key)) {
      if (!Array.isArray(body[key])) {
        body[key] = []
      }
      ;(body[key] as string[]).push(val)
    }
  }

  if (openTo.length > 0) {
    body.open_to = openTo
  }

  return body
}
