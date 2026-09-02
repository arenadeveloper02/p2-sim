import type { ToolConfig, ToolResponse } from '@/tools/types'

export interface StoryboardGenerateParams {
  topic?: string
  mode?: string
  sceneCount?: number
  sceneNumber?: number
  instruction?: string
  stylePrompt?: string
  referenceImageUrl?: string
  seed?: number
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
    falUrls: string[]
    sceneCount: number
    content: string
    seed?: number
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
 * LLM-facing params are `topic`, `sceneCount`, `stylePrompt`, `referenceImageUrl`
 * and `seed`; model and image settings come from the block config via
 * tools.config.params.
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

  // Never fetched: execution is intercepted in tools/index.ts
  // (executeStoryboardGenerateDirect). Present because ToolConfig requires
  // `request` and the secret-provenance layer reads tool.request on every call.
  request: {
    url: '/api/tools/storyboard/generate',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => params,
  },

  params: {
    topic: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'The video idea to turn into a storyboard (not needed in edit mode)',
    },
    mode: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        '"scenes" (default): ordered frames of one video, saved for rendering. "concepts": independent ad ideas to pick between — never rendered as a video. "edit": regenerate one frame of the latest storyboard (requires sceneNumber and instruction). "plan": plan and save the scenes without generating any images — returns in seconds. "image": generate the image for one scene of the latest saved storyboard using its saved prompt (requires sceneNumber). Pass referenceImageUrl (frame 1 falUrl) and seed on image/edit so later frames keep the same person.',
    },
    sceneNumber: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Edit/image mode: which frame to work on (1-based, e.g. 3)',
    },
    instruction: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Edit mode: the change the user wants for that frame, e.g. "make it at night"',
    },
    aspectRatio: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Aspect ratio of the frames, decided by target platform: "16:9" (YouTube/LinkedIn), "9:16" (TikTok/Reels/Stories), "1:1" (feed posts). Default 16:9.',
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
    referenceImageUrl: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        "Public image URL to condition this frame on (e.g. frame 1's falUrl). Routes to nano-banana-2 edit so later frames keep the same person instead of inventing a new one. Ignored if empty.",
    },
    seed: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Optional image seed. Reuse the seed returned from frame 1 so later frames stay consistent.',
    },
  },

  outputs: {
    storyboardId: { type: 'string', description: 'Identifier of the saved storyboard' },
    conversationId: { type: 'string', description: 'Conversation the storyboard belongs to' },
    topic: { type: 'string', description: 'The video idea used' },
    scenes: {
      type: 'json',
      description:
        'Ordered scenes: index, description, prompt, imageUrl (Sim-hosted), falUrl (public Fal CDN URL for external UIs)',
    },
    images: { type: 'array', description: 'Scene preview image URLs (Sim-hosted), in order' },
    falUrls: {
      type: 'array',
      description:
        'Public Fal.ai CDN URLs for each scene, index-aligned with images. Use these in external apps — imageUrl requires a Sim login.',
    },
    sceneCount: { type: 'number', description: 'Number of scenes generated' },
    content: { type: 'string', description: 'Scene list and reorder instructions for chat' },
    seed: {
      type: 'number',
      description: 'Image seed returned by Fal for the frame just generated (image/edit mode)',
    },
  },
}
