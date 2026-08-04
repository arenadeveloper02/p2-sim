/**
 * Run with: bun test .sandcastle/lib/agents.test.ts
 */
import { afterEach, describe, expect, test } from 'bun:test'
import {
  CHILD_CLAUDE_COST_ENV,
  DEFAULT_OPENAI_CHILD_MODEL,
  DEFAULT_PARENT_MODEL,
  assertAgentCredentials,
  resolveAgents,
  resolveChildModel,
  resolveParentModel,
} from './agents'

describe('resolveAgents', () => {
  afterEach(() => {
    delete process.env.UPSTREAM_SYNC_AGENT
    delete process.env.UPSTREAM_SYNC_ANTHROPIC_PARENT_MODEL
    delete process.env.UPSTREAM_SYNC_ANTHROPIC_CHILD_MODEL
    delete process.env.UPSTREAM_SYNC_OPENAI_MODEL
    delete process.env.UPSTREAM_SYNC_OPENAI_CHILD_MODEL
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN
    delete process.env.UPSTREAM_SYNC_SKIP_AGENT
  })

  test('defaults to dual: Opus parent + Luna children', () => {
    const bundle = resolveAgents()
    expect(bundle.provider).toBe('dual')
    expect(bundle.parentModel).toBe(DEFAULT_PARENT_MODEL)
    expect(bundle.childModel).toBe(DEFAULT_OPENAI_CHILD_MODEL)
    expect(resolveParentModel()).toBe('claude-opus-5')
    expect(resolveChildModel()).toBe('gpt-5.6-luna')
  })

  test('child Claude agent disables background Task fan-out via env', () => {
    process.env.UPSTREAM_SYNC_AGENT = 'anthropic'
    const bundle = resolveAgents()
    expect(bundle.provider).toBe('anthropic')
    expect(CHILD_CLAUDE_COST_ENV.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS).toBe('1')
    expect(CHILD_CLAUDE_COST_ENV.CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS).toBe('1')
    // AgentProvider env is on the provider object from sandcastle.
    const childEnv = (bundle.child as { env?: Record<string, string> }).env
    expect(childEnv?.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS).toBe('1')
    expect(childEnv?.CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS).toBe('1')
  })

  test('openai mode uses Codex for both roles', () => {
    process.env.UPSTREAM_SYNC_AGENT = 'openai'
    const bundle = resolveAgents()
    expect(bundle.provider).toBe('openai')
    expect(bundle.parentModel).toBe(DEFAULT_OPENAI_CHILD_MODEL)
    expect(bundle.childModel).toBe(DEFAULT_OPENAI_CHILD_MODEL)
    expect(bundle.parent).toBe(bundle.child)
  })

  test('assertAgentCredentials requires both keys in dual mode', () => {
    process.env.UPSTREAM_SYNC_AGENT = 'dual'
    expect(() => assertAgentCredentials()).toThrow(/Dual agent mode/)
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    expect(() => assertAgentCredentials()).toThrow(/OPENAI_API_KEY/)
    process.env.OPENAI_API_KEY = 'sk-test'
    expect(() => assertAgentCredentials()).not.toThrow()
  })

  test('assertAgentCredentials skips when UPSTREAM_SYNC_SKIP_AGENT', () => {
    process.env.UPSTREAM_SYNC_SKIP_AGENT = 'true'
    expect(() => assertAgentCredentials()).not.toThrow()
  })
})
