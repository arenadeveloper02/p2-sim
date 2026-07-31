/**
 * Converts model-emitted choice payloads (canonical `<options>` and leaked
 * `single_select` JSON) into the OptionsTagData shape the chat UI renders.
 */

export interface OptionsItemData {
  title: string
  description: string
}

export type OptionsTagData = Record<string, OptionsItemData>

const SINGLE_SELECT_MARKER = /\{\s*"type"\s*:\s*"single_select"/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Extracts a balanced `{...}` JSON object starting at `startIdx`.
 */
export function extractBalancedJsonObject(text: string, startIdx: number): string | null {
  if (text[startIdx] !== '{') return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(startIdx, i + 1)
    }
  }

  return null
}

/**
 * Maps a `single_select` payload to OptionsTagData for Suggested follow-ups.
 */
export function singleSelectToOptionsTagData(value: unknown): OptionsTagData | null {
  if (!isRecord(value) || value.type !== 'single_select') return null
  if (!Array.isArray(value.options) || value.options.length === 0) return null

  const prompt = typeof value.prompt === 'string' ? value.prompt.trim() : ''
  const data: OptionsTagData = {}
  let index = 0

  for (const option of value.options) {
    if (!isRecord(option)) continue
    const label = typeof option.label === 'string' ? option.label.trim() : ''
    if (!label) continue
    index += 1
    data[String(index)] = {
      title: label,
      description: prompt || label,
    }
  }

  return index > 0 ? data : null
}

export interface SingleSelectSplit {
  before: string
  options: OptionsTagData
  prompt: string
  after: string
  /** Full matched JSON substring including braces. */
  json: string
  startIndex: number
}

/**
 * Finds the first complete `single_select` JSON object in text, if any.
 */
export function findSingleSelectJson(text: string): SingleSelectSplit | null {
  const match = SINGLE_SELECT_MARKER.exec(text)
  if (!match || match.index === undefined) return null

  const json = extractBalancedJsonObject(text, match.index)
  if (!json) return null

  try {
    const parsed: unknown = JSON.parse(json)
    const options = singleSelectToOptionsTagData(parsed)
    if (!options) return null
    const prompt =
      isRecord(parsed) && typeof parsed.prompt === 'string' ? parsed.prompt.trim() : ''
    return {
      before: text.slice(0, match.index),
      options,
      prompt,
      after: text.slice(match.index + json.length),
      json,
      startIndex: match.index,
    }
  } catch {
    return null
  }
}

/**
 * True when text contains an opening `single_select` JSON object that is not yet complete.
 */
export function hasIncompleteSingleSelectJson(text: string): boolean {
  const match = SINGLE_SELECT_MARKER.exec(text)
  if (!match || match.index === undefined) return false
  return extractBalancedJsonObject(text, match.index) === null
}

/**
 * Rewrites bare `single_select` JSON blobs into `<options>...</options>` tags
 * so persistence and the special-tag renderer stay consistent.
 */
export function normalizeSingleSelectJsonToOptionsTags(text: string): string {
  let remaining = text
  let result = ''

  while (remaining.length > 0) {
    const found = findSingleSelectJson(remaining)
    if (!found) {
      result += remaining
      break
    }

    result += found.before
    if (!found.before.trim() && found.prompt) {
      result += `${found.prompt}\n\n`
    }
    result += `<options>${JSON.stringify(found.options)}</options>`
    remaining = found.after
  }

  return result.replace(/\n{3,}/g, '\n\n')
}
