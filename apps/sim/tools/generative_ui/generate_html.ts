import { mapGenerativeUiResultToToolResponse } from '@/tools/generative_ui/map-response'
import type {
  GenerativeUiGenerateHtmlParams,
  GenerativeUiGenerateHtmlResponse,
} from '@/tools/generative_ui/types'
import type { ToolConfig } from '@/tools/types'

export const generativeUiGenerateHtmlTool: ToolConfig<
  GenerativeUiGenerateHtmlParams,
  GenerativeUiGenerateHtmlResponse
> = {
  id: 'generative_ui_generate_html',
  name: 'Generate HTML from Prompt',
  description:
    'Generate well-structured HTML from a natural language prompt using json-render (email or webpage mode)',
  version: '1.0.0',

  params: {
    userInput: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Description of the UI or email to generate',
    },
    mode: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Output mode: email (email-safe HTML) or webpage (full page HTML)',
    },
  },

  request: {
    url: '/api/tools/generative_ui/generate',
    method: 'POST',
    /** Catalog prompt + LLM + HTML render can exceed the default internal fetch limit */
    timeout: 120_000,
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      userInput: params.userInput,
      mode: params.mode,
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!response.ok) {
      return mapGenerativeUiResultToToolResponse({
        success: false,
        error: typeof data.error === 'string' ? data.error : response.statusText,
        mode: data.output?.mode === 'webpage' ? 'webpage' : 'email',
        spec: data.output?.spec,
      })
    }
    return data as GenerativeUiGenerateHtmlResponse
  },

  outputs: {
    html: { type: 'string', description: 'Generated HTML document or email markup' },
    spec: {
      type: 'json',
      description: 'json-render Spec JSON used to produce the HTML',
    },
    mode: { type: 'string', description: 'Mode used for generation: email or webpage' },
  },
}
