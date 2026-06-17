import type { IdeogramPromptBuildParams, IdeogramPromptBuildResponse } from '@/tools/ideogram/types'
import type { ToolConfig } from '@/tools/types'

export const ideogramPromptBuildTool: ToolConfig<IdeogramPromptBuildParams, IdeogramPromptBuildResponse> = {
  id: 'ideogram_prompt_build',
  name: 'Ideogram Prompt Builder',
  description: 'Serialize an Ideogram visual prompt builder value into v4 json_prompt format',
  version: '1.0.0',

  params: {
    builderValue: {
      type: 'json',
      required: true,
      visibility: 'user-or-llm',
      description: 'Ideogram prompt builder state from the visual builder subblock',
    },
  },

  request: {
    url: '/api/tools/ideogram-prompt',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: IdeogramPromptBuildParams) => ({
      builderValue: params.builderValue,
    }),
  },

  transformResponse: async (response: Response): Promise<IdeogramPromptBuildResponse> => {
    const data = (await response.json()) as IdeogramPromptBuildResponse
    return data
  },

  outputs: {
    jsonPrompt: {
      type: 'json',
      description: 'Ideogram v4 json_prompt object ready for image generation',
    },
    promptPreview: {
      type: 'string',
      description: 'Human-readable preview of the structured prompt',
    },
    magicPrompt: {
      type: 'string',
      description:
        'Plain text prompt generated from the builder for Ideogram text_prompt Magic Prompt workflows',
    },
    resolution: {
      type: 'string',
      description: 'Canvas resolution for direct wiring into Image Generator',
    },
    renderingSpeed: {
      type: 'string',
      description: 'Rendering speed for direct wiring into Image Generator',
    },
    elements: {
      type: 'json',
      description: 'Ordered compositional elements from the builder',
    },
    metadata: {
      type: 'json',
      description: 'Builder metadata such as element counts and resolution',
    },
  },
}
