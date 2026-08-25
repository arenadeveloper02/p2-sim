import { truncate } from '@sim/utils/string'

/** Max chars kept for a single constraint or pinned directive. */
export const DIRECTIVE_MAX_CHARS = 280

/** Max constraints retained in session memory / prompt. */
export const SESSION_CONSTRAINTS_MAX = 12

export const ACTIVE_DIRECTIVE_SYSTEM_PREFIX =
  'Active user directive (authoritative until superseded):'

export const SESSION_CONSTRAINTS_SYSTEM_PREFIX =
  'Session constraints (honor unless the user explicitly overrides):'

export interface PreferenceMemoryCandidate {
  key: string
  value: string
  memoryType: 'preference' | 'correction' | 'entity'
}

export interface ExtractedDirectives {
  /** Durable session constraints extracted from the latest user turn. */
  constraints: string[]
  /**
   * Short pinned instruction for this turn (corrections / explicit overrides).
   * Null when the message is not directive-like.
   */
  activeDirective: string | null
  /** High-confidence preference phrases to persist via `user_memory`. */
  preferences: PreferenceMemoryCandidate[]
}

const PREFERENCE_PATTERNS: RegExp[] = [
  /\b(?:always|never|from now on)\b[^.!?\n]{0,200}/gi,
  /\bprefer(?:\s+to)?\b[^.!?\n]{0,160}/gi,
  /\b(?:please\s+)?remember(?:\s+to|\s+that)?\b[^.!?\n]{0,160}/gi,
  /\bdon'?t\s+(?:ever\s+)?(?:use|create|ask|do|add|run|build|make)\b[^.!?\n]{0,160}/gi,
  /\buse\s+[^.!?\n]{1,80}\s+instead(?:\s+of\s+[^.!?\n]{1,80})?/gi,
]

const CORRECTION_PATTERNS: RegExp[] = [
  /^(?:no|nope|wrong|actually|wait|stop)[,!.\s]+([\s\S]{1,240})/i,
  /\bi\s+(?:said|meant|asked(?:\s+for)?|told you)\b([\s\S]{1,200})/i,
  /\binstead[,:]?\s+([\s\S]{1,200})/i,
  /\bdo\s+not\b([\s\S]{1,160})/i,
  /\buse\s+[^.!?\n]{1,80}\s+not\s+[^.!?\n]{1,80}/gi,
]

/**
 * Normalizes free-text into a stable user_memory key.
 */
export function preferenceKeyFromText(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = normalized.split(' ').filter(Boolean).slice(0, 8)
  const key = words.join('_') || 'preference'
  return truncate(key, 120, '')
}

function cleanSnippet(raw: string): string {
  return truncate(
    raw
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[,:.\-\s]+/, ''),
    DIRECTIVE_MAX_CHARS,
    ''
  )
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/**
 * Heuristically extracts follow-up constraints, an active directive, and
 * preference candidates from a user message.
 */
export function extractFollowUpDirectives(message: string): ExtractedDirectives {
  const text = message.replace(/\s+/g, ' ').trim()
  if (!text) {
    return { constraints: [], activeDirective: null, preferences: [] }
  }

  const constraints: string[] = []
  const preferences: PreferenceMemoryCandidate[] = []

  for (const pattern of PREFERENCE_PATTERNS) {
    pattern.lastIndex = 0
    let match = pattern.exec(text)
    while (match) {
      const snippet = cleanSnippet(match[0] ?? '')
      if (snippet.length >= 8) {
        constraints.push(snippet)
        preferences.push({
          key: preferenceKeyFromText(snippet),
          value: snippet,
          memoryType: /instead|not that|i (?:said|meant)|wrong|actually/i.test(snippet)
            ? 'correction'
            : 'preference',
        })
      }
      match = pattern.exec(text)
    }
  }

  let activeDirective: string | null = null
  for (const pattern of CORRECTION_PATTERNS) {
    pattern.lastIndex = 0
    const match = pattern.exec(text)
    if (!match) continue
    const captured = cleanSnippet(match[1] ?? match[0] ?? '')
    const snippet = captured.length >= 8 ? captured : cleanSnippet(text)
    if (snippet.length >= 8) {
      activeDirective = snippet
      constraints.push(snippet)
      break
    }
  }

  // Short imperative follow-ups ("use webhook", "edit the existing one") when
  // the user is clearly correcting course mid-thread.
  if (!activeDirective && text.length <= 220) {
    const looksLikeDirective =
      /^(?:please\s+)?(?:use|edit|run|stop|don't|do not|change|switch|keep|remove|delete|fix|retry)\b/i.test(
        text
      ) || /\binstead\b/i.test(text)
    if (looksLikeDirective) {
      activeDirective = cleanSnippet(text)
      constraints.push(activeDirective)
    }
  }

  const uniqueConstraints = uniqueStrings(constraints).slice(-SESSION_CONSTRAINTS_MAX)
  const uniquePreferences = preferences.filter((candidate, index, all) => {
    return all.findIndex((other) => other.key === candidate.key) === index
  })

  return {
    constraints: uniqueConstraints,
    activeDirective,
    preferences: uniquePreferences,
  }
}

/**
 * Merges newly extracted constraints onto prior session constraints.
 */
export function mergeConstraints(previous: string[] | undefined, next: string[]): string[] {
  return uniqueStrings([...(previous ?? []), ...next]).slice(-SESSION_CONSTRAINTS_MAX)
}

/**
 * Formats the pinned active directive as a system message.
 */
export function formatActiveDirectiveSystemMessage(directive: string): {
  role: 'system'
  content: string
} {
  return {
    role: 'system',
    content: `${ACTIVE_DIRECTIVE_SYSTEM_PREFIX}\n${truncate(directive.trim(), DIRECTIVE_MAX_CHARS, '')}`,
  }
}

/**
 * Formats accumulated session constraints as a system message.
 */
export function formatSessionConstraintsSystemMessage(constraints: string[]): {
  role: 'system'
  content: string
} {
  const items = constraints
    .map((item) => `- ${truncate(item.trim(), DIRECTIVE_MAX_CHARS, '')}`)
    .filter((item) => item.length > 2)
  return {
    role: 'system',
    content: `${SESSION_CONSTRAINTS_SYSTEM_PREFIX}\n${items.join('\n')}`,
  }
}

/**
 * True when a chat message is the active-directive system injection.
 */
export function isActiveDirectiveSystemMessage(content: string): boolean {
  return content.startsWith(ACTIVE_DIRECTIVE_SYSTEM_PREFIX)
}
