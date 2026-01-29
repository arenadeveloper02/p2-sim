import type { Logger } from '@sim/logger'
import { GA4_API_BASE_URL } from './constants'

export class GA4ApiClient {
  private accessToken: string
  private logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
    this.accessToken = this.getAccessToken()
  }

  private getAccessToken(): string {
    // TODO: Implement OAuth 2.0 flow for GA4
    const token = process.env.GA4_ACCESS_TOKEN
    if (!token) {
      throw new Error('GA4_ACCESS_TOKEN not configured')
    }
    return token
  }

  async runReport(propertyId: string, query: any): Promise<any> {
    const url = `${GA4_API_BASE_URL}/${propertyId}:runReport`
    
    this.logger.info('Making GA4 API request', {
      propertyId,
      url,
      query
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(query)
    })

    if (!response.ok) {
      const errorText = await response.text()
      this.logger.error('GA4 API request failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      throw new Error(`GA4 API error: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    this.logger.info('GA4 API request successful', {
      rowCount: result.rows?.length || 0
    })

    return result
  }

  async validateProperty(propertyId: string): Promise<boolean> {
    try {
      const url = `${GA4_API_BASE_URL}/${propertyId}/metadata`
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      })
      return response.ok
    } catch (error) {
      this.logger.error('Failed to validate GA4 property', { propertyId, error })
      return false
    }
  }
}
