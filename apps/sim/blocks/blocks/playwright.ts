import { PlaywrightIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { IntegrationType } from '@/blocks/types'
import type { PlaywrightStep } from '@/lib/playwright/types'
import type { PlaywrightRunResponse } from '@/tools/playwright/types'

const PLAYWRIGHT_OPERATIONS = [
  { label: 'Run Steps', id: 'run_steps' },
  { label: 'Navigate', id: 'navigate' },
  { label: 'Snapshot', id: 'snapshot' },
  { label: 'Click', id: 'click' },
  { label: 'Type', id: 'type' },
  { label: 'Take Screenshot', id: 'screenshot' },
  { label: 'Wait', id: 'wait' },
  { label: 'Press Key', id: 'press' },
] as const

type PlaywrightBlockOperation = (typeof PLAYWRIGHT_OPERATIONS)[number]['id']

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

function buildSingleStep(
  operation: Exclude<PlaywrightBlockOperation, 'run_steps'>,
  params: Record<string, unknown>
): PlaywrightStep {
  switch (operation) {
    case 'navigate':
      return { type: 'navigate', url: String(params.url ?? '') }
    case 'snapshot':
      return { type: 'snapshot' }
    case 'click':
      return {
        type: 'click',
        ref: params.ref ? String(params.ref) : undefined,
        selector: params.selector ? String(params.selector) : undefined,
      }
    case 'type':
      return {
        type: 'type',
        ref: params.ref ? String(params.ref) : undefined,
        selector: params.selector ? String(params.selector) : undefined,
        text: String(params.text ?? ''),
        submit: params.submit === 'true' || params.submit === true,
      }
    case 'screenshot':
      return {
        type: 'screenshot',
        fullPage: params.fullPage === 'true' || params.fullPage === true,
      }
    case 'wait':
      return {
        type: 'wait',
        text: params.waitText ? String(params.waitText) : undefined,
        timeMs: params.waitTime ? Number(params.waitTime) : undefined,
      }
    case 'press':
      return { type: 'press', key: String(params.key ?? '') }
    default:
      return { type: 'snapshot' }
  }
}

function buildSteps(params: Record<string, unknown>): PlaywrightStep[] {
  const operation = params.operation as PlaywrightBlockOperation

  if (operation === 'run_steps') {
    const parsed = parseJsonValue(params.steps)
    if (Array.isArray(parsed)) {
      return parsed as PlaywrightStep[]
    }
    if (Array.isArray(params.steps)) {
      return params.steps as PlaywrightStep[]
    }
    return []
  }

  return [buildSingleStep(operation, params)]
}

export const PlaywrightBlock: BlockConfig<PlaywrightRunResponse> = {
  type: 'playwright',
  name: 'Playwright',
  description: 'Run browser automation with native Playwright',
  longDescription:
    'Automate browsers directly inside Sim using Playwright. Chain steps in one block (navigate, snapshot, click, type, screenshot) without configuring an external MCP server.',
  docsLink: 'https://playwright.dev/docs/intro',
  category: 'tools',
  integrationType: IntegrationType.AI,
  bgColor: '#2EAD33',
  icon: PlaywrightIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Mode',
      type: 'dropdown',
      options: [...PLAYWRIGHT_OPERATIONS],
      value: () => 'run_steps',
      required: true,
    },
    {
      id: 'steps',
      title: 'Steps',
      type: 'code',
      language: 'json',
      placeholder:
        '[{"type":"navigate","url":"https://demo.playwright.dev/todomvc"},{"type":"snapshot"},{"type":"type","ref":"e5","text":"Buy groceries","submit":true}]',
      required: true,
      condition: { field: 'operation', value: 'run_steps' },
      description: 'JSON array of steps executed in one browser session',
    },
    {
      id: 'url',
      title: 'URL',
      type: 'short-input',
      placeholder: 'https://example.com',
      required: true,
      condition: { field: 'operation', value: 'navigate' },
    },
    {
      id: 'ref',
      title: 'Element Ref',
      type: 'short-input',
      placeholder: 'e.g. e5 (from snapshot)',
      condition: { field: 'operation', value: ['click', 'type'] },
    },
    {
      id: 'selector',
      title: 'Selector',
      type: 'short-input',
      placeholder: 'CSS selector (alternative to ref)',
      mode: 'advanced',
      condition: { field: 'operation', value: ['click', 'type'] },
    },
    {
      id: 'text',
      title: 'Text',
      type: 'short-input',
      placeholder: 'Text to type',
      required: true,
      condition: { field: 'operation', value: 'type' },
    },
    {
      id: 'submit',
      title: 'Submit After Typing',
      type: 'dropdown',
      options: [
        { label: 'No', id: 'false' },
        { label: 'Yes', id: 'true' },
      ],
      condition: { field: 'operation', value: 'type' },
      mode: 'advanced',
    },
    {
      id: 'fullPage',
      title: 'Full Page',
      type: 'dropdown',
      options: [
        { label: 'No', id: 'false' },
        { label: 'Yes', id: 'true' },
      ],
      condition: { field: 'operation', value: 'screenshot' },
      mode: 'advanced',
    },
    {
      id: 'waitText',
      title: 'Wait For Text',
      type: 'short-input',
      placeholder: 'Text to appear on the page',
      condition: { field: 'operation', value: 'wait' },
    },
    {
      id: 'waitTime',
      title: 'Wait Time (ms)',
      type: 'short-input',
      placeholder: '1000',
      condition: { field: 'operation', value: 'wait' },
    },
    {
      id: 'key',
      title: 'Key',
      type: 'short-input',
      placeholder: 'Enter, Tab, ArrowDown, etc.',
      required: true,
      condition: { field: 'operation', value: 'press' },
    },
    {
      id: 'headless',
      title: 'Headless',
      type: 'dropdown',
      options: [
        { label: 'Yes', id: 'true' },
        { label: 'No', id: 'false' },
      ],
      value: () => 'true',
      mode: 'advanced',
    },
    {
      id: 'timeoutMs',
      title: 'Timeout (ms)',
      type: 'short-input',
      placeholder: '120000',
      mode: 'advanced',
    },
  ],
  tools: {
    access: ['playwright_run'],
    config: {
      tool: () => 'playwright_run',
      params: (params: Record<string, unknown>) => {
        const headless = params.headless !== 'false' && params.headless !== false
        const timeoutMs =
          typeof params.timeoutMs === 'string' && params.timeoutMs.trim()
            ? Number(params.timeoutMs)
            : typeof params.timeoutMs === 'number'
              ? params.timeoutMs
              : undefined

        return {
          steps: buildSteps(params),
          headless,
          timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
        }
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Single step or multi-step mode' },
    steps: { type: 'json', description: 'Automation steps JSON array' },
    url: { type: 'string', description: 'URL for navigate' },
    ref: { type: 'string', description: 'Element ref from snapshot' },
    selector: { type: 'string', description: 'CSS selector' },
    text: { type: 'string', description: 'Text for type step' },
    submit: { type: 'string', description: 'Submit after typing' },
    fullPage: { type: 'string', description: 'Full page screenshot' },
    waitText: { type: 'string', description: 'Text to wait for' },
    waitTime: { type: 'string', description: 'Wait duration in ms' },
    key: { type: 'string', description: 'Key for press step' },
    headless: { type: 'string', description: 'Headless browser mode' },
    timeoutMs: { type: 'string', description: 'Playwright default timeout' },
  },
  outputs: {
    stepResults: {
      type: 'array',
      description: 'Per-step results including snapshots and screenshots',
    },
    finalSnapshot: {
      type: 'string',
      description: 'Last accessibility snapshot text',
      optional: true,
    },
    finalUrl: {
      type: 'string',
      description: 'Final page URL after automation',
      optional: true,
    },
  },
}
