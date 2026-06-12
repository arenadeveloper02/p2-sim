import { ImageIcon } from '@/components/icons'
import { AuthMode, type BlockConfig, IntegrationType } from '@/blocks/types'
import type { IdeogramPromptBuildResponse } from '@/tools/ideogram/types'

export const IdeogramPromptBuilderBlock: BlockConfig<IdeogramPromptBuildResponse> = {
  type: 'ideogram_prompt_builder',
  name: 'Ideogram Prompt Builder',
  description: 'Build Ideogram 4 structured prompts',
  authMode: AuthMode.ApiKey,
  longDescription:
    'Compose Ideogram v4 json_prompt structures visually with regions, text layers, style notes, and JSON import/export. Connect the output to Image Generator (Ideogram provider) instead of writing JSON by hand.',
  docsLink: 'https://docs.sim.ai/integrations/image_generator',
  category: 'blocks',
  integrationType: IntegrationType.AI,
  bgColor: '#4D5FFF',
  icon: ImageIcon,
  subBlocks: [
    {
      id: 'promptBuilder',
      title: 'Prompt Builder',
      type: 'ideogram-prompt-builder',
      required: true,
    },
  ],
  tools: {
    access: ['ideogram_prompt_build'],
    config: {
      tool: () => 'ideogram_prompt_build',
      params: (params) => ({
        builderValue: params.promptBuilder,
      }),
    },
  },
  inputs: {
    promptBuilder: {
      type: 'json',
      description: 'Visual Ideogram prompt builder state',
    },
  },
  outputs: {
    jsonPrompt: { type: 'json', description: 'Ideogram v4 json_prompt object for image generation' },
    promptPreview: { type: 'string', description: 'Human-readable preview of the structured prompt' },
    elements: { type: 'json', description: 'Ordered compositional elements' },
    metadata: { type: 'json', description: 'Builder metadata (counts, resolution, rendering speed)' },
  },
}

export const IdeogramPromptBuilderBlockMeta = {
  tags: ['image-generation'] as const,
}
