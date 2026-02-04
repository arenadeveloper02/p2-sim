/**
 * Google Search Console API Client
 * Handles authentication and API requests to GSC
 */

import { GSCQueryResponse, GSCResponse } from './types'

/**
 * Makes a request to Google Search Console API
 */
export async function makeGSCRequest(siteUrl: string, query: GSCQueryResponse): Promise<GSCResponse> {
  const accessToken = await getGSCAccessToken()
  
  const requestBody: any = {
    startDate: query.startDate,
    endDate: query.endDate,
    dimensions: query.dimensions,
    type: query.type || 'web',
    aggregationType: query.aggregationType || 'auto',
    rowLimit: query.rowLimit || 5000
  }

  // Add filters if provided
  if (query.dimensionFilterGroups && query.dimensionFilterGroups.length > 0) {
    requestBody.dimensionFilterGroups = query.dimensionFilterGroups
  }

  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GSC API request failed: ${response.status} ${response.statusText} - ${errorText}`)
  }

  return await response.json()
}

/**
 * Gets GSC API access token
 * In production, this would handle OAuth2 flow
 */
async function getGSCAccessToken(): Promise<string> {
  // For now, return mock token - in production implement OAuth2
  if (process.env.NODE_ENV === 'development') {
    return 'mock_gsc_access_token'
  }
  
  // TODO: Implement OAuth2 flow for production
  throw new Error('GSC OAuth2 not implemented yet')
}

/**
 * Test GSC API connection
 */
export async function testGSCConnection(siteUrl: string): Promise<boolean> {
  try {
    const testQuery: GSCQueryResponse = {
      startDate: '2026-01-01',
      endDate: '2026-01-03',
      dimensions: ['query'],
      type: 'web',
      rowLimit: 1
    }
    
    await makeGSCRequest(siteUrl, testQuery)
    return true
  } catch (error) {
    console.error('GSC connection test failed:', error)
    return false
  }
}
