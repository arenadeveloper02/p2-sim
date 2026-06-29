import type { PlaywrightRunParams, PlaywrightRunResponse } from '@/tools/playwright/types'
import type { ToolConfig } from '@/tools/types'

export const playwrightRunTool: ToolConfig<PlaywrightRunParams, PlaywrightRunResponse> = {
  id: 'playwright_run',
  name: 'Playwright Run',
  description: 'Run browser automation steps with Playwright in a single browser session',
  version: '1.0.0',

  params: {
    steps: {
      type: 'json',
      required: true,
      visibility: 'user-or-llm',
      description: 'Ordered list of automation steps (navigate, snapshot, click, type, etc.)',
    },
    headless: {
      type: 'boolean',
      required: false,
      visibility: 'user-only',
      description: 'Run the browser headless (default true)',
    },
    timeoutMs: {
      type: 'number',
      required: false,
      visibility: 'user-only',
      description: 'Default timeout per Playwright action in milliseconds',
    },
  },

  request: {
    url: '/api/tools/playwright/run',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params) => ({
      steps: params.steps,
      headless: params.headless,
      timeoutMs: params.timeoutMs,
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!data.success) {
      return {
        success: false,
        output: data.output ?? { stepResults: [] },
        error: data.error ?? 'Playwright automation failed',
      }
    }
    return {
      success: true,
      output: data.output,
    }
  },

  outputs: {
    stepResults: {
      type: 'array',
      description: 'Result of each executed step',
    },
    finalSnapshot: {
      type: 'string',
      description: 'Accessibility snapshot from the last snapshot step',
      optional: true,
    },
    finalUrl: {
      type: 'string',
      description: 'Final browser URL after all steps',
      optional: true,
    },
  },
}
