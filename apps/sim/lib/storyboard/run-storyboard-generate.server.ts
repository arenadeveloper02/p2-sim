/**
 * Server-only storyboard generation.
 *
 * Breaks a video idea into ordered scenes, generates one preview image per
 * scene, and persists the result to the `storyboards` table keyed by
 * conversation id. A later turn reads that row to render the final video, so
 * the user can review and reorder the scenes in between.
 *
 * Kept out of the ToolConfig because the tools registry is imported by client
 * bundles; a static import of the db/image server modules breaks the client
 * build. Execution is wired in `tools/index.ts` via dynamic import.
 */

import { db } from '@sim/db'
import { createLogger } from '@sim/logger'
import { sql } from 'drizzle-orm'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import {
  buildImageToolBodyFromExecutionParams,
  runImageToolGeneration,
} from '@/lib/image-generation/run-image-tool.server'
import { getFalApiKey } from '@/lib/media/falai'
import { executeProviderRequest } from '@/providers'
import type { ProviderResponse } from '@/providers/types'

const logger = createLogger('StoryboardGenerate')

const DEFAULT_SCENE_COUNT = 4
const MIN_SCENE_COUNT = 1
const MAX_SCENE_COUNT = 10

export interface StoryboardScene {
  index: number
  prompt: string
  description: string
  imageUrl: string
}

export interface RunStoryboardGenerateResult {
  storyboardId: string
  conversationId: string
  topic: string
  scenes: StoryboardScene[]
  images: string[]
  sceneCount: number
  content: string
}

export interface RunStoryboardGenerateContext {
  userId?: string
  workspaceId?: string
  workflowId?: string
  requestId?: string
}

function clampSceneCount(value: unknown): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN
  if (!Number.isFinite(parsed)) return DEFAULT_SCENE_COUNT
  return Math.min(MAX_SCENE_COUNT, Math.max(MIN_SCENE_COUNT, Math.trunc(parsed)))
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Asks the model to split the idea into ordered, visually distinct scenes.
 */
async function planScenes(options: {
  topic: string
  sceneCount: number
  stylePrompt: string
  model: string
  apiKey: string
  provider: string
}): Promise<Array<{ description: string; prompt: string }>> {
  const { topic, sceneCount, stylePrompt, model, apiKey, provider } = options

  const systemPrompt = `You are a storyboard planner for short AI-generated videos.

Split the user's idea into exactly ${sceneCount} ordered scenes that tell a coherent story.

Return ONLY a JSON object, no markdown, in this exact shape:
{"scenes":[{"description":"short human-readable summary of the scene","prompt":"detailed visual image-generation prompt for this scene"}]}

Rules:
- Exactly ${sceneCount} scenes, in narrative order.
- "prompt" must be a rich, self-contained visual description (subject, setting, lighting, camera angle, mood). It is fed directly to an image generator.
- Every scene must be visually distinct from the others.
- Keep characters, art style, and color palette consistent across all scenes so the scenes look like one video.
- Do not include any text, captions, watermarks, or letters in the images.${
    stylePrompt ? `\n- Apply this overall visual style to every scene: ${stylePrompt}` : ''
  }`

  const response = (await executeProviderRequest(provider, {
    model,
    systemPrompt,
    messages: [{ role: 'user', content: topic }],
    apiKey,
    temperature: 0.7,
    maxTokens: 4096,
  })) as ProviderResponse

  const content =
    typeof response === 'string' ? response : 'content' in response ? response.content : ''

  if (!content || typeof content !== 'string') {
    throw new Error('Scene planning returned no content')
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content)

  const rawScenes = Array.isArray(parsed?.scenes) ? parsed.scenes : []
  if (rawScenes.length === 0) {
    throw new Error('Scene planning returned no scenes')
  }

  return rawScenes.slice(0, sceneCount).map((scene: Record<string, unknown>, i: number) => {
    const prompt = asString(scene.prompt) || asString(scene.description)
    if (!prompt) {
      throw new Error(`Scene ${i + 1} is missing a prompt`)
    }
    return {
      description: asString(scene.description) || prompt,
      prompt,
    }
  })
}

/**
 * Generates a storyboard: plans scenes, renders one image per scene, persists it.
 */
