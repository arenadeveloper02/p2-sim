/**
 * Run with: bun test .sandcastle/lib/agents.test.ts
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  assertAgentCredentials,
  CHILD_CLAUDE_COST_ENV,
  CODEX_CI_ENV,
  DEFAULT_CAPACITY_RETRY_ATTEMPTS,
  DEFAULT_CAPACITY_RETRY_BASE_MS,
  DEFAULT_CAPACITY_RETRY_MAX_MS,
  DEFAULT_CHILD_IDLE_TIMEOUT_SECONDS,
  DEFAULT_OPENAI_CHILD_MODEL,
  DEFAULT_PARENT_IDLE_TIMEOUT_SECONDS,
  DEFAULT_PARENT_MODEL,
  ensureCodexApiKeyAuth,
  ensureNonInteractivePagers,
  isTransientModelCapacityError,
  resolveAgentIdleTimeoutSeconds,
  resolveAgents,
  resolveCapacityRetryConfig,
  resolveChildModel,
  resolveParentModel,
} from './agents'

describe('resolveAgents', () => {
  let codexHome: string | undefined

  afterEach(() => {
    process.env.UPSTREAM_SYNC_AGENT = undefined
    process.env.UPSTREAM_SYNC_ANTHROPIC_PARENT_MODEL = undefined
    process.env.UPSTREAM_SYNC_ANTHROPIC_CHILD_MODEL = undefined
    process.env.UPSTREAM_SYNC_OPENAI_MODEL = undefined
    process.env.UPSTREAM_SYNC_OPENAI_CHILD_MODEL = undefined
    process.env.OPENAI_API_KEY = undefined
    process.env.ANTHROPIC_API_KEY = undefined
    process.env.CLAUDE_CODE_OAUTH_TOKEN = undefined
    process.env.UPSTREAM_SYNC_SKIP_AGENT = undefined
    process.env.CODEX_HOME = undefined
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

  test('Codex children disable interactive pagers', () => {
    const bundle = resolveAgents()
    const childEnv = (bundle.child as { env?: Record<string, string> }).env
    expect(childEnv?.PAGER).toBe(CODEX_CI_ENV.PAGER)
    expect(childEnv?.GIT_PAGER).toBe(CODEX_CI_ENV.GIT_PAGER)
    expect(childEnv?.GH_PAGER).toBe(CODEX_CI_ENV.GH_PAGER)
    expect(childEnv?.CI).toBe(CODEX_CI_ENV.CI)
    expect(childEnv?.GIT_TERMINAL_PROMPT).toBe(CODEX_CI_ENV.GIT_TERMINAL_PROMPT)
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

describe('isTransientModelCapacityError', () => {
  test('matches Codex capacity messages', () => {
    expect(
      isTransientModelCapacityError(
        new Error(
          'AgentError: codex exited with code 1:\nSelected model is at capacity. Please try a different model.'
        )
      )
    ).toBe(true)
    expect(
      isTransientModelCapacityError(new Error('No available serving slot for the selected model'))
    ).toBe(true)
  })

  test('matches nested cause', () => {
    const cause = new Error('Selected model is at capacity. Please try a different model.')
    expect(isTransientModelCapacityError(new Error('Agent invocation failed', { cause }))).toBe(
      true
    )
  })

  test('rejects token/auth/quota style failures', () => {
    expect(isTransientModelCapacityError(new Error('context length exceeded'))).toBe(false)
    expect(isTransientModelCapacityError(new Error('401 Missing bearer'))).toBe(false)
    expect(isTransientModelCapacityError(new Error('insufficient_quota'))).toBe(false)
    expect(isTransientModelCapacityError(new Error('merge conflict unresolved'))).toBe(false)
  })
})

describe('resolveAgentIdleTimeoutSeconds', () => {
  afterEach(() => {
    process.env.UPSTREAM_SYNC_IDLE_TIMEOUT_SECONDS = undefined
    process.env.UPSTREAM_SYNC_CHILD_IDLE_TIMEOUT_SECONDS = undefined
  })

  test('defaults child to 30 minutes and parent to 1 hour', () => {
    expect(resolveAgentIdleTimeoutSeconds('child', {})).toBe(DEFAULT_CHILD_IDLE_TIMEOUT_SECONDS)
    expect(resolveAgentIdleTimeoutSeconds('parent', {})).toBe(DEFAULT_PARENT_IDLE_TIMEOUT_SECONDS)
    expect(DEFAULT_CHILD_IDLE_TIMEOUT_SECONDS).toBe(1800)
    expect(DEFAULT_PARENT_IDLE_TIMEOUT_SECONDS).toBe(3600)
  })

  test('honors env overrides', () => {
    expect(
      resolveAgentIdleTimeoutSeconds('child', { UPSTREAM_SYNC_CHILD_IDLE_TIMEOUT_SECONDS: '120' })
    ).toBe(120)
    expect(
      resolveAgentIdleTimeoutSeconds('parent', { UPSTREAM_SYNC_IDLE_TIMEOUT_SECONDS: '900' })
    ).toBe(900)
  })
})

describe('ensureNonInteractivePagers', () => {
  test('forces pager env and shadows less with cat', () => {
    const previousPath = process.env.PATH
    const previousPager = process.env.PAGER
    try {
      const binDir = ensureNonInteractivePagers()
      expect(process.env.PAGER).toBe('cat')
      expect(process.env.GIT_PAGER).toBe('cat')
      expect(process.env.GH_PAGER).toBe('cat')
      expect(process.env.PATH?.startsWith(`${binDir}:`)).toBe(true)
      const result = Bun.spawnSync([join(binDir, 'less')], {
        stdin: new TextEncoder().encode('pager-body\n'),
        stdout: 'pipe',
        stderr: 'pipe',
      })
      expect(result.exitCode).toBe(0)
      expect(new TextDecoder().decode(result.stdout)).toBe('pager-body\n')
    } finally {
      process.env.PATH = previousPath
      process.env.PAGER = previousPager
    }
  })
})

describe('resolveCapacityRetryConfig', () => {
  afterEach(() => {
    process.env.UPSTREAM_SYNC_CAPACITY_RETRIES = undefined
    process.env.UPSTREAM_SYNC_CAPACITY_RETRY_BASE_MS = undefined
    process.env.UPSTREAM_SYNC_CAPACITY_RETRY_MAX_MS = undefined
  })

  test('defaults to multi-minute serving-slot backoff', () => {
    expect(resolveCapacityRetryConfig({})).toEqual({
      maxAttempts: DEFAULT_CAPACITY_RETRY_ATTEMPTS,
      baseMs: DEFAULT_CAPACITY_RETRY_BASE_MS,
      maxMs: DEFAULT_CAPACITY_RETRY_MAX_MS,
    })
  })

  test('honors env overrides and clamps maxMs to baseMs', () => {
    expect(
      resolveCapacityRetryConfig({
        UPSTREAM_SYNC_CAPACITY_RETRIES: '6',
        UPSTREAM_SYNC_CAPACITY_RETRY_BASE_MS: '45000',
        UPSTREAM_SYNC_CAPACITY_RETRY_MAX_MS: '10000',
      })
    ).toEqual({ maxAttempts: 6, baseMs: 45_000, maxMs: 45_000 })
  })

  test('falls back on invalid values', () => {
    expect(
      resolveCapacityRetryConfig({
        UPSTREAM_SYNC_CAPACITY_RETRIES: '0',
        UPSTREAM_SYNC_CAPACITY_RETRY_BASE_MS: 'nope',
      })
    ).toEqual({
      maxAttempts: DEFAULT_CAPACITY_RETRY_ATTEMPTS,
      baseMs: DEFAULT_CAPACITY_RETRY_BASE_MS,
      maxMs: DEFAULT_CAPACITY_RETRY_MAX_MS,
    })
  })
})
