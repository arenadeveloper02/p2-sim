import type { ToolConfig } from '@/tools/types'
import type {
  ZoomListAccountRecordingsParams,
  ZoomListAccountRecordingsResponse,
} from '@/tools/zoom/types'

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
    url: '/api/tools/zoom/list-account-recordings',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params: ZoomListAccountRecordingsParams) => ({
      accessToken: params.accessToken,
      from: params.from,
      to: params.to,
      pageSize: params.pageSize,
      nextPageToken: params.nextPageToken,
    }),
  },

  transformResponse: async (response: Response): Promise<ZoomListAccountRecordingsResponse> => {
    const emptyOutput = {
      recordings: [],
      pageInfo: { from: '', to: '', pageSize: 0, totalRecords: 0 },
    }
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: string }
      return { success: false, error: err.error || response.statusText, output: emptyOutput }
    }
    return (await response.json()) as ZoomListAccountRecordingsResponse
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
