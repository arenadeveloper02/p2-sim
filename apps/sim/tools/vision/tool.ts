import type { ToolConfig } from '@/tools/types'
import type { VisionParams, VisionResponse, VisionV2Params } from '@/tools/vision/types'

/** Drop imageFile when it only duplicates imageUrl (models sometimes echo the URL into both). */
function buildVisionAnalyzePayload(params: VisionParams | VisionV2Params) {
  const rawUrl = params.imageUrl
  const imageUrl =
    typeof rawUrl === 'string' && rawUrl.trim().length > 0 ? rawUrl.trim() : null
  let imageFile = params.imageFile ?? null
  if (
    imageUrl &&
    imageFile &&
    typeof imageFile === 'object' &&
    imageFile !== null &&
    'url' in imageFile &&
    typeof (imageFile as { url?: unknown }).url === 'string' &&
    (imageFile as { url: string }).url.trim() === imageUrl
  ) {
    imageFile = null
  }
  return {
    apiKey: params.apiKey ?? null,
    imageUrl,
    imageFile,
    model: params.model || 'gpt-5.2',
    prompt: params.prompt ?? null,
  }
}

export const visionTool: ToolConfig<VisionParams, VisionResponse> = {
  id: 'vision_tool',
  name: 'Vision Tool',
  description:
    'Process and analyze images using advanced vision models. Capable of understanding image content, extracting text, identifying objects, and providing detailed visual descriptions.',
  version: '1.0.0',

  params: {
    apiKey: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description:
        'API key for the selected model provider (optional if OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY is set on the server for that model)',
    },
    imageUrl: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'HTTPS URL of a publicly accessible image to analyze. When using a URL, pass only this field (omit imageFile).',
    },
    imageFile: {
      type: 'file',
      required: false,
      visibility: 'user-only',
      description:
        'Workspace upload from the tool/block UI only. The model must not invent this object. For public images, use imageUrl only.',
    },
    model: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Vision model to use (gpt-4o, claude-3-opus-20240229, etc)',
    },
    prompt: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Custom prompt for image analysis',
    },
  },

  request: {
    method: 'POST',
    url: '/api/tools/vision/analyze',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params) => buildVisionAnalyzePayload(params),
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to analyze image')
    }
    return {
      success: true,
      output: data.output,
    }
  },

  outputs: {
    content: {
      type: 'string',
      description: 'The analyzed content and description of the image',
    },
    model: {
      type: 'string',
      description: 'The vision model that was used for analysis',
      optional: true,
    },
    tokens: {
      type: 'number',
      description: 'Total tokens used for the analysis',
      optional: true,
    },
    usage: {
      type: 'object',
      description: 'Detailed token usage breakdown',
      optional: true,
      properties: {
        input_tokens: { type: 'number', description: 'Tokens used for input processing' },
        output_tokens: { type: 'number', description: 'Tokens used for response generation' },
        total_tokens: { type: 'number', description: 'Total tokens consumed' },
      },
    },
  },
}

export const visionToolV2: ToolConfig<VisionV2Params, VisionResponse> = {
  ...visionTool,
  id: 'vision_tool_v2',
  name: 'Vision Tool',
  params: {
    apiKey: visionTool.params.apiKey,
    imageFile: visionTool.params.imageFile,
    imageUrl: visionTool.params.imageUrl,
    model: visionTool.params.model,
    prompt: visionTool.params.prompt,
  },
  request: {
    ...visionTool.request,
    body: (params: VisionV2Params) => buildVisionAnalyzePayload(params),
  },
}
