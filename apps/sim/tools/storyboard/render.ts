import type { ToolConfig, ToolResponse } from '@/tools/types'

export interface StoryboardRenderParams {
  conversationId?: string
  storyboardId?: string
  order?: string
  videoModel?: string
  clipDuration?: number
  targetDuration?: number
  resolution?: string
  generateAudio?: boolean
  _context?: { userId?: string; workspaceId?: string; workflowId?: string }
}

export interface StoryboardRenderResponse extends ToolResponse {
  output: {
    videoUrl: string
    storyboardId: string
    conversationId: string
    topic: string
    order: number[]
    clipCount: number
    model: string
    content: string
  }
}

/**
 * Agent-callable storyboard rendering (Story Mode of the Video Generator).
 *
 * `directExecution` is intentionally omitted here: the tools registry is
 * imported by client bundles, and a static import of the render server module
 * (db/ffmpeg/fal) breaks the Next.js client build. Execution is wired
 * server-side in `tools/index.ts` via a dynamic import.
 */
export const storyboardRenderTool: ToolConfig<StoryboardRenderParams, StoryboardRenderResponse> = {
  id: 'storyboard_render',
  name: 'Render Storyboard Video',
  description:
    'Turn a previously generated storyboard into a final video: applies the scene order the user chose (e.g. "3,1,2"), converts each scene image to a video clip, and stitches the clips into one video.',
  version: '1.0.0',

  params: {
    conversationId: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description:
        'Conversation whose latest storyboard should be rendered. Optional — defaults to the most recent storyboard for this workflow.',
    },
    order: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Scene order as numbers, e.g. "3,1,2". Empty keeps the original order. Scenes can be dropped by omitting them.',
    },
    targetDuration: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Total length of the finished video in seconds, e.g. 30. Per-scene duration is derived from this and snapped to what the video model supports. Takes priority over clipDuration.',
    },
    clipDuration: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Seconds per scene clip. Ignored when targetDuration is set. Defaults to 4 (5 on MiniMax H3).',
    },
  },

  outputs: {
    videoUrl: { type: 'string', description: 'URL of the final rendered video' },
    storyboardId: { type: 'string', description: 'Storyboard that was rendered' },
    conversationId: { type: 'string', description: 'Conversation the storyboard belongs to' },
    topic: { type: 'string', description: 'The original video idea' },
    order: { type: 'json', description: 'Scene order used for the final video' },
    clipCount: { type: 'number', description: 'Number of clips stitched together' },
    model: { type: 'string', description: 'Fal.ai video model used' },
    content: { type: 'string', description: 'Confirmation text with the video link' },
  },
}
