import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
import { RawFileInputArraySchema } from '@/lib/uploads/utils/file-schemas'
import { processFilesToUserFiles } from '@/lib/uploads/utils/file-utils'
import { downloadFileFromStorage } from '@/lib/uploads/utils/file-utils.server'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileSendChatMessageAPI')

const RequestSchema = z.object({
  chat_id: z.string().min(1),
  text: z.string().min(1),
  account_id: z.string().min(1),
  thread_id: z.string().optional(),
  quote_id: z.string().optional(),
  voice_message: z.string().optional(),
  video_message: z.string().optional(),
  attachments: z.union([RawFileInputArraySchema, z.string()]).optional(),
  typing_duration: z.string().optional(),
})

function appendIfNonEmpty(form: FormData, key: string, value: string | undefined) {
  if (value !== undefined && value.trim() !== '') {
    form.append(key, value.trim())
  }
}

/**
 * Proxies POST `/api/v1/chats/{chat_id}/messages` to Unipile as multipart form data.
 */
export async function POST(request: NextRequest) {
  const authResult = await checkInternalAuth(request, { requireWorkflowId: false })
  if (!authResult.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = env.UNIPILE_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'UNIPILE_API_KEY is not configured' }, { status: 503 })
  }

  const baseUrl = UNIPILE_BASE_URL.replace(/\/$/, '')

  try {
    const body = await request.json()
    const data = RequestSchema.parse(body)

    const form = new FormData()
    form.append('text', data.text)
    form.append('account_id', data.account_id.trim())
    appendIfNonEmpty(form, 'thread_id', data.thread_id)
    appendIfNonEmpty(form, 'quote_id', data.quote_id)
    appendIfNonEmpty(form, 'voice_message', data.voice_message)
    appendIfNonEmpty(form, 'video_message', data.video_message)
    if (Array.isArray(data.attachments) && data.attachments.length > 0) {
      const userFiles = processFilesToUserFiles(data.attachments, data.chat_id, logger)
      for (const userFile of userFiles) {
        const buffer = await downloadFileFromStorage(userFile, data.chat_id, logger)
        const blob = new Blob([new Uint8Array(buffer)], {
          type: userFile.type || 'application/octet-stream',
        })
        form.append('attachments', blob, userFile.name)
      }
    } else if (typeof data.attachments === 'string') {
      appendIfNonEmpty(form, 'attachments', data.attachments)
    }
    appendIfNonEmpty(form, 'typing_duration', data.typing_duration)

    const encoded = encodeURIComponent(data.chat_id.trim())
    const url = `${baseUrl}/api/v1/chats/${encoded}/messages`

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'X-API-KEY': apiKey,
      },
      body: form,
    })

    const responseText = await upstream.text()
    if (!upstream.ok) {
      logger.warn('Unipile send chat message failed', {
        status: upstream.status,
        snippet: responseText.slice(0, 500),
      })
      return NextResponse.json(
        { error: responseText || upstream.statusText || 'Unipile request failed' },
        { status: upstream.status }
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(responseText) as unknown
    } catch {
      logger.error('Unipile returned non-JSON for send chat message')
      return NextResponse.json({ error: 'Invalid JSON from Unipile' }, { status: 502 })
    }

    return NextResponse.json(parsed)
  } catch (error) {
    const message = error instanceof z.ZodError ? error.message : 'Invalid request body'
    logger.warn('Unipile send chat message validation failed', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
