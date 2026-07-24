import { generateGenerativeUiHtml } from '@/lib/generative-ui/generate-html'
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
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      userInput: params.userInput,
      mode: params.mode,
    }),
  },

  directExecution: async (params): Promise<GenerativeUiGenerateHtmlResponse> => {
    const mode = params.mode === 'webpage' ? 'webpage' : 'email'
    const result = await generateGenerativeUiHtml({
      userInput: params.userInput,
      mode,
    })

    if (!result.success || !result.html) {
      return {
        success: false,
        error: result.error ?? 'Failed to generate HTML',
        output: {
          html: '',
          spec: result.spec ?? {},
          mode,
        },
      }
    }

    return {
      success: true,
      output: {
        html: result.html,
        spec: result.spec ?? {},
        mode: result.mode ?? mode,
      },
    }
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
