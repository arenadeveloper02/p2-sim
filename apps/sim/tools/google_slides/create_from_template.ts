import { createLogger } from '@sim/logger'
import type { ToolConfig } from '@/tools/types'
import { getTemplateMasterSchema } from './templates'
import type { PresentationSchema } from './templates/schema'

const logger = createLogger('GoogleSlidesCreateFromTemplate')

/** Generate a Google Slides–style object ID (alphanumeric + underscores). */
function generateObjectId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789_'
  let id = 'g'
  for (let i = 0; i < 21; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

interface CreateFromTemplateParams {
  accessToken: string
  presentationName: string
  schemaJson: string
}

interface CreateFromTemplateResponse {
  success: boolean
  output: {
    presentationId: string
    title: string
    url: string
    slidesCreated: number
  }
}

interface BlockLike {
  type: string
  role?: string
  shapeId: string
  content?: string | string[]
}

interface SlideLike {
  order: number
  templateSlideObjectId: string
  blocks: BlockLike[]
}

// --- NEW: Exponential Backoff Wrapper ---
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 4
): Promise<Response> {
  let delay = 1000
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, options)
    // Retry on Rate Limit (429) or Server Errors (5xx)
    if (res.status === 429 || res.status >= 500) {
      const jitter = Math.random() * 500
      logger.warn(`API error (${res.status}). Retrying in ${Math.round(delay + jitter)}ms...`, {
        url,
      })
      await new Promise((resolve) => setTimeout(resolve, delay + jitter))
      delay *= 2 // Exponential backoff
      continue
    }
    return res
  }
  // Final attempt
  return fetch(url, options)
}

function parseSchema(schemaJson: string): PresentationSchema {
  let parsed: unknown
  try {
    parsed = JSON.parse(schemaJson)
  } catch (err) {
    logger.error('Schema JSON parse failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    throw new Error('Invalid JSON: schema must be valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || !('id' in parsed) || !('slides' in parsed)) {
    throw new Error('Schema must have id and slides')
  }
  const schema = parsed as PresentationSchema
  if (!Array.isArray(schema.slides)) {
    throw new Error('Schema slides must be an array')
  }
  return schema
}

function validateTemplateId(schema: PresentationSchema): void {
  const templateVersion = schema.templateVersion || 'position2_2026'
  const master = getTemplateMasterSchema(templateVersion)
  if (master.id !== schema.id) {
    logger.error('Schema template id mismatch', {
      schemaId: schema.id,
      templateVersion,
      expectedId: master.id,
    })
    throw new Error(
      `Schema id "${schema.id}" does not match template id "${master.id}" for template "${templateVersion}"`
    )
  }
}

// --- NEW: Helper to find text boundaries for lists ---
function buildTextEndIndexMap(presentationData: any): Record<string, number> {
  const map: Record<string, number> = {}
  const slides = presentationData.slides || []
  for (const slide of slides) {
    for (const el of slide.pageElements || []) {
      if (el.shape?.text?.textElements) {
        let maxIndex = 1
        for (const te of el.shape.text.textElements) {
          if (te.endIndex != null && te.endIndex > maxIndex) {
            maxIndex = te.endIndex
          }
        }
        map[el.objectId] = maxIndex
      }
    }
  }
  return map
}

async function duplicatePresentation(
  accessToken: string,
  sourcePresentationId: string,
  title: string
): Promise<string> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${sourcePresentationId}/copy`)
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('fields', 'id,name,mimeType,webViewLink,parents,createdTime,modifiedTime')

  const res = await fetchWithRetry(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: title }),
  })
  const data = await res.json()
  if (!res.ok) {
    logger.error('Duplicate presentation failed', {
      sourcePresentationId,
      title,
      status: res.status,
      error: data.error?.message,
    })
    throw new Error(data.error?.message || 'Failed to duplicate presentation')
  }
  logger.info('Presentation duplicated', {
    sourcePresentationId,
    title,
    newPresentationId: data.id,
  })
  return data.id
}

async function getPresentationSlides(
  accessToken: string,
  presentationId: string
): Promise<{ objectId: string }[]> {
  const res = await fetchWithRetry(
    `https://slides.googleapis.com/v1/presentations/${presentationId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
  const data = await res.json()
  if (!res.ok) {
    logger.error('Get presentation slides failed', {
      presentationId,
      status: res.status,
      error: data.error?.message,
    })
    throw new Error(data.error?.message || 'Failed to read presentation')
  }
  return (data.slides || []).map((s: { objectId: string }) => ({
    objectId: s.objectId,
  }))
}

