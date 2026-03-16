import type { ToolConfig } from '@/tools/types'
import type { ZoomListAccountRecordingsParams } from '@/tools/zoom/types'

export interface ZoomGetAccountRecordingsWithTranscriptParams
  extends ZoomListAccountRecordingsParams {
  meetingTitle?: string
}

export interface ZoomGetAccountRecordingsWithTranscriptResponse {
  success: boolean
  error?: string
  output: {
    recordings: Array<{
      topic: string
      start_time: string
      transcript_download_url: string
      content: string
    }>
  }
}

export const zoomGetAccountRecordingsWithTranscriptTool: ToolConfig<
  ZoomGetAccountRecordingsWithTranscriptParams,
  ZoomGetAccountRecordingsWithTranscriptResponse
> = {
  id: 'zoom_get_account_recordings_with_transcript',
  name: 'Zoom Get Account Recordings with Transcript',
  description: 'Get all account recordings with transcripts, optionally filtered by meeting title',
  version: '1.0.0',

  request: {
    url: '/api/tools/zoom/get-account-recordings-with-transcript',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params: ZoomGetAccountRecordingsWithTranscriptParams) => ({
      accessToken: params.accessToken,
      from: params.from,
      to: params.to,
      pageSize: params.pageSize,
      nextPageToken: params.nextPageToken,
      meetingTitle: params.meetingTitle,
    }),
  },

  transformResponse: async (
    response: Response
  ): Promise<ZoomGetAccountRecordingsWithTranscriptResponse> => {
    const emptyOutput = { recordings: [] }
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: string }
      return { success: false, error: err.error || response.statusText, output: emptyOutput }
    }
    return (await response.json()) as ZoomGetAccountRecordingsWithTranscriptResponse
  },

  oauth: {
    required: true,
    provider: 'zoom',
    requiredScopes: [
      'recording:read:list_account_recordings',
      'recording:read:admin',
      'cloud_recording:read:list_recording_files',
    ],
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
    meetingTitle: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Filter recordings by meeting topic/title. Supports comma-separated list for matching multiple titles (case-insensitive, partial match).',
    },
  },

  outputs: {
    recordings: {
      type: 'array',
      description: 'List of recordings with their transcripts',
    },
  },
}
