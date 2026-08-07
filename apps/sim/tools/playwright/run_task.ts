import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { sleep } from '@sim/utils/helpers'
import type { Browser, Page } from 'playwright'
import type {
  PlaywrightAgentStep,
  PlaywrightRunTaskParams,
  PlaywrightRunTaskResponse,
} from '@/tools/playwright/types'
import type { ToolConfig, ToolResponse } from '@/tools/types'

const logger = createLogger('PlaywrightTool')

/** Maximum wall-clock time for a single Playwright agent run (1 hour). */
const MAX_TIMEOUT_MS = 60 * 60 * 1000
const DEFAULT_MAX_STEPS = 50
const MAX_OBSERVATION_CHARS = 10_000

type AgentAction =
  | { action: 'goto'; url: string }
  | { action: 'click'; ref: number }
  | { action: 'type'; ref: number; text: string }
  | { action: 'press'; key: string }
  | { action: 'wait'; ms?: number }
  | { action: 'done'; output: unknown }

function emptyOutput(url: string | null = null): PlaywrightRunTaskResponse['output'] {
  return {
    success: false,
    output: null,
    url,
    steps: [],
  }
}

function normalizeSecrets(variables: PlaywrightRunTaskParams['variables']): Record<string, string> {
  const secrets: Record<string, string> = {}
  if (!variables) return secrets

  if (Array.isArray(variables)) {
    for (const row of variables as Array<Record<string, unknown>>) {
      const cells = row?.cells as Record<string, unknown> | undefined
      if (cells?.Key && cells.Value !== undefined) {
        secrets[String(cells.Key)] = String(cells.Value)
      } else if (row?.Key !== undefined && row.Value !== undefined) {
        secrets[String(row.Key)] = String(row.Value)
      }
    }
  } else if (typeof variables === 'object') {
    for (const [k, v] of Object.entries(variables)) {
      if (typeof v === 'string') secrets[k] = v
    }
  }
  return secrets
}

function substituteSecrets(text: string, secrets: Record<string, string>): string {
  let result = text
  for (const [key, value] of Object.entries(secrets)) {
    result = result.split(`{{${key}}}`).join(value)
    result = result.split(`%${key}%`).join(value)
  }
  return result
}

function parseAllowedDomains(input?: string | string[]): string[] | undefined {
  if (!input) return undefined
  const arr = Array.isArray(input)
    ? input
    : input
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
  return arr.length > 0 ? arr : undefined
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function isDomainAllowed(url: string, allowedDomains?: string[]): boolean {
  if (!allowedDomains || allowedDomains.length === 0) return true
  const host = hostnameOf(url)
  if (!host) return false
  return allowedDomains.some((domain) => {
    const d = domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
    return host === d || host.endsWith(`.${d}`)
  })
}

function isAnthropicModel(model: string): boolean {
  return model.toLowerCase().startsWith('claude')
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model response did not contain a JSON object')
  }
  return JSON.parse(candidate.slice(start, end + 1))
}

function parseAction(raw: unknown): AgentAction {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid action payload')
  }
  const obj = raw as Record<string, unknown>
  const action = obj.action
  if (action === 'goto' && typeof obj.url === 'string') {
    return { action: 'goto', url: obj.url }
  }
  if (action === 'click' && typeof obj.ref === 'number') {
    return { action: 'click', ref: obj.ref }
  }
  if (action === 'type' && typeof obj.ref === 'number' && typeof obj.text === 'string') {
    return { action: 'type', ref: obj.ref, text: obj.text }
  }
  if (action === 'press' && typeof obj.key === 'string') {
    return { action: 'press', key: obj.key }
  }
  if (action === 'wait') {
    return { action: 'wait', ms: typeof obj.ms === 'number' ? obj.ms : 1000 }
  }
  if (action === 'done') {
    return { action: 'done', output: obj.output ?? null }
  }
  throw new Error(`Unsupported or incomplete action: ${JSON.stringify(obj)}`)
}

async function callOpenAI(
  model: string,
  apiKey: string,
  system: string,
  user: string
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI API returned an empty response')
  }
  return content
}

async function callAnthropic(
  model: string,
  apiKey: string,
  system: string,
  user: string
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }
  const text = data.content?.find((c) => c.type === 'text')?.text
  if (!text) {
    throw new Error('Anthropic API returned an empty response')
  }
  return text
}

async function callModel(
  model: string,
  apiKey: string,
  system: string,
  user: string
): Promise<string> {
  if (isAnthropicModel(model)) {
    return callAnthropic(model, apiKey, system, user)
  }
  return callOpenAI(model, apiKey, system, user)
}

