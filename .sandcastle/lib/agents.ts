import type { AgentProvider } from '@ai-hero/sandcastle'
import { claudeCode, codex } from '@ai-hero/sandcastle'

/**
 * Agent mode for the upstream-sync harness.
 * - `dual` (default): Claude Opus parent + Codex GPT Luna children
 * - `anthropic`: Claude for both parent and children
 * - `openai`: Codex for both parent and children
 */
export type UpstreamSyncAgentMode = 'dual' | 'anthropic' | 'openai'

/** @deprecated Use UpstreamSyncAgentMode — kept for callers that still say "provider". */
export type UpstreamSyncAgentProvider = UpstreamSyncAgentMode

export interface AgentBundle {
  parent: AgentProvider
  child: AgentProvider
  /** Resolved mode (`dual` | `anthropic` | `openai`). */
  provider: UpstreamSyncAgentMode
  parentModel: string
  childModel: string
}

/**
 * Env injected into Claude Code child agents to stop Task/background fan-out.
 * Harness owns cluster parallelism — internal subagents caused $40+ mega-sessions.
 */
export const CHILD_CLAUDE_COST_ENV = {
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
  CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS: '1',
} as const

export const DEFAULT_PARENT_MODEL = 'claude-opus-5'
export const DEFAULT_ANTHROPIC_CHILD_MODEL = 'claude-sonnet-5'
export const DEFAULT_OPENAI_CHILD_MODEL = 'gpt-5.6-luna'
export const DEFAULT_OPENAI_PARENT_MODEL = 'gpt-5.6-luna'

/** Codex effort including GPT-5.6 `max` (Sandcastle's CodexOptions type still stops at xhigh). */
type CodexEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

function resolveMode(): UpstreamSyncAgentMode {
  const raw = (process.env.UPSTREAM_SYNC_AGENT ?? 'dual').trim().toLowerCase()
  if (raw === 'openai' || raw === 'anthropic' || raw === 'dual') return raw
  return 'dual'
}

export function resolveParentModel(mode: UpstreamSyncAgentMode = resolveMode()): string {
  if (mode === 'openai') {
    return process.env.UPSTREAM_SYNC_OPENAI_MODEL ?? DEFAULT_OPENAI_PARENT_MODEL
  }
  return process.env.UPSTREAM_SYNC_ANTHROPIC_PARENT_MODEL ?? DEFAULT_PARENT_MODEL
}

export function resolveChildModel(mode: UpstreamSyncAgentMode = resolveMode()): string {
  if (mode === 'anthropic') {
    return process.env.UPSTREAM_SYNC_ANTHROPIC_CHILD_MODEL ?? DEFAULT_ANTHROPIC_CHILD_MODEL
  }
  // dual + openai children use Codex Luna by default
  return (
    process.env.UPSTREAM_SYNC_OPENAI_CHILD_MODEL ??
    process.env.UPSTREAM_SYNC_OPENAI_MODEL ??
    DEFAULT_OPENAI_CHILD_MODEL
  )
}

function hasAnthropicCreds(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY?.trim() || process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim()
  )
}

function hasOpenAiCreds(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

function createOpusParent(model: string): AgentProvider {
  return claudeCode(model, {
    permissionMode: 'bypassPermissions',
    effort: 'high',
  })
}

function createClaudeChild(model: string): AgentProvider {
  return claudeCode(model, {
    permissionMode: 'bypassPermissions',
    effort: 'medium',
    env: { ...CHILD_CLAUDE_COST_ENV },
  })
}

function createCodexAgent(model: string, effort: CodexEffort): AgentProvider {
  // double-cast-allowed: Sandcastle CodexOptions lag GPT-5.6 `max` effort
  return codex(model, { effort } as { effort: 'xhigh' })
}

/**
 * Resolve parent (orchestrator) and child (cluster) agents from env.
 * Default `dual`: Opus 5 high parent + GPT-5.6 Luna max children.
 */
export function assertAgentCredentials(): void {
  const skip = process.env.UPSTREAM_SYNC_SKIP_AGENT === 'true'
  if (skip) return

  const mode = resolveMode()

  if (mode === 'openai') {
    if (!hasOpenAiCreds()) {
      throw new Error(
        'OPENAI_API_KEY is required for agent runs. Add it under Settings → Secrets → Actions on the fork repo.'
      )
    }
    return
  }

  if (mode === 'anthropic') {
    if (!hasAnthropicCreds()) {
      throw new Error(
        'ANTHROPIC_API_KEY (or CLAUDE_CODE_OAUTH_TOKEN) is required for agent runs. Add ANTHROPIC_API_KEY under Settings → Secrets → Actions on the fork repo.'
      )
    }
    return
  }

  // dual
  const missing: string[] = []
  if (!hasAnthropicCreds()) missing.push('ANTHROPIC_API_KEY (or CLAUDE_CODE_OAUTH_TOKEN)')
  if (!hasOpenAiCreds()) missing.push('OPENAI_API_KEY')
  if (missing.length > 0) {
    throw new Error(
      `Dual agent mode requires both Anthropic (Opus parent) and OpenAI (Luna children). Missing: ${missing.join(', ')}. Add under Settings → Secrets → Actions.`
    )
  }
}

export function resolveAgents(): AgentBundle {
  const provider = resolveMode()
  const parentModel = resolveParentModel(provider)
  const childModel = resolveChildModel(provider)

  if (provider === 'openai') {
    const agent = createCodexAgent(childModel, 'max')
    return { parent: agent, child: agent, provider, parentModel, childModel }
  }

  if (provider === 'anthropic') {
    return {
      parent: createOpusParent(parentModel),
      child: createClaudeChild(childModel),
      provider,
      parentModel,
      childModel,
    }
  }

  // dual: Opus parent + Luna children
  return {
    parent: createOpusParent(parentModel),
    child: createCodexAgent(childModel, 'max'),
    provider,
    parentModel,
    childModel,
  }
}
