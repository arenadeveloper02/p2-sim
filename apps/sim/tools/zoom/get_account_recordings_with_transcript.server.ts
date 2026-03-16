/**
 * Server-only: get account recordings with transcripts.
 * Do not import from client code.
 */

import { createLogger } from '@sim/logger'
import { executeTool } from '@/tools'
import type { ToolResponse } from '@/tools/types'
import { splitDateRange } from '@/tools/zoom/list_account_recordings'
import { fetchZoomRecordings } from '@/tools/zoom/list_account_recordings.server'
import type { ZoomListAccountRecordingsParams } from '@/tools/zoom/types'

const logger = createLogger('zoom:get_account_recordings_with_transcript.server')

export interface ZoomGetAccountRecordingsWithTranscriptParams
  extends ZoomListAccountRecordingsParams {
  meetingTitle?: string
}

export async function executeGetAccountRecordingsWithTranscript(
  params: ZoomGetAccountRecordingsWithTranscriptParams
): Promise<ToolResponse> {
  try {
    let allRecordings: any[] = []

    if (!params.from || !params.to) {
      const result = await fetchZoomRecordings(params)
      allRecordings = result.recordings as any[]
    } else {
      const fromDate = new Date(params.from)
      const toDate = new Date(params.to)
      const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))

      if (daysDiff <= 30) {
        const result = await fetchZoomRecordings(params, params.from, params.to)
        allRecordings = result.recordings as any[]
      } else {
        const chunks = splitDateRange(params.from, params.to)
        for (const chunk of chunks) {
          try {
            const chunkResult = await fetchZoomRecordings(params, chunk.from, chunk.to)
            allRecordings.push(...(chunkResult.recordings as any[]))
          } catch (error) {
            logger.error('Error fetching recordings chunk', { chunk, error })
          }
        }
        allRecordings = Array.from(
          new Map(allRecordings.map((r: any) => [r.uuid, r])).values()
        ) as any[]
      }
    }

    if (params.meetingTitle) {
      const titleFilters = params.meetingTitle
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0)
      if (titleFilters.length > 0) {
        allRecordings = allRecordings.filter((recording) => {
          const topic = (recording.topic || '').toLowerCase()
          return titleFilters.some((f) => topic.includes(f))
        })
      }
    }

    const recordingsWithTranscript = allRecordings.filter((recording) => {
      const files = recording.recording_files || []
      return files.some((f: any) => f.file_type === 'TRANSCRIPT' && f.download_url)
    })

    const results: Array<{
      topic: string
      start_time: string
      transcript_download_url: string
      content: string
    }> = []

    for (const recording of recordingsWithTranscript) {
      const files = recording.recording_files || []
      const transcriptFile = files.find((f: any) => f.file_type === 'TRANSCRIPT' && f.download_url)
      if (!transcriptFile) continue

      try {
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
        }
      } catch {
        // continue
      }
    }

    return {
      success: true,
      output: { recordings: results },
    }
  } catch (error) {
    logger.error('Error in get account recordings with transcript', { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      output: { recordings: [] },
    }
  }
}
