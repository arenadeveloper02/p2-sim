import type {
  LocalCopilotCloudSpecialistDomain,
  LocalCopilotIntent,
  LocalCopilotSpecialistDomain,
} from '@/local-copilot/lib/agent/specialists/domains'
import { MAX_PARALLEL_SUBAGENTS } from '@/local-copilot/lib/agent/specialists/domains'

interface DomainPattern {
  domain: LocalCopilotCloudSpecialistDomain
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
      /\b(build|create|edit|add|wire|connect|workflow|block|automate|pipeline)\b/i,
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
    domain: 'knowledge',
    weight: 3,
    patterns: [
      /\b(knowledge\s*base|kb\b|vector|semantic\s+search|ingest\s+(doc|document|file)|rag)\b/i,
    ],
  },
  {
    domain: 'table',
    weight: 3,
    patterns: [/\b(table|spreadsheet|rows?|enrichment|enrich\s+rows?)\b/i],
  },
  {
    domain: 'auth',
    weight: 3,
    patterns: [
      /\b(oauth|credential|api\s*key|connect\s+(gmail|slack|google)|authorize|auth)\b/i,
    ],
  },
  {
    domain: 'media',
    weight: 3,
    patterns: [
      /\b(image|logo|thumbnail|audio|tts|music|video|ffmpeg|generate\s+(an?\s+)?(image|audio|video))\b/i,
    ],
  },
  {
    domain: 'scheduled_task',
    weight: 3,
    patterns: [/\b(schedule|cron|recurring|every\s+day|scheduled\s+task)\b/i],
  },
  {
    domain: 'agent',
    weight: 2,
    patterns: [
      /\b(integration\s+tool|list_integration|invoke_integration|mcp\s+tool|custom\s+tool|load_user_skill|skill)\b/i,
      /\b(function_execute|sandbox\s+code)\b/i,
    ],
  },
  {
    domain: 'superagent',
    weight: 3,
    patterns: [
      /\b(send\s+(an?\s+)?email|draft\s+(an?\s+)?email|check\s+my\s+calendar|google\s+docs?|slack\s+message)\b/i,
      /\b(gmail|outlook|calendar|notion|hubspot)\b/i,
    ],
  },
]

export { MAX_PARALLEL_SUBAGENTS }

export function classifyLocalCopilotIntent(message: string): LocalCopilotIntent {
  const text = message.trim()
  if (!text) return { primary: 'general', secondary: [], useFullCatalog: true }

  const scores = new Map<LocalCopilotCloudSpecialistDomain, number>()
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
  if (ranked.length === 0) return { primary: 'general', secondary: [], useFullCatalog: true }

  const [topDomain, topScore] = ranked[0]
  const secondaries = ranked
    .slice(1)
    .filter(([, score]) => score >= Math.max(2, topScore * 0.5))
    .map(([domain]) => domain)

  if (topScore < 2 && secondaries.length === 0) {
    return { primary: 'general', secondary: [], useFullCatalog: true }
  }
  if (secondaries.length >= 3) {
    return { primary: 'general', secondary: [], useFullCatalog: true }
  }

  return { primary: topDomain, secondary: secondaries, useFullCatalog: false }
}

export function shouldRunSpecialistPass(intent: LocalCopilotIntent): boolean {
  if (intent.useFullCatalog) return false
  if (intent.secondary.includes('research') || intent.secondary.includes('auth')) return true
  if (
    intent.primary === 'research' &&
    intent.secondary.some((d) => d === 'workflow' || d === 'run' || d === 'deploy')
  ) {
    return true
  }
  if (
    intent.primary === 'auth' &&
    intent.secondary.some((d) => d === 'workflow' || d === 'run' || d === 'deploy')
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

export const PARALLEL_SUBAGENT_PRIORITY: LocalCopilotCloudSpecialistDomain[] = [
  'research',
  'workflow',
  'deploy',
  'run',
  'auth',
  'knowledge',
  'table',
  'file',
  'agent',
  'superagent',
  'media',
  'scheduled_task',
]

export function selectParallelSubagentDomains(
  intent: LocalCopilotIntent
): LocalCopilotCloudSpecialistDomain[] {
  if (intent.useFullCatalog) return []

  const candidates = new Set<LocalCopilotCloudSpecialistDomain>()
  if (intent.primary !== 'general') candidates.add(intent.primary)
  for (const domain of intent.secondary) {
    if (domain !== 'general') candidates.add(domain)
  }
  if (candidates.size < 2) return []

  return PARALLEL_SUBAGENT_PRIORITY.filter((domain) => candidates.has(domain)).slice(
    0,
    MAX_PARALLEL_SUBAGENTS
  )
}