async function tagInteractiveElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    document.querySelectorAll('[data-sim-ref]').forEach((el) => {
      el.removeAttribute('data-sim-ref')
    })

    const els = Array.from(
      document.querySelectorAll(
        'a, button, input, textarea, select, [role="button"], [contenteditable="true"]'
      )
    )
    const labels: string[] = []
    let index = 0
    for (const el of els) {
      if (index >= 100) break
      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue

      el.setAttribute('data-sim-ref', String(index))
      const tag = el.tagName.toLowerCase()
      const type = el.getAttribute('type') || ''
      const name = el.getAttribute('name') || ''
      const placeholder = el.getAttribute('placeholder') || ''
      const aria = el.getAttribute('aria-label') || ''
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80)
      labels.push(
        `[${index}] <${tag}${type ? ` type="${type}"` : ''}${name ? ` name="${name}"` : ''}${
          placeholder ? ` placeholder="${placeholder}"` : ''
        }${aria ? ` aria-label="${aria}"` : ''}>${text ? ` ${text}` : ''}`
      )
      index += 1
    }
    return labels
  })
}

async function observePage(page: Page): Promise<string> {
  const url = page.url()
  const title = await page.title().catch(() => '')
  const labels = await tagInteractiveElements(page)
  let bodyText = ''
  try {
    bodyText = await page.locator('body').innerText({ timeout: 5000 })
  } catch {
    bodyText = ''
  }
  if (bodyText.length > MAX_OBSERVATION_CHARS) {
    bodyText = `${bodyText.slice(0, MAX_OBSERVATION_CHARS)}\n...[truncated]`
  }

  return [
    `URL: ${url}`,
    `Title: ${title}`,
    'Interactive elements (use ref numbers with click/type):',
    labels.length > 0 ? labels.join('\n') : '(none found)',
    '',
    'Visible text:',
    bodyText || '(empty)',
  ].join('\n')
}

function buildSystemPrompt(structuredOutput?: string): string {
  const schemaHint = structuredOutput?.trim()
    ? `\nWhen finishing, set output to JSON matching this schema:\n${structuredOutput.trim()}\n`
    : '\nWhen finishing, set output to a concise answer (string or JSON object).\n'

  return `You are a browser automation agent controlling a real Chromium browser via Playwright.
You must respond with a SINGLE JSON object only (no markdown, no explanation) using one of:

{"action":"goto","url":"https://example.com"}
{"action":"click","ref":0}
{"action":"type","ref":1,"text":"hello"}
{"action":"press","key":"Enter"}
{"action":"wait","ms":1000}
{"action":"done","output":...}

Rules:
- Prefer refs from the observation list for click/type.
- Use goto only when you need a new URL.
- Use wait sparingly for slow pages.
- Complete the user task, then use done.
- Do not invent refs that are not listed.
${schemaHint}`
}

async function assertAllowed(url: string, allowedDomains?: string[]): Promise<void> {
  if (!isDomainAllowed(url, allowedDomains)) {
    throw new Error(`Navigation blocked: ${url} is outside allowed domains`)
  }
}

/**
 * Runs a free-form browser task on local Chromium using an LLM action loop.
 */
