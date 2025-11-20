import { createLogger } from '@/lib/logs/console/logger'
import { FB_GRAPH_URL } from './constants'

const logger = createLogger('FacebookAdsAPIClient')

export async function makeFacebookAdsRequest(
  accountId: string,
  endpoint: string,
  fields: string[],
  date_preset: string,
  time_range?: { since: string; until: string },
  level?: string,
  filters?: any,
  breakdowns?: string[]
): Promise<any> {
  logger.info('Making Facebook Graph API request', {
    accountId,
    endpoint,
    fields,
    date_preset,
    level,
    breakdowns,
  })

  try {
    const accessToken = process.env.FB_ACCESS_TOKEN

    if (!accessToken) {
      throw new Error(
        'Missing Facebook access token. Please set FB_ACCESS_TOKEN environment variable.'
      )
    }

    const apiUrl = `${FB_GRAPH_URL}/${accountId}/${endpoint}`

    const params = new URLSearchParams({
      access_token: accessToken,
      fields: fields.join(','),
    })

    if (endpoint === 'insights') {
      if (time_range) {
        params.append('time_range', JSON.stringify(time_range))
      } else {
        params.append('date_preset', date_preset)
      }

      if (level) {
        params.append('level', level)
      }

      params.append('time_increment', 'all_days')
      params.append('use_unified_attribution_setting', 'true')
      params.append('use_account_attribution_setting', 'false')
    }

    if (filters) {
      params.append('filtering', JSON.stringify(filters))
    }

    if (breakdowns && breakdowns.length > 0) {
      params.append('breakdowns', breakdowns.join(','))
    }

    const fullUrl = `${apiUrl}?${params.toString()}`

    logger.info('Facebook API request', { url: apiUrl, paramsCount: params.toString().length })

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Facebook API request failed', {
        status: response.status,
        error: errorText,
      })
      throw new Error(`Facebook API request failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    logger.info('Facebook API request successful', {
      resultsCount: data.data?.length || 0,
      hasData: !!data.data,
      hasPaging: !!data.paging,
    })

    return data
  } catch (error) {
    logger.error('Error in Facebook API request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      accountId,
    })
    throw error
  }
}
