/**
 * Builds a Drive `q` string without calling an LLM — used when AI query
 * generation is unavailable (common in local/dev) and when the model omits
 * keyword predicates.
 */

const STOP_WORDS = new Set([
  'find',
  'search',
  'show',
  'me',
  'my',
  'the',
  'a',
  'an',
  'of',
  'for',
  'from',
  'in',
  'on',
  'to',
  'with',
  'and',
  'or',
  'files',
  'file',
  'give',
  'get',
  'list',
  'lists',
  'which',
  'are',
  'is',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'available',
  'what',
  'where',
  'when',
  'who',
  'how',
  'named',
  'name',
  'called',
  'titled',
  'google',
  'doc',
  'docs',
  'document',
  'documents',
  'sheet',
  'sheets',
  'spreadsheet',
  'spreadsheets',
  'slide',
  'slides',
  'presentation',
  'presentations',
  'pdf',
  'folder',
  'please',
])

const TYPE_LITERALS = new Set([
  'deck',
  'decks',
  'slides',
  'slide',
  'presentation',
  'presentations',
  'pdf',
  'ppt',
  'pptx',
  'doc',
  'docs',
  'document',
  'documents',
  'sheet',
  'sheets',
  'spreadsheet',
  'spreadsheets',
  'excel',
  'xlsx',
  'folder',
  'google',
])

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Extracts meaningful search tokens from a natural-language Drive prompt.
 */
export function extractDriveSearchKeywords(prompt: string): string[] {
  const tokens = prompt.match(/[A-Za-z0-9\-_]+/g) || []
  const keywords: string[] = []
  const seen = new Set<string>()

  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (STOP_WORDS.has(lower) || TYPE_LITERALS.has(lower)) continue
    if (token.length < 2) continue
    if (seen.has(lower)) continue
    keywords.push(token)
    seen.add(lower)
    if (keywords.length >= 10) break
  }

  return keywords
}

/**
 * Detects Drive MIME types hinted by the prompt.
 */
export function detectDriveMimeTypes(prompt: string): string[] {
  const p = prompt.toLowerCase()
  const mimes: string[] = []

  if (p.includes('pdf')) {
    mimes.push('application/pdf')
  }
  if (
    ['deck', 'decks', 'slides', 'slide', 'presentation', 'presentations', 'ppt', 'pptx'].some((w) =>
      p.includes(w)
    )
  ) {
    mimes.push('application/vnd.google-apps.presentation')
  }
  if (['doc', 'docs', 'document', 'documents'].some((w) => p.includes(w))) {
    mimes.push('application/vnd.google-apps.document')
  }
  if (
    ['sheet', 'sheets', 'spreadsheet', 'spreadsheets', 'excel', 'xlsx'].some((w) => p.includes(w))
  ) {
    mimes.push('application/vnd.google-apps.spreadsheet')
  }
  if (p.includes('folder')) {
    mimes.push('application/vnd.google-apps.folder')
  }

  const seen = new Set<string>()
  return mimes.filter((m) => {
    if (seen.has(m)) return false
    seen.add(m)
    return true
  })
}

/**
 * Deterministic Drive query used when LLM query generation fails or omits keywords.
 */
export function buildDriveQueryFallback(prompt: string, folderId?: string | null): string {
  const parts: string[] = ['trashed=false']

  const mimes = detectDriveMimeTypes(prompt)
  if (mimes.length === 1) {
    parts.push(`mimeType='${escapeDriveQueryValue(mimes[0])}'`)
  } else if (mimes.length > 1) {
    parts.push(`(${mimes.map((m) => `mimeType='${escapeDriveQueryValue(m)}'`).join(' or ')})`)
  }

  if (folderId?.trim()) {
    parts.push(`'${escapeDriveQueryValue(folderId.trim())}' in parents`)
  }

  const keywords = extractDriveSearchKeywords(prompt)
  if (keywords.length > 0) {
    const keywordConditions = keywords.map((kw) => {
      const safe = escapeDriveQueryValue(kw)
      return `(name contains '${safe}' or fullText contains '${safe}')`
    })
    parts.push(`(${keywordConditions.join(' and ')})`)
  }

  return parts.join(' and ')
}
