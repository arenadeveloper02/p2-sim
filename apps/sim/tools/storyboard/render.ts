import type { ToolConfig, ToolResponse } from '@/tools/types'

export interface StoryboardRenderParams {
  conversationId?: string
  storyboardId?: string
  order?: string
  sceneNumber?: number
  sourceImageUrl?: string
  chainFrames?: boolean
  clipUrls?: string[] | string
  audioUrl?: string
  audioMode?: string
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
    publicVideoUrl?: string
    falUrls: string[]
    lastFrameUrls: string[]
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
    sceneNumber: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description:
        "Single-scene mode: render ONLY this scene's clip (1-based, e.g. 3). The other scenes are untouched and the storyboard is not marked rendered. Takes priority over order.",
    },
    sourceImageUrl: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        "Frame chaining: generate the (first) clip from this image instead of the scene's stored storyboard still — typically a previous clip's lastFrameUrl, so the new clip starts exactly where that one ended.",
    },
    chainFrames: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description:
        "Full-render chaining: each scene's clip is generated from the LAST FRAME of the previous clip instead of its own storyboard still, so the video reads as one continuous piece. Slower (clips are strictly sequential).",
    },
    clipUrls: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Concat mode: URLs of already-generated clips to join in this exact order (JSON array or comma-separated). When set, no clips are generated — the videos are just stitched and returned. All other params are ignored.',
    },
    audioUrl: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Concat mode: narration/music track to mix over the joined video (e.g. a TTS publicAudioUrl). The video never runs past its last frame.',
    },
    audioMode: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Concat mode: "duck" (default) lowers the clips\' own audio under the narration; "replace" keeps the narration as the only audio.',
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
    videoUrl: {
      type: 'string',
      description: 'Sim-hosted URL of the final rendered video (requires a Sim session)',
    },
    publicVideoUrl: {
      type: 'string',
      description:
        'Publicly fetchable URL of the final video (presigned, or the Fal CDN URL for a single clip). External apps should play this one.',
    },
    falUrls: {
      type: 'array',
      description:
        'Public Fal CDN URL per clip in the rendered scene order (empty string when unavailable)',
    },
    lastFrameUrls: {
      type: 'array',
      description:
        "Image URL of each clip's LAST frame, in rendered order. Pass one as sourceImageUrl to chain the next clip off it.",
    },
    storyboardId: { type: 'string', description: 'Storyboard that was rendered' },
    conversationId: { type: 'string', description: 'Conversation the storyboard belongs to' },
    topic: { type: 'string', description: 'The original video idea' },
    order: { type: 'json', description: 'Scene order used for the final video' },
    clipCount: { type: 'number', description: 'Number of clips stitched together' },
    model: { type: 'string', description: 'Fal.ai video model used' },
    content: { type: 'string', description: 'Confirmation text with the video link' },
  },
}
