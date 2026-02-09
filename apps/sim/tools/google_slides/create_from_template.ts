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

async function duplicatePresentation(
  accessToken: string,
  sourcePresentationId: string,
  title: string
): Promise<string> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${sourcePresentationId}/copy`)
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('fields', 'id,name,mimeType,webViewLink,parents,createdTime,modifiedTime')
  const res = await fetch(url.toString(), {
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
  const res = await fetch(`https://slides.googleapis.com/v1/presentations/${presentationId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) {
    logger.error('Get presentation slides failed', {
      presentationId,
      status: res.status,
      error: data.error?.message,
    })
    throw new Error(data.error?.message || 'Failed to read presentation')
  }
  const slides = (data.slides || []).map((s: { objectId: string }) => ({
    objectId: s.objectId,
  }))
  return slides
}

async function deleteSlides(
  accessToken: string,
  presentationId: string,
  slideObjectIds: string[]
): Promise<void> {
  if (slideObjectIds.length === 0) return
  const res = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: slideObjectIds.map((objectId) => ({
          deleteObject: { objectId },
        })),
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) {
    logger.error('Delete slides failed', {
      presentationId,
      slideCount: slideObjectIds.length,
      status: res.status,
      error: data.error?.message,
    })
    throw new Error(data.error?.message || 'Failed to delete slides')
  }
  logger.info('Original slides deleted', {
    presentationId,
    deletedCount: slideObjectIds.length,
  })
}

async function duplicateSlide(
  accessToken: string,
  presentationId: string,
  slideObjectId: string,
  objectIds: Record<string, string>
): Promise<string> {
  const res = await fetch(
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
  const totalSlides = (await getPresentationSlides(accessToken, presentationId)).length
  const reorderRes = await fetch(
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

async function replaceText(
  accessToken: string,
  presentationId: string,
  objectId: string,
  text: string
): Promise<void> {
  const res = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          { deleteText: { objectId, textRange: { type: 'ALL' } } },
          { insertText: { objectId, insertionIndex: 0, text } },
        ],
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) {
    logger.error('Replace text failed', {
      presentationId,
      objectId,
      status: res.status,
      error: data.error?.message,
    })
    throw new Error(data.error?.message || 'Failed to replace text')
  }
}

async function replaceImage(
  accessToken: string,
  presentationId: string,
  objectId: string,
  imageUrl: string
): Promise<void> {
  const res = await fetch(
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
            replaceImage: {
              imageObjectId: objectId,
              url: imageUrl,
            },
          },
        ],
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) {
    logger.error('Replace image failed', {
      presentationId,
      objectId,
      status: res.status,
      error: data.error?.message,
    })
    throw new Error(data.error?.message || 'Failed to replace image')
  }
}

async function replaceList(
  accessToken: string,
  presentationId: string,
  objectId: string,
  listItems: string[]
): Promise<void> {
  const getRes = await fetch(`https://slides.googleapis.com/v1/presentations/${presentationId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const presData = await getRes.json()
  if (!getRes.ok) {
    logger.error('Read presentation for list failed', {
      presentationId,
      objectId,
      status: getRes.status,
      error: presData.error?.message,
    })
    throw new Error(presData.error?.message || 'Failed to read presentation for list')
  }
  const slides = presData.slides || []
  let textEndIndex = 0
  for (const slide of slides) {
    for (const el of slide.pageElements || []) {
      if (el.objectId === objectId && el.shape?.text?.textElements) {
        for (const te of el.shape.text.textElements) {
          if (te.endIndex != null && te.endIndex > textEndIndex) {
            textEndIndex = te.endIndex
          }
        }
        break
      }
    }
  }
  if (textEndIndex === 0) {
    textEndIndex = 1
  }
  const listText = listItems.map((item) => `${item}\n`).join('')
  const res = await fetch(
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
            deleteText: {
              objectId,
              textRange: { type: 'FIXED_RANGE', startIndex: 0, endIndex: textEndIndex - 1 },
            },
          },
          {
            insertText: { objectId, insertionIndex: 0, text: listText },
          },
        ],
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) {
    logger.error('Replace list failed', {
      presentationId,
      objectId,
      status: res.status,
      error: data.error?.message,
    })
    throw new Error(data.error?.message || 'Failed to replace list')
  }
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

    const presentationId = await duplicatePresentation(accessToken, schema.id, presentationName)

    const originalSlidesToDelete = (await getPresentationSlides(accessToken, presentationId)).map(
      (s) => s.objectId
    )
    logger.info('Original slides to delete after content fill', {
      presentationId,
      originalSlideCount: originalSlidesToDelete.length,
    })

    const slidesOrdered = [...schema.slides].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const slideIndexToShapeMap: Record<string, string>[] = []

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

    logger.info('Replacing content on slides', {
      presentationId,
      slideCount: slidesOrdered.length,
    })

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
            await replaceText(accessToken, presentationId, objectId, text)
          }
        } else if (block.type === 'IMAGE' && content) {
          const imageUrl = typeof content === 'string' ? content : ''
          if (imageUrl) {
            await replaceImage(accessToken, presentationId, objectId, imageUrl)
          }
        } else if (isList && Array.isArray(content) && content.length > 0) {
          await replaceList(accessToken, presentationId, objectId, content)
        }
      }
    }

    logger.info('Deleting original template slides', {
      presentationId,
      count: originalSlidesToDelete.length,
    })
    await deleteSlides(accessToken, presentationId, originalSlidesToDelete)

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
