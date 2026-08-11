import type { ToolConfig, ToolResponse } from '@/tools/types'

export interface StoryboardGenerateParams {
  topic: string
  sceneCount?: number
  stylePrompt?: string
  conversationId?: string
  planningProvider?: string
  planningModel?: string
  imageProvider?: string
  imageModel?: string
  aspectRatio?: string
  apiKey?: string
  _context?: { userId?: string; workspaceId?: string; workflowId?: string }
}

export interface StoryboardGenerateResponse extends ToolResponse {
  output: {
    storyboardId: string
    conversationId: string
    topic: string
    scenes: unknown[]
    images: string[]
    sceneCount: number
    content: string
  }
}

/**
 * Agent-callable storyboard generation.
 *
 * `directExecution` is intentionally omitted here: the tools registry is
 * imported by client bundles, and a static import of the storyboard server
 * module (db → postgres) breaks the Next.js client build. Execution is wired
 * server-side in `tools/index.ts` via a dynamic import.
 *
 * LLM-facing params are `topic`, `sceneCount` and `stylePrompt`; model and
 * image settings come from the block config via tools.config.params.
 */
export const storyboardGenerateTool: ToolConfig<
  StoryboardGenerateParams,
  StoryboardGenerateResponse
> = {
  id: 'storyboard_generate',
  name: 'Generate Storyboard',
  description:
    'Break a video idea into ordered scenes and generate a Fal.ai preview image for each one, so the user can review and reorder them before the video is made. Returns the scene images for display in chat.',
  version: '1.0.0',

  params: {
    topic: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'The video idea to turn into a storyboard',
    },
    sceneCount: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'How many scenes to generate (1-10, default 4)',
    },
    stylePrompt: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Overall visual style applied to every scene, e.g. "cinematic, warm lighting"',
    },
  },

  outputs: {
    storyboardId: { type: 'string', description: 'Identifier of the saved storyboard' },
    conversationId: { type: 'string', description: 'Conversation the storyboard belongs to' },
    topic: { type: 'string', description: 'The video idea used' },
    scenes: {
      type: 'json',
      description: 'Ordered scenes: index, description, prompt and imageUrl',
    },
    images: { type: 'array', description: 'Scene preview image URLs, in order' },
    sceneCount: { type: 'number', description: 'Number of scenes generated' },
    content: { type: 'string', description: 'Scene list and reorder instructions for chat' },
  },
}
