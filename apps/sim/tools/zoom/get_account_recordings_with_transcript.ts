import { createLogger } from '@sim/logger'
import { executeTool } from '@/tools/index'
import type { ToolConfig, ToolResponse } from '@/tools/types'
import type { ZoomListAccountRecordingsParams } from '@/tools/zoom/types'
import { fetchZoomRecordings, splitDateRange } from './list_account_recordings'

const logger = createLogger('zoom:get_account_recordings_with_transcript')

export interface ZoomGetAccountRecordingsWithTranscriptParams
  extends ZoomListAccountRecordingsParams {
  meetingTitle?: string
}

export interface ZoomGetAccountRecordingsWithTranscriptResponse extends ToolResponse {
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

  // Dummy request configuration (not used because we rely on directExecution)
  // Required to satisfy ToolConfig type which expects a request object.
  request: {
    url: () => 'https://api.zoom.us/v2/accounts/me/recordings',
    method: () => 'GET',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
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

  directExecution: async (
    params: ZoomGetAccountRecordingsWithTranscriptParams
  ): Promise<ToolResponse> => {
    try {
      // Step 1: Fetch all recordings using the same logic as zoom_list_account_recordings
      logger.info('Fetching account recordings', {
        from: params.from,
        to: params.to,
        meetingTitle: params.meetingTitle,
      })

      let allRecordings: any[] = []

      // If no date range provided, make a single API call without date filters
      if (!params.from || !params.to) {
        logger.info('No date range provided, making single API call without date filters')
        const result = await fetchZoomRecordings(params)
        allRecordings = result.recordings
      } else {
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
          const result = await fetchZoomRecordings(params, params.from, params.to)
          allRecordings = result.recordings
        } else {
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
              logger.info(
                `Fetched ${chunkResult.recordings.length} recordings from chunk ${i + 1}`,
                {
                  chunkFrom: chunk.from,
                  chunkTo: chunk.to,
                }
              )
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
          allRecordings = Array.from(
            new Map(allRecordings.map((recording) => [recording.uuid, recording])).values()
          )
        }
      }

      logger.info(`Fetched ${allRecordings.length} total recordings`)

      // Step 2: Filter by meetingTitle if provided (supports comma-separated list)
      if (params.meetingTitle) {
        const rawTitleFilter = params.meetingTitle
        const titleFilters = rawTitleFilter
          .split(',')
          .map((title) => title.trim().toLowerCase())
          .filter((title) => title.length > 0)

        if (titleFilters.length > 0) {
          allRecordings = allRecordings.filter((recording) => {
            const topic = (recording.topic || '').toLowerCase()
            return titleFilters.some((filter) => topic.includes(filter))
          })

          logger.info(`Filtered to ${allRecordings.length} recordings matching meeting titles`, {
            meetingTitle: rawTitleFilter,
            parsedTitles: titleFilters,
          })
        } else {
          logger.warn('meetingTitle was provided but no valid titles were parsed after splitting', {
            meetingTitle: rawTitleFilter,
          })
        }
      }

      // Step 3: Filter recordings that have TRANSCRIPT in recording_files
      const recordingsWithTranscript = allRecordings.filter((recording) => {
        const recordingFiles = recording.recording_files || []
        return recordingFiles.some(
          (file: any) => file.file_type === 'TRANSCRIPT' && file.download_url
        )
      })

      logger.info(`Found ${recordingsWithTranscript.length} recordings with transcript files`, {
        totalRecordings: allRecordings.length,
      })

      // Step 4: For each recording, download the transcript
      const results: Array<{
        topic: string
        start_time: string
        transcript_download_url: string
        content: string
      }> = []

      for (let i = 0; i < recordingsWithTranscript.length; i++) {
        const recording = recordingsWithTranscript[i]
        const recordingFiles = recording.recording_files || []
        const transcriptFile = recordingFiles.find(
          (file: any) => file.file_type === 'TRANSCRIPT' && file.download_url
        )

        if (!transcriptFile) {
          logger.warn(`No transcript file found for recording ${recording.uuid}`)
          continue
        }

        logger.info(`Downloading transcript ${i + 1}/${recordingsWithTranscript.length}`, {
          topic: recording.topic,
          downloadUrl: `${transcriptFile.download_url.substring(0, 100)}...`,
        })

        try {
          // Call the download transcript tool
          const downloadResult = await executeTool('zoom_download_transcript', {
            accessToken: params.accessToken,
            downloadUrl: transcriptFile.download_url,
          })

          if (downloadResult.success && downloadResult.output?.content) {
            results.push({
              topic: recording.topic || '',
              start_time: recording.start_time || '',
              transcript_download_url: transcriptFile.download_url,
              content: downloadResult.output.content,
            })
            logger.info(`Successfully downloaded transcript for ${recording.topic}`)
          } else {
            logger.error(`Failed to download transcript for ${recording.topic}`, {
              error: downloadResult.error,
            })
          }
        } catch (error) {
          logger.error(`Error downloading transcript for ${recording.topic}`, {
            error: error instanceof Error ? error.message : String(error),
          })
          // Continue with other recordings even if one fails
        }
      }

      logger.info(`Successfully processed ${results.length} recordings with transcripts`)

      return {
        success: true,
        output: {
          recordings: results,
        },
      }
    } catch (error) {
      logger.error('Error in get account recordings with transcript', {
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        output: {
          recordings: [],
        },
      }
    }
  },

  outputs: {
    recordings: {
      type: 'array',
      description: 'List of recordings with their transcripts',
    },
  },
}
