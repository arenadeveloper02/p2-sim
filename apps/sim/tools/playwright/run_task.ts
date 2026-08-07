import { createLogger } from '@sim/logger'
import type { PlaywrightRunTaskParams, PlaywrightRunTaskResponse } from '@/tools/playwright/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('PlaywrightTool')

/**
 * Client-safe tool config. Playwright execution lives in
 * `/api/tools/playwright/run-task` so the browser bundle never imports `playwright`.
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
    body: (params) => {
      let startUrl = params.startUrl?.trim()
      if (startUrl && !/^https?:\/\//i.test(startUrl)) {
        startUrl = `https://${startUrl}`
        logger.info(`Normalized URL from ${params.startUrl} to ${startUrl}`)
      }

      return {
        task: params.task,
        startUrl: startUrl || undefined,
        model: params.model,
        apiKey: params.apiKey,
        variables: params.variables,
        allowedDomains: params.allowedDomains,
        maxSteps: params.maxSteps,
        structuredOutput: params.structuredOutput,
      }
    },
  },

  transformResponse: async (response) => {
    const data = (await response.json()) as {
      success?: boolean
      output?: unknown
      url?: string | null
      steps?: PlaywrightRunTaskResponse['output']['steps']
      error?: string
    }

    const success = data.success === true
    return {
      success,
      output: {
        success,
        output: data.output ?? null,
        url: data.url ?? null,
        steps: Array.isArray(data.steps) ? data.steps : [],
      },
      error: data.error,
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
