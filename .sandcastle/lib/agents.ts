import type { AgentProvider } from '@ai-hero/sandcastle'
import { claudeCode, codex } from '@ai-hero/sandcastle'

export type UpstreamSyncAgentProvider = 'anthropic' | 'openai'

export interface AgentBundle {
  parent: AgentProvider
  child: AgentProvider
  provider: UpstreamSyncAgentProvider
}

/**
 * Resolve parent (orchestrator) and child (cluster) agents from env.
 * Defaults: Anthropic Opus parent, Sonnet children. Set UPSTREAM_SYNC_AGENT=openai for GPT via Codex.
 */
export function resolveAgents(): AgentBundle {
  const provider = (process.env.UPSTREAM_SYNC_AGENT ?? 'anthropic') as UpstreamSyncAgentProvider

  if (provider === 'openai') {
    const model = process.env.UPSTREAM_SYNC_OPENAI_MODEL ?? 'gpt-5.5'
    const agent = codex(model)
    return { parent: agent, child: agent, provider }
  }

  return {
    parent: claudeCode(process.env.UPSTREAM_SYNC_ANTHROPIC_PARENT_MODEL ?? 'claude-opus-4-8'),
    child: claudeCode(process.env.UPSTREAM_SYNC_ANTHROPIC_CHILD_MODEL ?? 'claude-sonnet-4-6'),
    provider: 'anthropic',
  }
}
