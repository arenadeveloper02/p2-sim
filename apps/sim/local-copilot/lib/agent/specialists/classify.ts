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
      // Real-world / current-facts questions that should trigger live web search.
      /\b(who\s+(is|are|was|were|won)|what\s+(are|was|were)|when\s+(is|was|did|does)|where\s+(is|are|was)|how\s+(much|many|old|long))\b/i,
      /\b(current|today|tonight|right\s+now|as\s+of|this\s+(week|month|year)|stock\s+price|weather|election|ceo|prime\s+minister|president|governor|chief\s+minister|\bcm\b)\b/i,
      /\b(remember|prefer|preference|always\s+use|don'?t\s+forget|forget\s+that)\b/i,
    ],
  },
  {
    domain: 'workflow',
    weight: 2,
    patterns: [
      /\b(workflows?|automate|automation|pipeline)\b/i,
      /\b(build|create|edit|add|wire|connect)\s+(an?\s+)?(workflow|automation|pipeline)\b/i,
      /\b(add|edit|wire|connect|delete)\s+(a\s+)?blocks?\b/i,
      /\b(modify|update|change|fix)\s+(the\s+)?(workflow|block)/i,
    ],
  },
  {
    domain: 'file',
    weight: 3,
    patterns: [
      /\b(file|folder|vfs|markdown|html|htm|csv|docx?|pptx?|pdf|slides?|deck|presentation|powerpoint|read\s+file|write\s+file|glob|grep)\b/i,
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
  // Weak / ambiguous intents stay on ALWAYS_ON ∪ specialists (not the full ~86-tool catalog).
  if (ranked.length === 0) return { primary: 'general', secondary: [], useFullCatalog: false }

  const [topDomain, topScore] = ranked[0]
  const secondaries = ranked
    .slice(1)
    .filter(([, score]) => score >= Math.max(2, topScore * 0.5))
    .map(([domain]) => domain)

  if (topScore < 2 && secondaries.length === 0) {
    return { primary: 'general', secondary: [], useFullCatalog: false }
  }
  if (secondaries.length >= 3) {
    return { primary: 'general', secondary: [], useFullCatalog: false }
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

/**
 * Workflow inspect/edit, deploy, and run must stay sequential — run depends on
 * the current graph. Auto-fanning them at turn start always showed
 * "Running 2 specialists in parallel (workflow, run)…" on ordinary workflow asks.
 */
const SEQUENTIAL_WORKFLOW_DOMAINS = new Set<LocalCopilotCloudSpecialistDomain>([
  'workflow',
  'deploy',
  'run',
])

function collapseSequentialWorkflowDomains(
  domains: LocalCopilotCloudSpecialistDomain[],
  primary: LocalCopilotIntent['primary']
): LocalCopilotCloudSpecialistDomain[] {
  const family = domains.filter((domain) => SEQUENTIAL_WORKFLOW_DOMAINS.has(domain))
  if (family.length <= 1) return domains
  const keep =
    primary === 'workflow' || primary === 'deploy' || primary === 'run'
      ? primary
      : (PARALLEL_SUBAGENT_PRIORITY.find((domain) => family.includes(domain)) ?? family[0])
  return domains.filter((domain) => !SEQUENTIAL_WORKFLOW_DOMAINS.has(domain) || domain === keep)
}

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

  const selected = collapseSequentialWorkflowDomains(
    PARALLEL_SUBAGENT_PRIORITY.filter((domain) => candidates.has(domain)),
    intent.primary
  )
  if (selected.length < 2) return []

  return selected.slice(0, MAX_PARALLEL_SUBAGENTS)
}

/**
 * Scopes an auto-fan-out specialist to its domain so a shared user prompt
 * cannot make every specialist recreate the whole request (e.g. 2 workflows
 * and 2 files from "create a markdown file").
 */
export function buildAutoFanoutSpecialistUserMessage(
  domain: LocalCopilotCloudSpecialistDomain,
  userMessage: string
): string {
  const scope =
    domain === 'file'
      ? 'Handle ONLY file/document work. Do not create or edit workflows. Do not call create_workflow.'
      : domain === 'workflow'
        ? 'Handle ONLY workflow work. Do not create workspace files. Do not call create_file.'
        : `Handle ONLY the ${domain} parts of this request. Do not create resources for other domains.`
  return `${scope}\n\nUser request:\n${userMessage.trim()}`
}
