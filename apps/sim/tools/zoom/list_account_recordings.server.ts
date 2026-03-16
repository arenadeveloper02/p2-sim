/**
 * Server-only implementation for Zoom list account recordings.
 * Uses secure fetch (DNS validation + IP pinning). Do not import from client code.
 */

import { createLogger } from '@sim/logger'
import {
  secureFetchWithPinnedIP,
  validateUrlWithDNS,
} from '@/lib/core/security/input-validation.server'
import type { ToolResponse } from '@/tools/types'
import { splitDateRange } from '@/tools/zoom/list_account_recordings'
import type { ZoomListAccountRecordingsParams } from '@/tools/zoom/types'

const logger = createLogger('zoom:list_account_recordings.server')

interface ZoomRecordingsPageResponse {
  meetings?: unknown[]
  from?: string
  to?: string
  page_size?: number
  total_records?: number
  next_page_token?: string
}

export async function fetchZoomRecordings(
  params: ZoomListAccountRecordingsParams,
  chunkFrom?: string,
  chunkTo?: string
): Promise<{
  recordings: unknown[]
  pageInfo: { from: string; to: string; pageSize: number; totalRecords: number }
}> {
  const baseUrl = `https://api.zoom.us/v2/accounts/me/recordings`
  const allRecordings: unknown[] = []
  let nextPageToken: string | undefined = params.nextPageToken
  let firstPageInfo: { from: string; to: string; pageSize: number; totalRecords: number } | null =
    null

  do {
    const queryParams = new URLSearchParams()
    if (chunkFrom) queryParams.append('from', chunkFrom)
    if (chunkTo) queryParams.append('to', chunkTo)
    if (params.pageSize) queryParams.append('page_size', String(params.pageSize))
    if (nextPageToken) queryParams.append('next_page_token', nextPageToken)

    const url = `${baseUrl}?${queryParams.toString()}`

    const urlValidation = await validateUrlWithDNS(url, 'zoomApiUrl')
    if (!urlValidation.isValid) {
      throw new Error(`Invalid Zoom API URL: ${urlValidation.error}`)
    }

    const response = await secureFetchWithPinnedIP(url, urlValidation.resolvedIP!, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.accessToken}`,
      },
      timeout: 300000,
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Zoom API error: ${response.status} ${response.statusText}`
      try {
        const errorData = JSON.parse(errorText) as { message?: string }
        errorMessage = errorData.message || errorMessage
      } catch {
        // use default
      }
      throw new Error(errorMessage)
    }

    const data = (await response.json()) as ZoomRecordingsPageResponse
    const meetings = data.meetings || []
    allRecordings.push(...meetings)

    if (!firstPageInfo) {
      firstPageInfo = {
        from: data.from || chunkFrom || '',
        to: data.to || chunkTo || '',
        pageSize: data.page_size || 0,
        totalRecords: data.total_records || 0,
      }
    }
    nextPageToken = data.next_page_token
  } while (nextPageToken)

  return {
    recordings: allRecordings,
    pageInfo: firstPageInfo || {
      from: chunkFrom || '',
      to: chunkTo || '',
      pageSize: 0,
      totalRecords: 0,
    },
  }
}

function mapRecording(recording: any) {
  return {
    uuid: recording.uuid,
    id: recording.id,
    account_id: recording.account_id,
    host_id: recording.host_id,
    topic: recording.topic,
    type: recording.type,
    start_time: recording.start_time,
    duration: recording.duration,
    total_size: recording.total_size,
    recording_count: recording.recording_count,
    share_url: recording.share_url,
    recording_files: recording.recording_files || [],
  }
}

/**
 * Runs the full list-account-recordings flow (chunking, secure fetch) on the server.
 * Used by the API route; do not call from client code.
 */
export async function executeListAccountRecordings(
  params: ZoomListAccountRecordingsParams
): Promise<ToolResponse> {
  const emptyOutput = {
    recordings: [] as ReturnType<typeof mapRecording>[],
    pageInfo: {
      from: params.from || '',
      to: params.to || '',
      pageSize: 0,
      totalRecords: 0,
    },
  }

  if (!params.from || !params.to) {
    try {
      const result = await fetchZoomRecordings(params)
      return {
        success: true,
        output: {
          recordings: result.recordings.map((r: any) => mapRecording(r)),
          pageInfo: result.pageInfo,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        output: emptyOutput,
      }
    }
  }

  const fromDate = new Date(params.from)
  const toDate = new Date(params.to)
  const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))

  if (daysDiff <= 30) {
    try {
      const result = await fetchZoomRecordings(params, params.from, params.to)
      return {
        success: true,
        output: {
          recordings: result.recordings.map((r: any) => mapRecording(r)),
          pageInfo: { ...result.pageInfo, from: params.from, to: params.to },
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        output: {
          ...emptyOutput,
          pageInfo: { from: params.from, to: params.to, pageSize: 0, totalRecords: 0 },
        },
      }
    }
  }

  const chunks = splitDateRange(params.from, params.to)
  const allRecordings: any[] = []

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    try {
      const chunkResult = await fetchZoomRecordings(params, chunk.from, chunk.to)
      allRecordings.push(...chunkResult.recordings)
    } catch (error) {
      logger.error('Error fetching recordings chunk', { chunk, error })
    }
  }

  const uniqueRecordings = Array.from(
    new Map(allRecordings.map((r: any) => [r.uuid, r])).values()
  ) as any[]

  return {
    success: true,
    output: {
      recordings: uniqueRecordings.map(mapRecording),
      pageInfo: {
        from: params.from,
        to: params.to,
        pageSize: uniqueRecordings.length,
        totalRecords: uniqueRecordings.length,
      },
    },
  }
}