async function duplicateSlide(
  accessToken: string,
  presentationId: string,
  slideObjectId: string,
  objectIds: Record<string, string>
): Promise<string> {
  const res = await fetchWithRetry(
    `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            duplicateObject: {
              objectId: slideObjectId,
              objectIds,
            },
          },
        ],
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) {
    logger.error('Duplicate slide failed', {
      presentationId,
      slideObjectId,
      status: res.status,
      error: data.error?.message,
    })
    throw new Error(data.error?.message || 'Failed to duplicate slide')
  }

  const newSlideId = data.replies?.[0]?.duplicateObject?.objectId
  if (!newSlideId) {
    logger.error('Duplicate slide response missing object ID', { presentationId, slideObjectId })
    throw new Error('Duplicate slide did not return object ID')
  }

  logger.info('Slide duplicated', {
    presentationId,
    sourceSlideId: slideObjectId,
    newSlideId,
    shapeMappings: Object.keys(objectIds).length,
  })

  // Reorder slide to the end
  const totalSlides = (await getPresentationSlides(accessToken, presentationId)).length
  const reorderRes = await fetchWithRetry(
    `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            updateSlidesPosition: {
              slideObjectIds: [newSlideId],
              insertionIndex: totalSlides,
            },
          },
        ],
      }),
    }
  )
  if (!reorderRes.ok) {
    const errData = await reorderRes.json()
    logger.warn('Failed to reorder duplicated slide to end', { error: errData })
  }
  return newSlideId
}

export const createFromTemplateTool: ToolConfig<
  CreateFromTemplateParams,
  CreateFromTemplateResponse
