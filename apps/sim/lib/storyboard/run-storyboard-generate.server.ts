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

/**
 * 'scenes'   — ordered scenes of ONE video (saved, renderable).
 * 'concepts' — N independent ad ideas to pick from (never saved, never renderable).
 * 'edit'     — regenerate ONE frame of the latest saved storyboard in place.
 * 'plan'     — plan and save the scenes WITHOUT images (fast; frames come later).
 * 'image'    — generate the image for ONE scene of the latest saved storyboard.
 */
export type StoryboardMode = 'scenes' | 'concepts' | 'edit' | 'plan' | 'image'

function asMode(value: unknown): StoryboardMode {
  const normalized = asString(value).toLowerCase()
  if (normalized === 'concepts') return 'concepts'
  if (normalized === 'edit') return 'edit'
  if (normalized === 'plan') return 'plan'
  if (normalized === 'image') return 'image'
  return 'scenes'
}

export interface StoryboardScene {
  index: number
  prompt: string
  description: string
  /** Sim-hosted serve URL. Requires a logged-in Sim session. */
  imageUrl: string
  /**
   * Original Fal.ai (or other provider) CDN URL. Publicly fetchable without a
   * Sim session — this is what external UIs should render as the frame preview.
   */
  falUrl?: string
}

export interface RunStoryboardGenerateResult {
  storyboardId: string
  conversationId: string
  topic: string
  scenes: StoryboardScene[]
  images: string[]
  /** Public Fal CDN URLs, index-aligned with `scenes` / `images`. */
  falUrls: string[]
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
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN
  if (!Number.isFinite(parsed)) return DEFAULT_SCENE_COUNT
  return Math.min(MAX_SCENE_COUNT, Math.max(MIN_SCENE_COUNT, Math.trunc(parsed)))
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Keeps only a public http(s) provider URL. Sim serve URLs and data URIs are
 * dropped so an external app never tries to fetch a 401-gated path.
 */
function asPublicHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return undefined
  if (trimmed.includes('/api/files/serve/')) return undefined
  if (trimmed.startsWith('data:')) return undefined
  return trimmed
}

function sceneFromGeneratedImage(options: {
  index: number
  prompt: string
  description: string
  imageUrl: string
  sourceUrl?: string
}): StoryboardScene {
  const falUrl = asPublicHttpUrl(options.sourceUrl)
  return {
    index: options.index,
    prompt: options.prompt,
    description: options.description,
    imageUrl: options.imageUrl,
    ...(falUrl ? { falUrl } : {}),
  }
}

