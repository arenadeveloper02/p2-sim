import { createLogger } from '@sim/logger'
import { secureFetchWithPinnedIP, validateUrlWithDNS } from '@/lib/core/security/input-validation.server'
import type { ToolConfig, ToolResponse } from '@/tools/types'
import type {
  ZoomListAccountRecordingsParams,
  ZoomListAccountRecordingsResponse,
} from '@/tools/zoom/types'

const logger = createLogger('zoom:list_account_recordings')

/**
 * Format a date as yyyy-mm-dd
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Split a date range into 30-day chunks
 */
export function splitDateRange(from: string, to: string): Array<{ from: string; to: string }> {
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const chunks: Array<{ from: string; to: string }> = []

  let currentFrom = new Date(fromDate)

  while (currentFrom < toDate) {
    const chunkTo = new Date(currentFrom)
    chunkTo.setDate(chunkTo.getDate() + 29) // 30 days total (inclusive)

    // Don't exceed the original to date
    if (chunkTo > toDate) {
      chunkTo.setTime(toDate.getTime())
    }

    chunks.push({
      from: formatDate(currentFrom),
      to: formatDate(chunkTo),
    })

    // Move to next chunk (start from day after current chunk end)
    currentFrom = new Date(chunkTo)
    currentFrom.setDate(currentFrom.getDate() + 1)
  }

  return chunks
}

/**
 * Make a single API call to Zoom for a date range, handling pagination
 */