> = {
  id: 'google_slides_create_from_template',
  name: 'Create Presentation from Template',
  description:
    'Create a new presentation from a template: duplicate the template by id, duplicate slides as needed, then replace text, images, and lists from the provided schema JSON.',
  version: '1.0',

  oauth: {
    required: true,
    provider: 'google-drive',
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'The access token for the Google Slides API',
    },
    presentationName: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Title for the new presentation',
    },
    schemaJson: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Valid JSON schema (id, templateVersion, slides with templateSlideObjectId and blocks with shapeId and content)',
    },
  },

  request: {
    url: '/api/tools/google_slides/create_from_template',
    method: 'POST',
    headers: () => ({}),
  },

  directExecution: async (
    params: CreateFromTemplateParams
  ): Promise<CreateFromTemplateResponse> => {
    const accessToken = params.accessToken?.trim()
    const presentationName = (params.presentationName ?? '').trim()
    if (!accessToken) {
      throw new Error('Access token is required')
    }
    if (!presentationName) {
      throw new Error('Presentation name is required')
    }

    logger.info('Create from template started', {
      presentationName,
      schemaJsonLength: params.schemaJson?.length ?? 0,
    })

    const schema = parseSchema(params.schemaJson)
    validateTemplateId(schema)

    logger.info('Schema validated', {
      templateId: schema.id,
      templateVersion: schema.templateVersion,
      slideCount: schema.slides.length,
    })

    // 1. Duplicate Presentation
    const presentationId = await duplicatePresentation(accessToken, schema.id, presentationName)

    // Keep track of the original template slides so we can delete them at the end
    const originalSlidesToDelete = (await getPresentationSlides(accessToken, presentationId)).map(
      (s) => s.objectId
    )

    logger.info('Original slides to delete after content fill', {
      presentationId,
      originalSlideCount: originalSlidesToDelete.length,
    })

    const slidesOrdered = [...schema.slides]
    const slideIndexToShapeMap: Record<string, string>[] = []

    // 2. Duplicate Slides (creates layout, maps objects)
    for (const slideSchema of slidesOrdered) {
      const templateSlideId = (slideSchema as SlideLike).templateSlideObjectId
      const blocks = (slideSchema as SlideLike).blocks || []

      const objectIds: Record<string, string> = {}
      for (const b of blocks) {
        if (b.shapeId) {
          objectIds[b.shapeId] = generateObjectId()
        }
      }
      await duplicateSlide(accessToken, presentationId, templateSlideId, objectIds)
      slideIndexToShapeMap.push(objectIds)
    }

    logger.info('Fetching presentation state to build list maps', { presentationId })

    // 3. Fetch the presentation EXACTLY ONCE to get text endIndexes for lists
    const presRes = await fetchWithRetry(
      `https://slides.googleapis.com/v1/presentations/${presentationId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )
    const presData = await presRes.json()
    if (!presRes.ok) {
      throw new Error(presData.error?.message || 'Failed to read presentation state for mapping')
    }
    const textEndIndexMap = buildTextEndIndexMap(presData)

    // 4. Build a single massive batch of requests for ALL content replacements
    logger.info('Preparing batch content replacements', {
      presentationId,
      slideCount: slidesOrdered.length,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batchRequests: any[] = []

    for (let s = 0; s < slidesOrdered.length; s++) {
      const slideSchema = slidesOrdered[s] as SlideLike
      const shapeMap = slideIndexToShapeMap[s] ?? {}
      const blocks = slideSchema.blocks || []

      for (const block of blocks) {
        const objectId = shapeMap[block.shapeId] ?? block.shapeId
        if (!objectId) continue

        const isList = block.type === 'TEXT' && (block as BlockLike).role === 'LIST'
        const content = block.content

        if (block.type === 'TEXT' && !isList) {
          const text = typeof content === 'string' ? content : ''
          if (text) {
            batchRequests.push({ deleteText: { objectId, textRange: { type: 'ALL' } } })
            batchRequests.push({ insertText: { objectId, insertionIndex: 0, text } })
          }
        } else if (block.type === 'IMAGE' && content) {
          const imageUrl = typeof content === 'string' ? content : ''
          if (imageUrl) {
            batchRequests.push({ replaceImage: { imageObjectId: objectId, url: imageUrl } })
          }
        } else if (isList && Array.isArray(content) && content.length > 0) {
          const listText = content.join('\n')
          const endIndex = textEndIndexMap[objectId] || 1 // Fallback to 1 if not found

          batchRequests.push({
            deleteText: {
              objectId,
              textRange: { type: 'FIXED_RANGE', startIndex: 0, endIndex: endIndex - 1 },
            },
          })
          batchRequests.push({ insertText: { objectId, insertionIndex: 0, text: listText } })
        }
      }
    }

    // 5. Append original slide deletions to the same batch payload
    for (const objectId of originalSlidesToDelete) {
      batchRequests.push({ deleteObject: { objectId } })
    }

    // 6. Execute ALL content replacements and deletions in ONE network call
    if (batchRequests.length > 0) {
      logger.info('Executing master batch update', {
        presentationId,
        requestCount: batchRequests.length,
      })

      const batchRes = await fetchWithRetry(
        `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requests: batchRequests }),
        }
      )

      if (!batchRes.ok) {
        const errData = await batchRes.json()
        logger.error('Master batch update failed', {
          presentationId,
          status: batchRes.status,
          error: errData.error?.message,
        })
        throw new Error(errData.error?.message || 'Failed to apply template updates')
      }
    }

    logger.info('Create from template completed', {
      presentationId,
      title: presentationName,
      slidesCreated: slidesOrdered.length,
    })

    return {
      success: true,
      output: {
        presentationId,
        title: presentationName,
        url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
        slidesCreated: slidesOrdered.length,
      },
    }
  },

  outputs: {
    presentationId: { type: 'string', description: 'The new presentation ID' },
    title: { type: 'string', description: 'The presentation title' },
    url: { type: 'string', description: 'URL to open the presentation' },
    slidesCreated: { type: 'number', description: 'Number of slides created' },
  },
}