function falUrlsFromScenes(scenes: StoryboardScene[]): string[] {
  return scenes.map((scene) => scene.falUrl ?? '')
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
  mode: StoryboardMode
}): Promise<Array<{ description: string; prompt: string }>> {
  const { topic, sceneCount, stylePrompt, model, apiKey, provider, mode } = options

  const systemPrompt =
    mode === 'concepts'
      ? `You are a creative director pitching short video ad ideas.

Turn the user's brief into exactly ${sceneCount} INDEPENDENT ad concepts. Each concept is a complete, standalone video idea — NOT scenes of one story.

Return ONLY a JSON object, no markdown, in this exact shape:
{"scenes":[{"description":"one-sentence pitch of this ad concept","prompt":"detailed visual image-generation prompt for this concept's key frame"}]}

Rules:
- Exactly ${sceneCount} concepts.
- Every concept must be clearly different from the others: different setting, mood, visual style, or creative angle.
- "prompt" must be a rich, self-contained visual description (subject, setting, lighting, camera angle, mood) of the concept's single most representative frame. It is fed directly to an image generator.
- "description" must summarize the whole ad idea in one sentence so a person can pick between them.
- Do not include any text, captions, watermarks, or letters in the images.${
          stylePrompt ? `\n- Apply this overall visual style to every concept: ${stylePrompt}` : ''
        }`
      : `You are a storyboard planner for short AI-generated videos.

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

type StoryboardQueryRow = { id: string; topic: string | null; scenes: unknown }

/**
 * Finds the latest saved storyboard using the same fallback chain as the
 * render step (conversation key → workflow key → workflow id → user id).
 */
async function loadLatestStoryboard(
  conversationId: string,
  context: RunStoryboardGenerateContext
): Promise<{ id: string; topic: string; scenes: StoryboardScene[] }> {
  const attempts: Array<() => Promise<unknown>> = []

  if (conversationId) {
    attempts.push(() =>
      db.execute(
        sql`SELECT id, topic, scenes FROM storyboards
            WHERE conversation_id = ${conversationId}
            ORDER BY created_at DESC LIMIT 1`
      )
    )
  }

  if (context.workflowId) {
    const workflowKey = `wf:${context.workflowId}`
    attempts.push(() =>
      db.execute(
        sql`SELECT id, topic, scenes FROM storyboards
            WHERE conversation_id = ${workflowKey}
            ORDER BY created_at DESC LIMIT 1`
      )
    )
    attempts.push(() =>
      db.execute(
        sql`SELECT id, topic, scenes FROM storyboards
            WHERE workflow_id = ${context.workflowId}
            ORDER BY created_at DESC LIMIT 1`
      )
    )
  }

  if (context.userId) {
    attempts.push(() =>
      db.execute(
        sql`SELECT id, topic, scenes FROM storyboards
            WHERE user_id = ${context.userId}
            ORDER BY created_at DESC LIMIT 1`
      )
    )
  }

  let row: StoryboardQueryRow | undefined
  for (const attempt of attempts) {
    const rows = (await attempt()) as unknown as StoryboardQueryRow[]
    if (rows[0]) {
      row = rows[0]
      break
    }
  }

  if (!row) {
    throw new Error('No storyboard found yet. Generate the frames before editing one.')
  }

  const scenes = (
    typeof row.scenes === 'string' ? JSON.parse(row.scenes) : row.scenes
  ) as StoryboardScene[]
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('The saved storyboard has no frames')
  }

  return { id: row.id, topic: row.topic ?? '', scenes }
}

/**
 * Applies the user's modification to one frame's image prompt, keeping the
 * frame consistent with the rest of the story.
 */
async function rewriteScenePrompt(options: {
  scene: StoryboardScene
  instruction: string
  storyTopic: string
  model: string
  apiKey: string
  provider: string
}): Promise<{ description: string; prompt: string }> {
  const { scene, instruction, storyTopic, model, apiKey, provider } = options

  const systemPrompt = `You update ONE frame of a video storyboard.

Return ONLY a JSON object, no markdown, in this exact shape:
{"description":"short human-readable summary of the updated frame","prompt":"detailed visual image-generation prompt for the updated frame"}

Rules:
- Apply the user's modification to the existing frame while keeping everything they did not ask to change (subject, setting, style, mood) as close to the original as possible, so the frame still fits the story.
- "prompt" must be a rich, self-contained visual description. It is fed directly to an image generator.
- Do not include any text, captions, watermarks, or letters in the image.`

  const userMessage = `Story: ${storyTopic || 'n/a'}

Existing frame description: ${scene.description}
Existing image prompt: ${scene.prompt}

Modification requested by the user: ${instruction}`

  const response = (await executeProviderRequest(provider, {
    model,
    systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    apiKey,
    temperature: 0.5,
    maxTokens: 2048,
  })) as ProviderResponse

  const content =
    typeof response === 'string' ? response : 'content' in response ? response.content : ''
  if (!content || typeof content !== 'string') {
    throw new Error('Frame rewrite returned no content')
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content)
  const prompt = asString(parsed?.prompt)
  if (!prompt) {
    throw new Error('Frame rewrite returned no prompt')
  }
  return { description: asString(parsed?.description) || prompt, prompt }
}

/**
 * Generates a storyboard: plans scenes, renders one image per scene, persists it.
 */
export async function runStoryboardGenerate(
  params: Record<string, unknown>,
  context: RunStoryboardGenerateContext
): Promise<RunStoryboardGenerateResult> {
  const requestId = context.requestId ?? crypto.randomUUID().slice(0, 8)

  const mode = asMode(params.mode)

  const topic = asString(params.topic)
  if (!topic && mode !== 'edit' && mode !== 'image') {
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

  // Edit mode: regenerate ONE frame of the latest storyboard in place. The
  // row is updated (not re-inserted), so the render step's latest-storyboard
  // lookup keeps finding the same, now-edited storyboard.
  if (mode === 'edit') {
    const sceneNumber = clampSceneCount(params.sceneNumber)
    const instruction = asString(params.instruction) || topic
    if (!instruction) {
      throw new Error('Describe the change you want for the frame (instruction)')
    }

    const storyboard = await loadLatestStoryboard(conversationId, context)
    if (sceneNumber > storyboard.scenes.length) {
      throw new Error(
        `Frame ${sceneNumber} does not exist — this storyboard has frames 1-${storyboard.scenes.length}`
      )
    }

    const scene = storyboard.scenes[sceneNumber - 1]

    logger.info(`[${requestId}] Editing storyboard frame`, {
      storyboardId: storyboard.id,
      sceneNumber,
      instruction: instruction.slice(0, 120),
    })

    const rewritten = await rewriteScenePrompt({
      scene,
      instruction,
      storyTopic: storyboard.topic,
      model: planningModel,
      apiKey: planningApiKey,
      provider: planningProvider,
    })

    const imageBody = buildImageToolBodyFromExecutionParams({
      provider: imageProvider,
      model: imageModel,
      apiKey: falApiKey,
      prompt: stylePrompt
        ? `${rewritten.prompt}\n\nOverall style: ${stylePrompt}`
        : rewritten.prompt,
      aspectRatio,
      workflowId: context.workflowId,
      workspaceId: context.workspaceId,
      userId: context.userId,
    })

    const image = await runImageToolGeneration(imageBody, {
      userId: context.userId ?? 'unknown',
      requestId: `${requestId}-edit${sceneNumber}`,
    })

    const updatedScenes = storyboard.scenes.map((s) =>
      s.index === scene.index
        ? sceneFromGeneratedImage({
            index: s.index,
            prompt: rewritten.prompt,
            description: rewritten.description,
            imageUrl: image.imageUrl,
            sourceUrl: image.sourceUrl,
          })
        : s
    )

    await db.execute(
      sql`UPDATE storyboards
          SET scenes = ${JSON.stringify(updatedScenes)}::jsonb
          WHERE id = ${storyboard.id}::uuid`
    )

    logger.info(`[${requestId}] Storyboard frame updated`, {
      storyboardId: storyboard.id,
      sceneNumber,
    })

    const frameLines = updatedScenes.map((s) => `${s.index}. ${s.description}`).join('\n')
    const content = `Frame ${sceneNumber} updated:\n\n${frameLines}\n\nAny other change, or reply "stitch" to make the video.`

    return {
      storyboardId: storyboard.id,
      conversationId,
      topic: storyboard.topic,
      scenes: updatedScenes,
      images: updatedScenes.map((s) => s.imageUrl),
      falUrls: falUrlsFromScenes(updatedScenes),
      sceneCount: updatedScenes.length,
      content,
    }
  }

  // Image mode: generate the image for ONE scene of the latest saved storyboard
  // using the prompt saved at plan time. Lets an app show frames one by one.
  if (mode === 'image') {
    const sceneNumber = clampSceneCount(params.sceneNumber)
    const storyboard = await loadLatestStoryboard(conversationId, context)
    if (sceneNumber > storyboard.scenes.length) {
      throw new Error(
        `Frame ${sceneNumber} does not exist — this storyboard has frames 1-${storyboard.scenes.length}`
      )
    }

    const scene = storyboard.scenes[sceneNumber - 1]

    logger.info(`[${requestId}] Generating single storyboard frame`, {
      storyboardId: storyboard.id,
      sceneNumber,
    })

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
      requestId: `${requestId}-i${sceneNumber}`,
    })

    const updatedScenes = storyboard.scenes.map((s) =>
      s.index === scene.index
        ? sceneFromGeneratedImage({
            index: s.index,
            prompt: s.prompt,
            description: s.description,
            imageUrl: image.imageUrl,
            sourceUrl: image.sourceUrl,
          })
        : s
    )

    await db.execute(
      sql`UPDATE storyboards
          SET scenes = ${JSON.stringify(updatedScenes)}::jsonb
          WHERE id = ${storyboard.id}::uuid`
    )

    return {
      storyboardId: storyboard.id,
      conversationId,
      topic: storyboard.topic,
      scenes: updatedScenes,
      images: updatedScenes.map((s) => s.imageUrl),
      falUrls: falUrlsFromScenes(updatedScenes),
      sceneCount: updatedScenes.length,
      content: `Frame ${sceneNumber} image generated.`,
    }
  }

  logger.info(`[${requestId}] Planning storyboard ${mode}`, {
    mode,
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
    mode,
  })

  // Plan mode: save the storyboard with prompts but no images. Returns in
  // seconds; the app then fills frames one by one with mode "image".
  if (mode === 'plan') {
    const scenes: StoryboardScene[] = planned.map((scene, i) => ({
      index: i + 1,
      prompt: scene.prompt,
      description: scene.description,
      imageUrl: '',
    }))

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
      throw new Error('Failed to persist storyboard plan')
    }

    logger.info(`[${requestId}] Storyboard plan saved (no images yet)`, {
      storyboardId,
      conversationId,
      sceneCount: scenes.length,
    })

    const sceneLines = scenes.map((s) => `${s.index}. ${s.description}`).join('\n')
    return {
      storyboardId,
      conversationId,
      topic,
      scenes,
      images: scenes.map(() => ''),
      falUrls: scenes.map(() => ''),
      sceneCount: scenes.length,
      content: `Storyboard plan for "${topic}" — ${scenes.length} scenes (images not generated yet):\n\n${sceneLines}`,
    }
  }

  logger.info(`[${requestId}] Generating scene images via Fal.ai`, { count: planned.length })

  // Concurrent on purpose: each image takes ~20s and Fal queues per key, so N
  // sequential scenes cost N×20s while parallel costs roughly one generation.
  // Promise.all keeps the all-or-nothing behaviour — a partial storyboard is
  // worse than a failed one.
  const scenes: StoryboardScene[] = await Promise.all(
    planned.map(async (scene, i) => {
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

      return sceneFromGeneratedImage({
        index: i + 1,
        prompt: scene.prompt,
        description: scene.description,
        imageUrl: image.imageUrl,
        sourceUrl: image.sourceUrl,
      })
    })
  )

  // Concepts are pitches to choose between, not scenes of a video. They are
  // deliberately NOT saved to `storyboards`, so the render step (which falls
  // back to the latest saved storyboard) can never turn them into a video.
  if (mode === 'concepts') {
    const conceptLines = scenes.map((s) => `${s.index}. ${s.description}`).join('\n')
    const content = `Here are ${scenes.length} ad concepts for "${topic}":\n\n${conceptLines}\n\nWhich concept do you want? Reply with a number 1-${scenes.length}. You can also add changes, for example "3 but at night".`

    logger.info(`[${requestId}] Concepts generated (not persisted)`, {
      conversationId,
      conceptCount: scenes.length,
    })

    return {
      storyboardId: '',
      conversationId,
      topic,
      scenes,
      images: scenes.map((s) => s.imageUrl),
      falUrls: falUrlsFromScenes(scenes),
      sceneCount: scenes.length,
      content,
    }
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
    falUrls: falUrlsFromScenes(scenes),
    sceneCount: scenes.length,
    content,
  }
}
