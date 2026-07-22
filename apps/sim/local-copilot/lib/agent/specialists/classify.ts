import type {
  LocalCopilotIntent,
  LocalCopilotSpecialistDomain,
} from '@/local-copilot/lib/agent/specialists/domains'

interface DomainPattern {
  domain: Exclude<LocalCopilotSpecialistDomain, 'general'>
  patterns: RegExp[]
  weight: number
}

const DOMAIN_PATTERNS: DomainPattern[] = [
  {
    domain: 'run',
    weight: 3,
    patterns: [
      /\b(run|execute|test|trigger|debug|logs?|execution|failed|error|retry)\b/i,
      /\brun[_ ]?(block|from|workflow)\b/i,
      /\bwhy\s+(did|does|is)\b/i,
    ],
  },
  {
    domain: 'deploy',
    weight: 3,
    patterns: [
      /\b(deploy|redeploy|promote|chat\s*url|api\s*endpoint|mcp\s*server|go\s*live|production)\b/i,
      /\bdeployment\b/i,
    ],
  },
  {
    domain: 'research',
    weight: 2,
    patterns: [
      /\b(search|research|look\s*up|find\s+out|scrape|crawl|docs?|documentation|what\s+is|latest|news|web)\b/i,
      /\bonline\b/i,
      /\b(remember|prefer|preference|always\s+use|don'?t\s+forget|forget\s+that)\b/i,
    ],
  },
  {
    domain: 'workflow',
    weight: 2,
    patterns: [
      /\b(build|create|edit|add|wire|connect|workflow|block|agent|automate|pipeline)\b/i,
      /\b(modify|update|change|fix)\s+(the\s+)?(workflow|block)/i,
    ],
  },
  {
    domain: 'file',
    weight: 3,
    patterns: [
      /\b(file|folder|vfs|markdown|csv|docx?|pptx?|pdf|slides?|deck|presentation|powerpoint|read\s+file|write\s+file|glob|grep)\b/i,
      /\b(create|make|generate|build|write)\s+(an?\s+)?(ppt|pptx|powerpoint|presentation|slides?|deck|docx?|pdf|document)\b/i,
    ],
  },
  {
    domain: 'data',
    weight: 2,
    patterns: [
      /\b(table|spreadsheet|rows?|knowledge\s*base|kb\b|enrichment|vector|semantic\s+search)\b/i,
    ],
  },
  {
    domain: 'auth',
    weight: 3,
    patterns: [/\b(oauth|credential|api\s*key|connect\s+(gmail|slack|google)|authorize|auth)\b/i],
  },
  {
    domain: 'media',
    weight: 3,
    patterns: [
      /\b(image|logo|thumbnail|audio|tts|music|video|ffmpeg|generate\s+(an?\s+)?(image|audio|video))\b/i,
    ],
  },
  {
    domain: 'schedule',
    weight: 3,
    patterns: [/\b(schedule|cron|recurring|every\s+day|scheduled\s+task)\b/i],
  },
]

/**
 * Heuristic turn classifier — no extra LLM call.
 * Scores keyword hits per domain; ambiguous / weak scores → full catalog.
 */
export function classifyLocalCopilotIntent(message: string): LocalCopilotIntent {
  const text = message.trim()
  if (!text) {
    return { primary: 'general', secondary: [], useFullCatalog: true }
  }

  const scores = new Map<Exclude<LocalCopilotSpecialistDomain, 'general'>, number>()

  for (const entry of DOMAIN_PATTERNS) {
    let hits = 0
    for (const pattern of entry.patterns) {
      if (pattern.test(text)) hits += 1
    }
    if (hits > 0) {
      scores.set(entry.domain, (scores.get(entry.domain) ?? 0) + hits * entry.weight)
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) {
    return { primary: 'general', secondary: [], useFullCatalog: true }
  }

  const [topDomain, topScore] = ranked[0]
  const secondaries = ranked
    .slice(1)
    .filter(([, score]) => score >= Math.max(2, topScore * 0.5))
    .map(([domain]) => domain)

  // Weak single signal → keep full catalog so we do not over-constrain.
  if (topScore < 2 && secondaries.length === 0) {
    return { primary: 'general', secondary: [], useFullCatalog: true }
  }

  // Many competing domains without a clear lead → full catalog.
  if (secondaries.length >= 3) {
    return { primary: 'general', secondary: [], useFullCatalog: true }
  }

  return {
    primary: topDomain,
    secondary: secondaries,
    useFullCatalog: false,
  }
}

/**
 * Whether to run a bounded specialist pass before the main loop.
 * Triggers when research/auth must gather facts before build/run/deploy work.
 */
export function shouldRunSpecialistPass(intent: LocalCopilotIntent): boolean {
  if (intent.useFullCatalog) return false
  if (intent.secondary.includes('research') || intent.secondary.includes('auth')) return true
  if (
    intent.primary === 'research' &&
    intent.secondary.some(
      (domain) => domain === 'workflow' || domain === 'run' || domain === 'deploy'
    )
  ) {
    return true
  }
  if (
    intent.primary === 'auth' &&
    intent.secondary.some(
      (domain) => domain === 'workflow' || domain === 'run' || domain === 'deploy'
    )
  ) {
    return true
  }
  return false
}

export function specialistPassDomain(
  intent: LocalCopilotIntent
): LocalCopilotSpecialistDomain | null {
  if (!shouldRunSpecialistPass(intent)) return null
  if (intent.primary === 'research' || intent.secondary.includes('research')) return 'research'
  if (intent.primary === 'auth' || intent.secondary.includes('auth')) return 'auth'
  return intent.secondary[0] ?? null
}

/** High-value domains eligible for Phase 4 parallel fan-out (ordered by priority). */
export const PARALLEL_SUBAGENT_PRIORITY: Exclude<LocalCopilotSpecialistDomain, 'general'>[] = [
  'research',
  'workflow',
  'deploy',
  'run',
  'auth',
  'data',
  'file',
]

export const MAX_PARALLEL_SUBAGENTS = 3

/**
 * Selects domains for Phase 4 parallel subagents.
 * Requires at least two focused domains; returns at most {@link MAX_PARALLEL_SUBAGENTS}.
 */
export function selectParallelSubagentDomains(
  intent: LocalCopilotIntent
): Exclude<LocalCopilotSpecialistDomain, 'general'>[] {
  if (intent.useFullCatalog) return []

  const candidates = new Set<Exclude<LocalCopilotSpecialistDomain, 'general'>>()
  if (intent.primary !== 'general') {
    candidates.add(intent.primary)
  }
  for (const domain of intent.secondary) {
    if (domain !== 'general') candidates.add(domain)
  }

  if (candidates.size < 2) return []

  return PARALLEL_SUBAGENT_PRIORITY.filter((domain) => candidates.has(domain)).slice(
    0,
    MAX_PARALLEL_SUBAGENTS
  )
}
