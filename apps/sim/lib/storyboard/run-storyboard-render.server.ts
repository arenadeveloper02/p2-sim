/**
 * Server-only storyboard rendering.
 *
 * Loads the storyboard saved for a conversation, applies the user's scene
 * order (e.g. "3,1,2"), generates one Fal.ai image-to-video clip per scene,
 * stitches the clips with FFmpeg, stores the final video, and marks the
 * storyboard row as rendered.
 *
 * Kept out of the ToolConfig because the tools registry is imported by client
 * bundles; a static import of db/ffmpeg/fal server modules breaks the client
 * build. Execution is wired in `tools/index.ts` via dynamic import.
 */

import { db } from '@sim/db'
import { createLogger } from '@sim/logger'
import { generateShortId } from '@sim/utils/id'
import { sql } from 'drizzle-orm'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { generateFalVideo } from '@/lib/media/falai-video'
import { type MediaFile, runFfmpegOperation } from '@/lib/media/ffmpeg'
import type { StoryboardScene } from '@/lib/storyboard/run-storyboard-generate.server'
import {
  downloadFile,
  generatePresignedDownloadUrl,
  uploadFile,
} from '@/lib/uploads/core/storage-service'

const logger = createLogger('StoryboardRender')

/** Image-to-video capable Fal.ai models (must have an i2vEndpoint in falai-video.ts). */
const I2V_MODELS = new Set([
  'minimax-h3',
  'veo-3.1',
  'veo-3.1-fast',
  'veo-3.1-lite',
  'seedance-2.0',
  'seedance-2.0-fast',
  'kling-v3-pro',
])
const DEFAULT_RENDER_MODEL = 'veo-3.1-fast'
const DEFAULT_CLIP_DURATION = 4

/**
 * Per-clip seconds each model actually accepts. A requested duration is snapped
 * to the closest supported value rather than rejected, so a target length like
 * "60 seconds" still renders on models with a coarse duration menu (Veo).
 */
