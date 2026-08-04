/**
 * Run with: bun test .sandcastle/lib/agents.test.ts
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  CHILD_CLAUDE_COST_ENV,
  DEFAULT_OPENAI_CHILD_MODEL,
  DEFAULT_PARENT_MODEL,
  assertAgentCredentials,
  ensureCodexApiKeyAuth,
  resolveAgents,
  resolveChildModel,
  resolveParentModel,
} from './agents'

describe('resolveAgents', () => {
  let codexHome: string | undefined

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
    delete process.env.CODEX_HOME
    if (codexHome) {
      rmSync(codexHome, { recursive: true, force: true })
      codexHome = undefined
    }
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
    codexHome = mkdtempSync(join(tmpdir(), 'codex-auth-'))
    process.env.CODEX_HOME = codexHome
    expect(() => assertAgentCredentials()).not.toThrow()
    const auth = JSON.parse(readFileSync(join(codexHome, 'auth.json'), 'utf8')) as {
      OPENAI_API_KEY: string
    }
    expect(auth.OPENAI_API_KEY).toBe('sk-test')
  })

  test('assertAgentCredentials skips when UPSTREAM_SYNC_SKIP_AGENT', () => {
    process.env.UPSTREAM_SYNC_SKIP_AGENT = 'true'
    expect(() => assertAgentCredentials()).not.toThrow()
  })

  test('ensureCodexApiKeyAuth writes apikey-mode auth.json for dual/openai', () => {
    codexHome = mkdtempSync(join(tmpdir(), 'codex-auth-'))
    process.env.UPSTREAM_SYNC_AGENT = 'dual'
    process.env.OPENAI_API_KEY = 'sk-proj-test'
    const path = ensureCodexApiKeyAuth({ codexHome })
    expect(path).toBe(join(codexHome, 'auth.json'))
    const auth = JSON.parse(readFileSync(path!, 'utf8')) as { OPENAI_API_KEY: string }
    expect(auth.OPENAI_API_KEY).toBe('sk-proj-test')
  })

  test('ensureCodexApiKeyAuth is a no-op in anthropic mode', () => {
    process.env.UPSTREAM_SYNC_AGENT = 'anthropic'
    process.env.OPENAI_API_KEY = 'sk-proj-test'
    expect(ensureCodexApiKeyAuth({ codexHome: '/tmp/unused-codex-home' })).toBeNull()
  })
})