export async function runStoryboardGenerate(
  params: Record<string, unknown>,
  context: RunStoryboardGenerateContext
): Promise<RunStoryboardGenerateResult> {
  const requestId = context.requestId ?? crypto.randomUUID().slice(0, 8)

  const topic = asString(params.topic)
  if (!topic) {
    throw new Error('A video idea (topic) is required to build a storyboard')
  }

  // Agent tool calls do not carry the chat's conversation id (it is not part of
  // the tool _context), so fall back to a workflow-scoped key. The render step
  // uses the same fallback chain to find this row again.
  const conversationId =
    asString(params.conversationId) ||
    (context.workflowId ? `wf:${context.workflowId}` : `user:${context.userId ?? 'unknown'}`)

  const sceneCount = clampSceneCount(params.sceneCount)
  const stylePrompt = asString(params.stylePrompt)

  const planningProvider = asString(params.planningProvider) || 'anthropic'
  const planningModel = asString(params.planningModel) || 'claude-sonnet-5'
  const planningApiKey =
    asString(params.apiKey) ||
    asString(params.planningApiKey) ||
    getRotatingApiKey(planningProvider === 'openai' ? 'openai' : 'anthropic')

  // Images always go through Fal.ai (instance FALAI_API_KEY) — not OpenAI/Gemini.
  const imageProvider = asString(params.imageProvider) || 'falai'
  const imageModel = asString(params.imageModel) || 'nano-banana-2'
  const aspectRatio = asString(params.aspectRatio) || '16:9'
  const falApiKey = asString(params.falApiKey) || getFalApiKey()

  logger.info(`[${requestId}] Planning storyboard scenes`, {
    sceneCount,
    planningProvider,
    planningModel,
    imageProvider,
    imageModel,
  })

  const planned = await planScenes({
    topic,
    sceneCount,
    stylePrompt,
    model: planningModel,
    apiKey: planningApiKey,
    provider: planningProvider,
  })

  logger.info(`[${requestId}] Generating scene images via Fal.ai`, { count: planned.length })

  // Sequential on purpose: image providers rate-limit aggressively, and a
  // partial storyboard is worse than a slower one.
  const scenes: StoryboardScene[] = []
  for (let i = 0; i < planned.length; i++) {
    const scene = planned[i]
    const imageBody = buildImageToolBodyFromExecutionParams({
      provider: imageProvider,
      model: imageModel,
      apiKey: falApiKey,
      prompt: stylePrompt ? `${scene.prompt}\n\nOverall style: ${stylePrompt}` : scene.prompt,
      aspectRatio,
      workflowId: context.workflowId,
      workspaceId: context.workspaceId,
      userId: context.userId,
    })

    const image = await runImageToolGeneration(imageBody, {
      userId: context.userId ?? 'unknown',
      requestId: `${requestId}-s${i + 1}`,
    })

    scenes.push({
      index: i + 1,
      prompt: scene.prompt,
      description: scene.description,
      imageUrl: image.imageUrl,
    })
  }

  const inserted = await db.execute(
    sql`INSERT INTO storyboards (conversation_id, workflow_id, workspace_id, user_id, topic, scenes, status)
        VALUES (
          ${conversationId},
          ${context.workflowId ?? null},
          ${context.workspaceId ?? null},
          ${context.userId ?? null},
          ${topic},
          ${JSON.stringify(scenes)}::jsonb,
          'draft'
        )
        RETURNING id`
  )

  const rows = inserted as unknown as Array<{ id: string }>
  const storyboardId = rows[0]?.id
  if (!storyboardId) {
    throw new Error('Failed to persist storyboard')
  }

  logger.info(`[${requestId}] Storyboard saved`, {
    storyboardId,
    conversationId,
    sceneCount: scenes.length,
  })

  const sceneLines = scenes.map((s) => `${s.index}. ${s.description}`).join('\n')
  const content = `Here is the storyboard for "${topic}" — ${scenes.length} scenes:\n\n${sceneLines}\n\nReview the images above. Reply with the order you want, for example "${scenes
    .map((s) => s.index)
    .join(',')}", and I'll generate the video in that order.`

  return {
    storyboardId,
    conversationId,
    topic,
    scenes,
    images: scenes.map((s) => s.imageUrl),
    sceneCount: scenes.length,
    content,
  }
}