const MODEL_CLIP_DURATIONS: Record<string, number[]> = {
  'minimax-h3': [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  'veo-3.1': [4, 6, 8],
  'veo-3.1-fast': [4, 6, 8],
  'veo-3.1-lite': [4, 6, 8],
  'seedance-2.0': [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  'seedance-2.0-fast': [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  'kling-v3-pro': [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
}

function snapClipDuration(model: string, seconds: number): number {
  const allowed = MODEL_CLIP_DURATIONS[model]
  if (!allowed?.length) return Math.trunc(seconds)
  return allowed.reduce((best, option) =>
    Math.abs(option - seconds) < Math.abs(best - seconds) ? option : best
  )
}

export interface RunStoryboardRenderResult {
  /** Sim-hosted serve URL. Requires a logged-in Sim session. */
  videoUrl: string
  /**
   * Publicly fetchable URL of the final video (presigned cloud URL, or the Fal
   * CDN URL when the video is a single un-stitched clip). External UIs should
   * play this one. Presigned URLs expire after PUBLIC_VIDEO_URL_TTL_SECONDS.
   */
  publicVideoUrl?: string
  /** Public Fal CDN URL per clip, in the rendered scene order ('' when unavailable). */
  falUrls: string[]
  storyboardId: string
  conversationId: string
  topic: string
  order: number[]
  clipCount: number
  model: string
  content: string
}

/** 7 days — the maximum S3 presign lifetime. */
const PUBLIC_VIDEO_URL_TTL_SECONDS = 7 * 24 * 60 * 60

export interface RunStoryboardRenderContext {
  userId?: string
  workspaceId?: string
  workflowId?: string
  requestId?: string
}

interface StoryboardRow {
  id: string
  topic: string | null
  scenes: StoryboardScene[]
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Parses "3,1,2" (or "3 1 2") into validated 1-based scene indexes. */
function parseSceneOrder(orderInput: string, sceneCount: number): number[] {
  if (!orderInput) {
    return Array.from({ length: sceneCount }, (_, i) => i + 1)
  }

  const parts = orderInput.split(/[^0-9]+/).filter(Boolean)
  if (parts.length === 0) {
    return Array.from({ length: sceneCount }, (_, i) => i + 1)
  }

  const order = parts.map((p) => Number.parseInt(p, 10))
  const seen = new Set<number>()
  for (const index of order) {
    if (!Number.isFinite(index) || index < 1 || index > sceneCount) {
      throw new Error(
        `Scene order "${orderInput}" contains ${index}, but this storyboard has scenes 1-${sceneCount}`
      )
    }
    if (seen.has(index)) {
      throw new Error(`Scene order "${orderInput}" repeats scene ${index}`)
    }
    seen.add(index)
  }
  return order
}

/** Downloads a stored scene image (serve URL or external URL) as a data URI. */
async function fetchImageAsDataUri(imageUrl: string): Promise<string> {
  const serveMarker = '/api/files/serve/'
  const mimeFromUrl = imageUrl.toLowerCase().endsWith('.jpg')
    ? 'image/jpeg'
    : imageUrl.toLowerCase().endsWith('.webp')
      ? 'image/webp'
      : 'image/png'

  if (imageUrl.includes(serveMarker)) {
    const key = decodeURIComponent(
      imageUrl.slice(imageUrl.indexOf(serveMarker) + serveMarker.length)
    )
    const buffer = await downloadFile({ key, context: 'agent-generated-images' })
    return `data:${mimeFromUrl};base64,${buffer.toString('base64')}`
  }

  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`Failed to download scene image (${response.status}): ${imageUrl}`)
  }
  const mime = response.headers.get('content-type') || mimeFromUrl
  const buffer = Buffer.from(await response.arrayBuffer())
  return `data:${mime};base64,${buffer.toString('base64')}`
}

/**
 * Prefers the Sim-hosted copy, then the public Fal CDN URL if the serve path fails.
 * Older storyboards only have imageUrl; those still work via S3.
 */
async function fetchSceneImageAsDataUri(scene: StoryboardScene): Promise<string> {
  const candidates = [scene.imageUrl, scene.falUrl].filter(
    (url): url is string => typeof url === 'string' && url.trim().length > 0
  )
  if (candidates.length === 0) {
    throw new Error(`Scene ${scene.index} is missing an image URL`)
  }

  let lastError: unknown
  for (const url of candidates) {
    try {
      return await fetchImageAsDataUri(url)
    } catch (error) {
      lastError = error
      logger.warn('Scene image download failed, trying next URL', {
        sceneIndex: scene.index,
        url: url.slice(0, 120),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to download image for scene ${scene.index}`)
}

/**
 * Accepts clip URLs as a real array, a JSON array string, or a comma/space/
 * newline separated string — whatever shape the Agent or an API caller sends.
 */
function parseClipUrls(value: unknown): string[] {
  const fromArray = (items: unknown[]): string[] =>
    items.map((item) => asString(item)).filter((url) => url.startsWith('http'))

  if (Array.isArray(value)) return fromArray(value)

  const raw = asString(value)
  if (!raw) return []
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return fromArray(parsed)
    } catch {
      // fall through to the separator-based parse
    }
  }
  return raw.split(/[\s,]+/).filter((url) => url.startsWith('http'))
}

/** Downloads a clip (Sim serve URL or external URL) as a buffer. */
async function downloadClipBuffer(clipUrl: string): Promise<Buffer> {
  const serveMarker = '/api/files/serve/'
  if (clipUrl.includes(serveMarker)) {
    const key = decodeURIComponent(clipUrl.slice(clipUrl.indexOf(serveMarker) + serveMarker.length))
    return downloadFile({ key, context: 'agent-generated-images' })
  }

  const response = await fetch(clipUrl)
  if (!response.ok) {
    throw new Error(`Failed to download clip (${response.status}): ${clipUrl.slice(0, 120)}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Uploads the final MP4 to Sim storage and best-effort presigns a public link.
 * The render must not fail because a share link could not be built.
 */
async function storeFinalVideo(
  buffer: Buffer,
  context: RunStoryboardRenderContext,
  requestId: string
): Promise<{ videoUrl: string; presignedUrl?: string }> {
  const safeSegment = (v: string | undefined) =>
    (v || 'unknown').replace(/[/\\\0]/g, '').replace(/\.\./g, '') || 'unknown'
  const key = `agent-generated-images/${safeSegment(context.workflowId)}/${safeSegment(
    context.userId
  )}/storyboard-video-${Date.now()}-${generateShortId()}.mp4`

  const fileInfo = await uploadFile({
    file: buffer,
    fileName: key,
    contentType: 'video/mp4',
    context: 'agent-generated-images',
    preserveKey: true,
    metadata: {
      workflowId: context.workflowId ?? '',
      userId: context.userId ?? '',
      purpose: 'storyboard-rendered-video',
    },
  })
  const videoUrl = `${getBaseUrl()}${fileInfo.path}`

  let presignedUrl: string | undefined
  try {
    presignedUrl = await generatePresignedDownloadUrl(
      key,
      'agent-generated-images',
      PUBLIC_VIDEO_URL_TTL_SECONDS
    )
    if (presignedUrl.includes('/api/files/serve/')) {
      // Local storage has no presigning — the serve URL is session-gated, not public.
      presignedUrl = undefined
    }
  } catch (error) {
    logger.warn(`[${requestId}] Could not presign final video URL`, {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return { videoUrl, presignedUrl }
}

type StoryboardQueryRow = { id: string; topic: string | null; scenes: unknown }

/**
 * Finds the storyboard to render.
 *
 * The chat's conversation id is not part of the tool `_context`, so when the
 * Agent calls this tool the field is often empty. Rather than failing, fall
 * back to the most recent storyboard for this workflow (and user), which is
 * what the generate step keys on in the same situation.
 */
async function loadStoryboard(
  storyboardId: string,
  conversationId: string,
  context: RunStoryboardRenderContext
): Promise<StoryboardRow> {
  const attempts: Array<() => Promise<unknown>> = []

  if (storyboardId) {
    attempts.push(() =>
      db.execute(
        sql`SELECT id, topic, scenes FROM storyboards WHERE id = ${storyboardId}::uuid LIMIT 1`
      )
    )
  }

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
    throw new Error(
      storyboardId
        ? `No storyboard found with id ${storyboardId}`
        : 'No storyboard found yet. Generate a storyboard before rendering the video.'
    )
  }

  const scenes = (
    typeof row.scenes === 'string' ? JSON.parse(row.scenes) : row.scenes
  ) as StoryboardScene[]
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('The saved storyboard has no scenes')
  }

  return { id: row.id, topic: row.topic, scenes }
}

/**
 * Renders the final video for a saved storyboard in the user's chosen order.
 */
export async function runStoryboardRender(
  params: Record<string, unknown>,
  context: RunStoryboardRenderContext
): Promise<RunStoryboardRenderResult> {
  const requestId = context.requestId ?? crypto.randomUUID().slice(0, 8)

  // Concat mode: join already-generated, user-approved clips in the given
  // order. No storyboard lookup and no model calls — pure final assembly.
  const clipUrls = parseClipUrls(params.clipUrls)
  if (clipUrls.length > 0) {
    logger.info(`[${requestId}] Concat mode: joining ${clipUrls.length} approved clips`)

    const buffers = await Promise.all(clipUrls.map(downloadClipBuffer))
    const clips: MediaFile[] = buffers.map((buffer) => ({ buffer, mimeType: 'video/mp4' }))

    let finalBuffer: Buffer
    if (clips.length === 1) {
      finalBuffer = clips[0].buffer
    } else {
      const stitched = await runFfmpegOperation('concat', clips)
      if (!stitched.buffer) {
        throw new Error('FFmpeg concat produced no output')
      }
      finalBuffer = stitched.buffer
    }

    const stored = await storeFinalVideo(finalBuffer, context, requestId)
    const publicInputUrls = clipUrls.map((url) => (url.includes('/api/files/serve/') ? '' : url))
    const publicVideoUrl =
      clips.length === 1 && publicInputUrls[0] ? publicInputUrls[0] : stored.presignedUrl

    logger.info(`[${requestId}] Concat complete`, {
      clipCount: clips.length,
      videoUrl: stored.videoUrl,
      bytes: finalBuffer.length,
    })

    return {
      videoUrl: stored.videoUrl,
      ...(publicVideoUrl ? { publicVideoUrl } : {}),
      falUrls: publicInputUrls,
      storyboardId: '',
      conversationId: asString(params.conversationId),
      topic: 'approved clips',
      order: clipUrls.map((_, i) => i + 1),
      clipCount: clips.length,
      model: 'concat',
      content: `Final video assembled from ${clips.length} approved clip${
        clips.length === 1 ? '' : 's'
      }.\n\n[Watch the video](${stored.videoUrl})`,
    }
  }

  const conversationId = asString(params.conversationId)
  const storyboardId = asString(params.storyboardId)

  const model = asString(params.videoModel) || DEFAULT_RENDER_MODEL
  if (!I2V_MODELS.has(model)) {
    throw new Error(
      `Model ${model} does not support image-to-video. Use one of: ${[...I2V_MODELS].join(', ')}`
    )
  }

  const resolution = asString(params.resolution) || '720p'
  const generateAudio = params.generateAudio === true || params.generateAudio === 'true'

  const storyboard = await loadStoryboard(storyboardId, conversationId, context)

  // Single-scene mode: render ONE scene's clip (the per-frame approval flow).
  // Distinct from `order`, which renders ALL scenes in a given sequence, and
  // from `clipUrls`, which only joins existing clips.
  const sceneNumberRaw = Number(params.sceneNumber)
  const singleScene = Number.isFinite(sceneNumberRaw) && sceneNumberRaw > 0
  if (singleScene && Math.trunc(sceneNumberRaw) > storyboard.scenes.length) {
    throw new Error(
      `Scene ${Math.trunc(sceneNumberRaw)} does not exist — this storyboard has scenes 1-${storyboard.scenes.length}`
    )
  }

  const order = singleScene
    ? [Math.trunc(sceneNumberRaw)]
    : parseSceneOrder(asString(params.order), storyboard.scenes.length)
  const orderedScenes = order.map((index) => storyboard.scenes[index - 1])

  // A requested total length wins over the per-scene setting: the user asks for
  // "a 60 second video", not for "8 seconds per scene".
  const targetDurationRaw = Number(params.targetDuration)
  const clipDurationRaw = Number(params.clipDuration)
  const requestedClipSeconds =
    Number.isFinite(targetDurationRaw) && targetDurationRaw > 0
      ? targetDurationRaw / orderedScenes.length
      : Number.isFinite(clipDurationRaw) && clipDurationRaw > 0
        ? clipDurationRaw
        : DEFAULT_CLIP_DURATION
  const clipDuration = snapClipDuration(model, requestedClipSeconds)

  logger.info(`[${requestId}] Rendering storyboard`, {
    storyboardId: storyboard.id,
    order,
    model,
    clipDuration,
    targetDuration: Number.isFinite(targetDurationRaw) ? targetDurationRaw : undefined,
    estimatedTotalSeconds: clipDuration * orderedScenes.length,
    resolution,
  })

  // Sequential on purpose: each clip is expensive and Fal queues per key;
  // failing fast on clip N beats paying for N parallel failures.
  const clips: MediaFile[] = []
  const clipFalUrls: string[] = []
  for (let i = 0; i < orderedScenes.length; i++) {
    const scene = orderedScenes[i]
    logger.info(`[${requestId}] Generating clip ${i + 1}/${orderedScenes.length}`, {
      sceneIndex: scene.index,
    })

    const imageDataUri = await fetchSceneImageAsDataUri(scene)
    const clip = await generateFalVideo({
      prompt: scene.prompt,
      model,
      duration: clipDuration,
      resolution,
      generateAudio,
      imageDataUri,
    })

    clips.push({ buffer: clip.buffer, mimeType: clip.contentType })
    clipFalUrls.push(clip.sourceUrl ?? '')
  }

  let finalBuffer: Buffer
  if (clips.length === 1) {
    finalBuffer = clips[0].buffer
  } else {
    logger.info(`[${requestId}] Stitching ${clips.length} clips with FFmpeg`)
    const stitched = await runFfmpegOperation('concat', clips)
    if (!stitched.buffer) {
      throw new Error('FFmpeg concat produced no output')
    }
    finalBuffer = stitched.buffer
  }

  const stored = await storeFinalVideo(finalBuffer, context, requestId)
  const videoUrl = stored.videoUrl

  // A public URL for the final video: single clip → its Fal CDN URL; stitched
  // output only exists in Sim storage, so use the presigned link.
  const publicVideoUrl = clips.length === 1 && clipFalUrls[0] ? clipFalUrls[0] : stored.presignedUrl

  // A single-scene clip is a preview for approval, not the final video — it
  // must not flip the storyboard to 'rendered' or overwrite its video_url.
  if (!singleScene) {
    await db.execute(
      sql`UPDATE storyboards
          SET status = 'rendered',
              final_order = ${JSON.stringify(order)}::jsonb,
              video_url = ${videoUrl},
              rendered_at = now(),
              updated_at = now()
          WHERE id = ${storyboard.id}::uuid`
    )
  }

  logger.info(`[${requestId}] Storyboard rendered`, {
    storyboardId: storyboard.id,
    videoUrl,
    clipCount: clips.length,
    bytes: finalBuffer.length,
  })

  const topic = storyboard.topic || 'your video'
  const content = singleScene
    ? `Clip for scene ${order[0]} is ready.\n\n[Watch the clip](${videoUrl})`
    : `Your video for "${topic}" is ready (${clips.length} scene${
        clips.length === 1 ? '' : 's'
      }, order ${order.join(',')}).\n\n[Watch the video](${videoUrl})`

  return {
    videoUrl,
    ...(publicVideoUrl ? { publicVideoUrl } : {}),
    falUrls: clipFalUrls,
    storyboardId: storyboard.id,
    conversationId,
    topic,
    order,
    clipCount: clips.length,
    model,
    content,
  }
}