export const runTaskTool: ToolConfig<PlaywrightRunTaskParams, PlaywrightRunTaskResponse> = {
  id: 'playwright_run_task',
  name: 'Playwright Browser Agent',
  description: 'Runs a browser automation task with local Chromium via Playwright',
  version: '1.0.0',

  params: {
    task: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'What the browser agent should do',
    },
    startUrl: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional starting URL',
    },
    model: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'LLM model id selected in the block',
    },
    apiKey: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'API key for the selected model provider',
    },
    variables: {
      type: 'json',
      required: false,
      visibility: 'user-only',
      description: 'Secrets injected into the task via {{key}} or %key%',
    },
    allowedDomains: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Comma-separated list of allowed domains',
    },
    maxSteps: {
      type: 'number',
      required: false,
      visibility: 'user-only',
      description: 'Maximum agent steps (default 50)',
    },
    structuredOutput: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Optional JSON schema guidance for the final output',
    },
  },

  request: {
    url: '/api/tools/playwright/run-task',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
  },

  directExecution: async (params: PlaywrightRunTaskParams): Promise<ToolResponse> => {
    const task = params.task?.trim()
    const apiKey = params.apiKey?.trim()
    const model = params.model?.trim()

    if (!task) {
      return { success: false, output: emptyOutput(), error: 'Task is required' }
    }
    if (!apiKey) {
      return { success: false, output: emptyOutput(), error: 'API key is required' }
    }
    if (!model) {
      return { success: false, output: emptyOutput(), error: 'Model is required' }
    }

    const secrets = normalizeSecrets(params.variables)
    const resolvedTask = substituteSecrets(task, secrets)
    const allowedDomains = parseAllowedDomains(params.allowedDomains)
    const maxSteps =
      typeof params.maxSteps === 'number' && params.maxSteps > 0
        ? Math.floor(params.maxSteps)
        : DEFAULT_MAX_STEPS

    const steps: PlaywrightAgentStep[] = []
    const startedAt = Date.now()
    let browser: Browser | null = null
    let lastUrl: string | null = null

    try {
      const { chromium } = await import('playwright')
      browser = await chromium.launch({ headless: true })
      const context = await browser.newContext()
      const page = await context.newPage()

      let startUrl = params.startUrl?.trim()
      if (startUrl) {
        if (!/^https?:\/\//i.test(startUrl)) {
          startUrl = `https://${startUrl}`
        }
        await assertAllowed(startUrl, allowedDomains)
        await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        lastUrl = page.url()
        steps.push({
          number: steps.length + 1,
          action: 'goto',
          detail: startUrl,
          url: lastUrl,
        })
      }

      const systemPrompt = buildSystemPrompt(params.structuredOutput)
      let finalOutput: unknown = null
      let completed = false

      for (let i = 0; i < maxSteps; i++) {
        if (Date.now() - startedAt > MAX_TIMEOUT_MS) {
          return {
            success: false,
            output: {
              success: false,
              output: finalOutput,
              url: lastUrl ?? page.url(),
              steps,
            },
            error: 'Playwright agent timed out after 1 hour',
          }
        }

        lastUrl = page.url()
        if (!isDomainAllowed(lastUrl, allowedDomains) && lastUrl !== 'about:blank') {
          return {
            success: false,
            output: { success: false, output: null, url: lastUrl, steps },
            error: `Current page is outside allowed domains: ${lastUrl}`,
          }
        }

        const observation = await observePage(page)
        const userPrompt = [
          `Task:\n${resolvedTask}`,
          '',
          `Step ${i + 1} of ${maxSteps}`,
          '',
          'Current page observation:',
          observation,
          '',
          'Return the next action JSON.',
        ].join('\n')

        const modelText = await callModel(model, apiKey, systemPrompt, userPrompt)
        const action = parseAction(extractJsonObject(modelText))

        if (action.action === 'done') {
          finalOutput = action.output
          completed = true
          steps.push({
            number: steps.length + 1,
            action: 'done',
            detail:
              typeof action.output === 'string' ? action.output : JSON.stringify(action.output),
            url: page.url(),
          })
          break
        }

        try {
          if (action.action === 'goto') {
            const url = /^https?:\/\//i.test(action.url) ? action.url : `https://${action.url}`
            await assertAllowed(url, allowedDomains)
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
            steps.push({
              number: steps.length + 1,
              action: 'goto',
              detail: url,
              url: page.url(),
            })
          } else if (action.action === 'click') {
            await page.locator(`[data-sim-ref="${action.ref}"]`).click({ timeout: 15_000 })
            steps.push({
              number: steps.length + 1,
              action: 'click',
              detail: `ref=${action.ref}`,
              url: page.url(),
            })
          } else if (action.action === 'type') {
            const locator = page.locator(`[data-sim-ref="${action.ref}"]`)
            await locator.click({ timeout: 15_000 })
            await locator.fill(action.text, { timeout: 15_000 })
            steps.push({
              number: steps.length + 1,
              action: 'type',
              detail: `ref=${action.ref}`,
              url: page.url(),
            })
          } else if (action.action === 'press') {
            await page.keyboard.press(action.key)
            steps.push({
              number: steps.length + 1,
              action: 'press',
              detail: action.key,
              url: page.url(),
            })
          } else if (action.action === 'wait') {
            const ms = Math.min(Math.max(action.ms ?? 1000, 0), 30_000)
            await sleep(ms)
            steps.push({
              number: steps.length + 1,
              action: 'wait',
              detail: `${ms}ms`,
              url: page.url(),
            })
          }
          lastUrl = page.url()
        } catch (error: unknown) {
          const message = getErrorMessage(error, 'Action failed')
          steps.push({
            number: steps.length + 1,
            action: action.action,
            detail: JSON.stringify(action),
            url: page.url(),
            error: message,
          })
          logger.warn('Playwright action failed', { action, error: message })
        }
      }

      lastUrl = page.url()

      if (!completed) {
        return {
          success: false,
          output: {
            success: false,
            output: finalOutput,
            url: lastUrl,
            steps,
          },
          error: `Agent did not finish within ${maxSteps} steps`,
        }
      }

      return {
        success: true,
        output: {
          success: true,
          output: finalOutput,
          url: lastUrl,
          steps,
        },
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Playwright agent failed')
      logger.error('Playwright agent error', { error: message })
      return {
        success: false,
        output: {
          success: false,
          output: null,
          url: lastUrl,
          steps,
        },
        error: message,
      }
    } finally {
      if (browser) {
        await browser.close().catch((error: unknown) => {
          logger.warn('Failed to close Playwright browser', {
            error: getErrorMessage(error),
          })
        })
      }
    }
  },

  outputs: {
    success: { type: 'boolean', description: 'Whether the agent completed successfully' },
    output: { type: 'json', description: 'Final agent output (string or structured JSON)' },
    url: { type: 'string', description: 'Final page URL' },
    steps: {
      type: 'array',
      description: 'Actions the agent executed',
      items: {
        type: 'object',
        properties: {
          number: { type: 'number', description: 'Step number' },
          action: { type: 'string', description: 'Action name' },
          detail: { type: 'string', description: 'Action detail', optional: true },
          url: { type: 'string', description: 'URL after the action' },
          error: { type: 'string', description: 'Error if the action failed', optional: true },
        },
      },
    },
  },
}