export async function fetchZoomRecordings(
  params: ZoomListAccountRecordingsParams,
  chunkFrom?: string,
  chunkTo?: string
): Promise<{ recordings: any[]; pageInfo: any }> {
  const baseUrl = `https://api.zoom.us/v2/accounts/me/recordings`
  const allRecordings: any[] = []
  let nextPageToken: string | undefined = params.nextPageToken
  let firstPageInfo: any = null

  do {
    const queryParams = new URLSearchParams()
    if (chunkFrom) {
      queryParams.append('from', chunkFrom)
    }
    if (chunkTo) {
      queryParams.append('to', chunkTo)
    }
    if (params.pageSize) {
      queryParams.append('page_size', String(params.pageSize))
    }
    if (nextPageToken) {
      queryParams.append('next_page_token', nextPageToken)
    }

    const url = `${baseUrl}?${queryParams.toString()}`

    // Validate and fetch with DNS pinning
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
      timeout: 300000, // 5 minutes
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Zoom API error: ${response.status} ${response.statusText}`
      try {
        const errorData = JSON.parse(errorText)
        errorMessage = errorData.message || errorMessage
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage)
    }

    const data = await response.json()
    const meetings = data.meetings || []
    allRecordings.push(...meetings)

    // Store page info from first page
    if (!firstPageInfo) {
      firstPageInfo = {
        from: data.from || chunkFrom || '',
        to: data.to || chunkTo || '',
        pageSize: data.page_size || 0,
        totalRecords: data.total_records || 0,
      }
    }

    // Check for next page
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

export const zoomListAccountRecordingsTool: ToolConfig<
  ZoomListAccountRecordingsParams,
  ZoomListAccountRecordingsResponse
> = {
  id: 'zoom_list_account_recordings',
  name: 'Zoom List Account Recordings',
  description: 'List all cloud recordings for a Zoom account',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'zoom',
    requiredScopes: ['recording:read:list_account_recordings', 'recording:read:admin'],
  },

  params: {
    from: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Start date in yyyy-mm-dd format (within last 6 months). Date ranges exceeding 30 days will be automatically split into 30-day chunks and all recordings will be combined.',
    },
    to: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'End date in yyyy-mm-dd format. Date ranges exceeding 30 days will be automatically split into 30-day chunks and all recordings will be combined.',
    },
    pageSize: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Number of records per page (max 300)',
    },
    nextPageToken: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Token for pagination to get next page of results',
    },
  },

  request: {
    url: (params) => {
      const baseUrl = `https://api.zoom.us/v2/accounts/me/recordings`
      const queryParams = new URLSearchParams()

      if (params.from) {
        queryParams.append('from', params.from)
      }
      if (params.to) {
        queryParams.append('to', params.to)
      }
      if (params.pageSize) {
        queryParams.append('page_size', String(params.pageSize))
      }
      if (params.nextPageToken) {
        queryParams.append('next_page_token', params.nextPageToken)
      }

      const queryString = queryParams.toString()
      return queryString ? `${baseUrl}?${queryString}` : baseUrl
    },
    method: 'GET',
    headers: (params) => {
      if (!params.accessToken) {
        throw new Error('Missing access token for Zoom API request')
      }
      return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.accessToken}`,
      }
    },
  },

  directExecution: async (params: ZoomListAccountRecordingsParams): Promise<ToolResponse> => {
    // If no date range provided, make a single API call without date filters
    if (!params.from || !params.to) {
      logger.info('No date range provided, making single API call without date filters')
      try {
        const result = await fetchZoomRecordings(params)
        return {
          success: true,
          output: {
            recordings: result.recordings.map((recording: any) => ({
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
            })),
            pageInfo: result.pageInfo,
          },
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          output: {
            recordings: [],
            pageInfo: {
              from: params.from || '',
              to: params.to || '',
              pageSize: 0,
              totalRecords: 0,
            },
          },
        }
      }
    }

    const fromDate = new Date(params.from)
    const toDate = new Date(params.to)
    const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))

    // If range is 30 days or less, make a single API call
    if (daysDiff <= 30) {
      logger.info('Date range is 30 days or less, making single API call', {
        from: params.from,
        to: params.to,
        daysDiff,
      })

      try {
        const result = await fetchZoomRecordings(params, params.from, params.to)
        return {
          success: true,
          output: {
            recordings: result.recordings.map((recording: any) => ({
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
            })),
            pageInfo: {
              ...result.pageInfo,
              from: params.from,
              to: params.to,
            },
          },
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          output: {
            recordings: [],
            pageInfo: {
              from: params.from,
              to: params.to,
              pageSize: 0,
              totalRecords: 0,
            },
          },
        }
      }
    }

    // Range exceeds 30 days - split into chunks and fetch all
    logger.info('Date range exceeds 30 days, splitting into chunks', {
      from: params.from,
      to: params.to,
      daysDiff,
    })

    const chunks = splitDateRange(params.from, params.to)
    logger.info(`Split date range into ${chunks.length} chunks`, {
      chunks: chunks.map((c) => `${c.from} to ${c.to}`),
    })

    const allRecordings: any[] = []

    // Fetch recordings for each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      logger.info(`Fetching recordings for chunk ${i + 1}/${chunks.length}`, {
        from: chunk.from,
        to: chunk.to,
      })

      try {
        const chunkResult = await fetchZoomRecordings(params, chunk.from, chunk.to)
        allRecordings.push(...chunkResult.recordings)
        logger.info(`Fetched ${chunkResult.recordings.length} recordings from chunk ${i + 1}`, {
          chunkFrom: chunk.from,
          chunkTo: chunk.to,
        })
      } catch (error) {
        logger.error(`Error fetching recordings for chunk ${i + 1}`, {
          error: error instanceof Error ? error.message : String(error),
          chunkFrom: chunk.from,
          chunkTo: chunk.to,
        })
        // Continue with other chunks even if one fails
      }
    }

    // Remove duplicates based on UUID (in case of overlapping dates at chunk boundaries)
    const uniqueRecordings = Array.from(
      new Map(allRecordings.map((recording) => [recording.uuid, recording])).values()
    )

    logger.info('Combined all recordings', {
      totalChunks: chunks.length,
      totalRecordings: allRecordings.length,
      uniqueRecordings: uniqueRecordings.length,
      from: params.from,
      to: params.to,
    })

    return {
      success: true,
      output: {
        recordings: uniqueRecordings.map((recording: any) => ({
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
        })),
        pageInfo: {
          from: params.from,
          to: params.to,
          pageSize: uniqueRecordings.length,
          totalRecords: uniqueRecordings.length,
          // No nextPageToken since we've fetched all chunks
        },
      },
    }
  },

  transformResponse: async (response) => {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: errorData.message || `Zoom API error: ${response.status} ${response.statusText}`,
        output: {
          recordings: [],
          pageInfo: {
            from: '',
            to: '',
            pageSize: 0,
            totalRecords: 0,
          },
        },
      }
    }

    const data = await response.json()

    return {
      success: true,
      output: {
        recordings: (data.meetings || []).map((recording: any) => ({
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
        })),
        pageInfo: {
          from: data.from || '',
          to: data.to || '',
          pageSize: data.page_size || 0,
          totalRecords: data.total_records || 0,
          nextPageToken: data.next_page_token,
        },
      },
    }
  },

  outputs: {
    recordings: {
      type: 'array',
      description: 'List of recordings',
    },
    pageInfo: {
      type: 'object',
      description: 'Pagination information',
      properties: {
        from: { type: 'string', description: 'Start date of query range' },
        to: { type: 'string', description: 'End date of query range' },
        pageSize: { type: 'number', description: 'Number of records per page' },
        totalRecords: { type: 'number', description: 'Total number of records' },
        nextPageToken: { type: 'string', description: 'Token for next page' },
      },
    },
  },
}
