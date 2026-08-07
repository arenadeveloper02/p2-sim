import { PlaywrightIcon } from '@/components/icons'
import { AuthMode, type BlockConfig, type BlockMeta, IntegrationType } from '@/blocks/types'
import type { PlaywrightResponse } from '@/tools/playwright/types'

export const PlaywrightBlock: BlockConfig<PlaywrightResponse> = {
  type: 'playwright',
  name: 'Playwright',
  description: 'Run browser tasks with local Chromium',
  authMode: AuthMode.ApiKey,
  longDescription:
    'Self-hosted browser agent using Playwright and local Chromium. Describe a task in natural language; an LLM drives click/type/navigate actions. Requires Chromium installed on the host (`bunx playwright install chromium`).',
  docsLink: 'https://docs.sim.ai/integrations/playwright',
  category: 'tools',
  integrationType: IntegrationType.AI,
  bgColor: '#2EAD33',
  icon: PlaywrightIcon,
  subBlocks: [
    {
      id: 'task',
      title: 'Task',
      type: 'long-input',
      placeholder: 'Describe what the browser agent should do...',
      required: true,
    },
    {
      id: 'startUrl',
      title: 'Start URL',
      type: 'short-input',
      placeholder: 'https://example.com (optional starting URL)',
    },
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      required: true,
      options: [
        { label: 'GPT-4o', id: 'gpt-4o' },
        { label: 'GPT-4o Mini', id: 'gpt-4o-mini' },
        { label: 'GPT-4.1', id: 'gpt-4.1' },
        { label: 'GPT-4.1 Mini', id: 'gpt-4.1-mini' },
        { label: 'O3', id: 'o3' },
        { label: 'O4 Mini', id: 'o4-mini' },
        { label: 'Claude 3.7 Sonnet', id: 'claude-3-7-sonnet-20250219' },
        { label: 'Claude Sonnet 4', id: 'claude-sonnet-4-20250514' },
        { label: 'Claude Sonnet 4.5', id: 'claude-sonnet-4-5-20250929' },
        { label: 'Claude Opus 4.5', id: 'claude-opus-4-5-20251101' },
      ],
      value: () => 'gpt-4o-mini',
    },
    {
      id: 'apiKey',
      title: 'API Key',
      type: 'short-input',
      password: true,
      placeholder: 'API key for the selected model provider',
      required: true,
    },
    {
      id: 'variables',
      title: 'Variables (Secrets)',
      type: 'table',
      columns: ['Key', 'Value'],
    },
    {
      id: 'maxSteps',
      title: 'Max Steps',
      type: 'short-input',
      placeholder: '50',
      mode: 'advanced',
    },
    {
      id: 'allowedDomains',
      title: 'Allowed Domains',
      type: 'short-input',
      placeholder: 'example.com, docs.example.com',
      mode: 'advanced',
    },
    {
      id: 'structuredOutput',
      title: 'Structured Output Schema',
      type: 'code',
      language: 'json',
      placeholder: 'Optional JSON schema guidance for the final output',
      mode: 'advanced',
    },
  ],
  tools: {
    access: ['playwright_run_task'],
    config: {
      tool: () => 'playwright_run_task',
      params: (params) => {
        const next: Record<string, unknown> = { ...params }
        if (typeof next.maxSteps === 'string') {
          const trimmed = next.maxSteps.trim()
          if (trimmed === '') {
            next.maxSteps = undefined
          } else {
            const n = Number(trimmed)
            next.maxSteps = Number.isFinite(n) ? n : undefined
          }
        }
        return next
      },
    },
  },
  inputs: {
    task: { type: 'string', description: 'Browser automation task' },
    startUrl: { type: 'string', description: 'Starting URL for the agent' },
    model: { type: 'string', description: 'LLM model selected by the user' },
    apiKey: { type: 'string', description: 'API key for the selected model provider' },
    variables: { type: 'json', description: 'Secrets to inject into the task' },
    maxSteps: { type: 'number', description: 'Maximum agent steps' },
    allowedDomains: { type: 'string', description: 'Comma-separated allowed domains' },
    structuredOutput: { type: 'string', description: 'Optional JSON schema for final output' },
  },
  outputs: {
    success: { type: 'boolean', description: 'Task completion status' },
    output: { type: 'json', description: 'Final task output (string or structured)' },
    url: { type: 'string', description: 'Final page URL' },
    steps: {
      type: 'json',
      description: 'Steps the agent executed (number, action, detail, url, error)',
    },
  },
}

export const PlaywrightBlockMeta = {
  tags: ['web-scraping', 'automation', 'agentic'],
  url: 'https://playwright.dev',
  skills: [
    {
      name: 'automate-web-task',
      description:
        'Drive a local Chromium browser with Playwright to complete a multi-step web task from a natural-language instruction.',
      content:
        '# Automate Web Task (Playwright)\n\n## Steps\n1. Write a clear Task describing the goal and success condition.\n2. Set Start URL when known.\n3. Choose a Model and provide that provider API key.\n4. Put credentials in Variables (Secrets) and reference them as {{key}} in the task.\n5. Optionally set Allowed Domains and a Structured Output Schema.\n\n## Output\nReturns success, output, final url, and steps. Runs on local Chromium (max 1 hour).',
    },
  ],
} as const satisfies BlockMeta
