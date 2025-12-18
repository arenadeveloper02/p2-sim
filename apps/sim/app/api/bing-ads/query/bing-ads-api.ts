import { createLogger } from '@/lib/logs/console/logger'
import { BING_ADS_DEFAULT_CUSTOMER_ID, BING_ADS_OAUTH_URL, POSITION2_CUSTOMER_ID } from './constants'
import type { ParsedBingQuery } from './types'
import JSZip from 'jszip'

const logger = createLogger('BingAdsAPIClient')

/**
 * Get access token using refresh token
 */
async function getAccessToken(): Promise<string> {
  const clientId = process.env.BING_ADS_CLIENT_ID
  const clientSecret = process.env.BING_ADS_CLIENT_SECRET
  const refreshToken = process.env.BING_ADS_REFRESH_TOKEN

  if (!clientId || !refreshToken) {
    throw new Error(
      'Missing Bing Ads API credentials. Please set BING_ADS_CLIENT_ID and BING_ADS_REFRESH_TOKEN environment variables.'
    )
  }

  logger.info('Refreshing Bing Ads access token', {
    hasClientSecret: !!clientSecret,
  })

  // Build token request - client_secret is optional for public client apps
  const tokenParams: Record<string, string> = {
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'https://ads.microsoft.com/.default offline_access',
  }

  // Only include client_secret if provided (required for web apps, not for public/native apps)
  if (clientSecret) {
    tokenParams.client_secret = clientSecret
  }

  const tokenRequestBody = new URLSearchParams(tokenParams)

  const tenantId = process.env.BING_ADS_TENANT_ID
  const tokenUrl = tenantId
    ? `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
    : BING_ADS_OAUTH_URL

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenRequestBody,
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    logger.error('Token refresh failed', {
      status: tokenResponse.status,
      error: errorText,
    })
    throw new Error(`Failed to refresh Bing Ads access token: ${tokenResponse.status} - ${errorText}`)
  }

  const tokenData = await tokenResponse.json()
  logger.info('Successfully obtained Bing Ads access token')

  return tokenData.access_token
}

async function getCampaignPerformanceReport(params: {
  accessToken: string
  developerToken: string
  customerId: string
  accountId: string
  parsedQuery: ParsedBingQuery
}): Promise<any> {
  const { accessToken, developerToken, customerId, accountId, parsedQuery } = params

  const submitUrl = 'https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Submit'
  const pollUrl = 'https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Poll'

  // Log the request details for debugging
  logger.info('Submitting Bing Ads report request', {
    submitUrl,
    customerId,
    accountId,
    reportType: parsedQuery.reportType,
    datePreset: parsedQuery.datePreset,
  })

  const reportRequestXml = buildCampaignPerformanceReportRequestXml(accountId, parsedQuery)
  const submitSoapEnvelope = buildSubmitSoapEnvelope({
    accessToken,
    developerToken,
    customerId,
    customerAccountId: accountId,
    reportRequestXml,
  })

  const submitResponse = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: 'SubmitGenerateReport',
    },
    body: submitSoapEnvelope,
  })

  const submitText = await submitResponse.text()
  
  // Log the response for debugging
  logger.info('SubmitGenerateReport response', {
    status: submitResponse.status,
    ok: submitResponse.ok,
    responsePreview: submitText.substring(0, 500),
  })

  if (!submitResponse.ok) {
    throw new Error(`SubmitGenerateReport failed (${submitResponse.status}): ${submitText}`)
  }

  const reportRequestId = extractFirstXmlTagValue(submitText, 'ReportRequestId')
  if (!reportRequestId) {
    throw new Error(`SubmitGenerateReport succeeded but no ReportRequestId found. Response: ${submitText}`)
  }

  const maxPollAttempts = 12
  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
    const pollSoapEnvelope = buildPollSoapEnvelope({
      accessToken,
      developerToken,
      customerId,
      customerAccountId: accountId,
      reportRequestId,
    })

    const pollResponse = await fetch(pollUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'PollGenerateReport',
      },
      body: pollSoapEnvelope,
    })

    const pollText = await pollResponse.text()
    if (!pollResponse.ok) {
      throw new Error(`PollGenerateReport failed (${pollResponse.status}): ${pollText}`)
    }

    const status = extractFirstXmlTagValue(pollText, 'Status')
    const reportDownloadUrl = extractFirstXmlTagValue(pollText, 'ReportDownloadUrl')

    if (status && status.toLowerCase() === 'success') {
      if (!reportDownloadUrl) {
        throw new Error(`Report status is Success but no ReportDownloadUrl found. Response: ${pollText}`)
      }

      const csvText = await downloadReportAsCsvText(reportDownloadUrl)
      const rows = await parseCsvToRecords(csvText)
      return buildCampaignPerformanceMetrics(rows, parsedQuery)
    }

    if (status && status.toLowerCase() === 'error') {
      throw new Error(`Report generation failed. Response: ${pollText}`)
    }

    await sleep(Math.min(1000 * 2 ** attempt, 8000))
  }

  throw new Error(`Report generation timed out after polling. reportRequestId=${reportRequestId}`)
}

function buildSubmitSoapEnvelope(params: {
  accessToken: string
  developerToken: string
  customerId: string
  customerAccountId: string
  reportRequestXml: string
}): string {
  const { accessToken, developerToken, customerId, customerAccountId, reportRequestXml } = params
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Header xmlns="https://bingads.microsoft.com/Reporting/v13">
    <Action mustUnderstand="1">SubmitGenerateReport</Action>
    <AuthenticationToken i:nil="false">${escapeXml(accessToken)}</AuthenticationToken>
    <CustomerAccountId i:nil="false">${escapeXml(customerAccountId)}</CustomerAccountId>
    <CustomerId i:nil="false">${escapeXml(customerId)}</CustomerId>
    <DeveloperToken i:nil="false">${escapeXml(developerToken)}</DeveloperToken>
  </s:Header>
  <s:Body>
    <SubmitGenerateReportRequest xmlns="https://bingads.microsoft.com/Reporting/v13">
      ${reportRequestXml}
    </SubmitGenerateReportRequest>
  </s:Body>
</s:Envelope>`
}

function buildPollSoapEnvelope(params: {
  accessToken: string
  developerToken: string
  customerId: string
  customerAccountId: string
  reportRequestId: string
}): string {
  const { accessToken, developerToken, customerId, customerAccountId, reportRequestId } = params
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Header xmlns="https://bingads.microsoft.com/Reporting/v13">
    <Action mustUnderstand="1">PollGenerateReport</Action>
    <AuthenticationToken i:nil="false">${escapeXml(accessToken)}</AuthenticationToken>
    <CustomerAccountId i:nil="false">${escapeXml(customerAccountId)}</CustomerAccountId>
    <CustomerId i:nil="false">${escapeXml(customerId)}</CustomerId>
    <DeveloperToken i:nil="false">${escapeXml(developerToken)}</DeveloperToken>
  </s:Header>
  <s:Body>
    <PollGenerateReportRequest xmlns="https://bingads.microsoft.com/Reporting/v13">
      <ReportRequestId i:nil="false">${escapeXml(reportRequestId)}</ReportRequestId>
    </PollGenerateReportRequest>
  </s:Body>
</s:Envelope>`
}

function buildCampaignPerformanceReportRequestXml(accountId: string, parsedQuery: ParsedBingQuery): string {
  const requested = Array.isArray(parsedQuery.columns) ? parsedQuery.columns : []
  const required = [
    'CampaignName',
    'CampaignId',
    'Impressions',
    'Clicks',
    'Spend',
    'Conversions',
  ]
  const columns = Array.from(new Set([...required, ...requested]))

  const aggregation = parsedQuery.aggregation || 'Summary'
  const predefinedTime = parsedQuery.datePreset || 'LastSevenDays'
  const reportName = `CampaignPerformance_${new Date().toISOString()}`

  return `<ReportRequest i:nil="false" i:type="CampaignPerformanceReportRequest" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <ExcludeColumnHeaders i:nil="false">false</ExcludeColumnHeaders>
  <ExcludeReportFooter i:nil="false">true</ExcludeReportFooter>
  <ExcludeReportHeader i:nil="false">true</ExcludeReportHeader>
  <Format i:nil="false">Csv</Format>
  <FormatVersion i:nil="false">2.0</FormatVersion>
  <ReportName i:nil="false">${escapeXml(reportName)}</ReportName>
  <ReturnOnlyCompleteData i:nil="false">false</ReturnOnlyCompleteData>
  <Aggregation>${escapeXml(aggregation)}</Aggregation>
  <Columns i:nil="false">${columns
    .map((c) => `<CampaignPerformanceReportColumn>${escapeXml(c)}</CampaignPerformanceReportColumn>`)
    .join('')}</Columns>
  <Scope i:nil="false">
    <AccountIds i:nil="false" xmlns:a1="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
      <a1:long>${escapeXml(accountId)}</a1:long>
    </AccountIds>
  </Scope>
  <Time i:nil="false">
    <PredefinedTime i:nil="false">${escapeXml(predefinedTime)}</PredefinedTime>
    <ReportTimeZone i:nil="false">PacificTimeUSCanadaTijuana</ReportTimeZone>
  </Time>
</ReportRequest>`
}

async function downloadReportAsCsvText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Failed to download report (${response.status}): ${body}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const zip = await JSZip.loadAsync(buffer)
    const csvFile = Object.values(zip.files).find((f) => !f.dir && f.name.toLowerCase().endsWith('.csv'))
    if (!csvFile) {
      throw new Error('Downloaded report is a zip but contains no CSV file')
    }
    return await csvFile.async('string')
  }

  return buffer.toString('utf-8')
}

async function parseCsvToRecords(csvText: string): Promise<Array<Record<string, any>>> {
  try {
    const mod: any = await import('csv-parse/sync')
    const parseSync = mod.parse
    return parseSync(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    })
  } catch (e) {
    throw new Error(
      `CSV parsing unavailable. Ensure the 'csv-parse' dependency is installed. ${(e as Error).message}`
    )
  }
}

function buildCampaignPerformanceMetrics(rows: Array<Record<string, any>>, parsedQuery: ParsedBingQuery): any {
  const campaignsByName = new Map<string, any>()

  for (const row of rows) {
    const name = String(row.CampaignName || '').trim()
    if (!name) continue

    const impressions = toNumber(row.Impressions)
    const clicks = toNumber(row.Clicks)
    const spend = toNumber(row.Spend)
    const conversions = toNumber(row.Conversions)

    const existing = campaignsByName.get(name) || {
      id: row.CampaignId ? String(row.CampaignId) : undefined,
      name,
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
    }

    existing.impressions += impressions
    existing.clicks += clicks
    existing.spend += spend
    existing.conversions += conversions

    campaignsByName.set(name, existing)
  }

  const campaigns = Array.from(campaignsByName.values()).map((c) => {
    const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0
    const avgCpc = c.clicks > 0 ? c.spend / c.clicks : 0
    const costPerConversion = c.conversions > 0 ? c.spend / c.conversions : 0
    return {
      ...c,
      ctr,
      avg_cpc: avgCpc,
      cost_per_conversion: costPerConversion,
    }
  })

  const totals = campaigns.reduce(
    (acc, c) => {
      acc.impressions += c.impressions
      acc.clicks += c.clicks
      acc.spend += c.spend
      acc.conversions += c.conversions
      return acc
    },
    { impressions: 0, clicks: 0, spend: 0, conversions: 0 }
  )

  const totalCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
  const totalAvgCpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0
  const totalCostPerConversion = totals.conversions > 0 ? totals.spend / totals.conversions : 0

  return {
    campaigns,
    account_totals: {
      ...totals,
      ctr: totalCtr,
      avg_cpc: totalAvgCpc,
      cost_per_conversion: totalCostPerConversion,
    },
    report_type: parsedQuery.reportType,
    date_preset: parsedQuery.datePreset,
    aggregation: parsedQuery.aggregation,
    columns_requested: parsedQuery.columns,
  }
}

function extractFirstXmlTagValue(xml: string, tagName: string): string | null {
  const re = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i')
  const match = xml.match(re)
  return match && match[1] !== undefined ? match[1].trim() : null
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toNumber(value: any): number {
  if (value === null || value === undefined) return 0
  const cleaned = String(value).replace(/[^0-9.-]+/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Make a request to the Bing Ads Reporting API
 */
export async function makeBingAdsRequest(
  accountId: string,
  parsedQuery: ParsedBingQuery
): Promise<any> {
  logger.info('Making Bing Ads API request', {
    accountId,
    reportType: parsedQuery.reportType,
    datePreset: parsedQuery.datePreset,
    columns: parsedQuery.columns,
  })

  try {
    const developerToken = process.env.BING_ADS_DEVELOPER_TOKEN
    const customerId =
      process.env.BING_ADS_CUSTOMER_ID || BING_ADS_DEFAULT_CUSTOMER_ID || POSITION2_CUSTOMER_ID

    if (!developerToken) {
      throw new Error(
        'Missing Bing Ads developer token. Please set BING_ADS_DEVELOPER_TOKEN environment variable.'
      )
    }

    const accessToken = await getAccessToken()

    if (parsedQuery.reportType === 'CampaignPerformance') {
      try {
        const report = await getCampaignPerformanceReport({
          accessToken,
          developerToken,
          customerId,
          accountId,
          parsedQuery,
        })
        return report
      } catch (reportingError) {
        logger.warn('Reporting API failed, falling back to Campaign Management API', {
          error: reportingError instanceof Error ? reportingError.message : 'Unknown error',
        })
        // Fall through to Campaign Management API below
      }
    }

    // Build the SOAP request for Bing Ads Reporting API
    const reportRequest = buildReportRequest(accountId, parsedQuery)

    logger.info('Bing Ads report request built', {
      accountId,
      reportType: parsedQuery.reportType,
    })

    // For now, we'll use the REST-based Campaign Management API
    // The Reporting API requires SOAP, but we can get basic data via REST
    const apiUrl = `https://campaign.api.bingads.microsoft.com/Api/Advertiser/CampaignManagement/v13/Campaigns`

    // Use Campaign Management API to get campaign data
    const campaignResponse = await fetch(
      `https://campaign.api.bingads.microsoft.com/CampaignManagement/v13/Campaigns/QueryByAccountId?accountId=${accountId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          DeveloperToken: developerToken,
          CustomerId: customerId,
          CustomerAccountId: accountId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          AccountId: accountId,
        }),
      }
    )

    if (!campaignResponse.ok) {
      const errorText = await campaignResponse.text()
      logger.error('Bing Ads API request failed', {
        status: campaignResponse.status,
        error: errorText,
      })

      const allowMock = process.env.BING_ADS_USE_MOCK_DATA === 'true'
      if (allowMock) {
        logger.warn('Returning mock Bing Ads response because BING_ADS_USE_MOCK_DATA=true')
        return getMockCampaignData(accountId, parsedQuery)
      }

      throw new Error(
        `Bing Ads API request failed (${campaignResponse.status}). ${errorText}. Set BING_ADS_USE_MOCK_DATA=true to temporarily use mock data.`
      )
    }

    const data = await campaignResponse.json()

    logger.info('Bing Ads API request successful', {
      resultsCount: data.Campaigns?.length || 0,
    })

    return formatBingAdsResponse(data, parsedQuery)
  } catch (error) {
    logger.error('Error in Bing Ads API request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      accountId,
    })

    // Return structured error response
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      campaigns: [],
      account_totals: {
        clicks: 0,
        impressions: 0,
        spend: 0,
        conversions: 0,
      },
    }
  }
}

/**
 * Build SOAP report request (for future SOAP API implementation)
 */
function buildReportRequest(accountId: string, parsedQuery: ParsedBingQuery): any {
  const { reportType, columns, datePreset, timeRange, aggregation } = parsedQuery

  return {
    ReportRequest: {
      '@xsi:type': `${reportType}ReportRequest`,
      ExcludeColumnHeaders: false,
      ExcludeReportFooter: true,
      ExcludeReportHeader: true,
      Format: 'Csv',
      ReturnOnlyCompleteData: false,
      Aggregation: aggregation || 'Summary',
      Columns: columns,
      Scope: {
        AccountIds: [accountId],
      },
      Time: timeRange
        ? {
            CustomDateRangeStart: {
              Day: parseInt(timeRange.start.split('-')[2]),
              Month: parseInt(timeRange.start.split('-')[1]),
              Year: parseInt(timeRange.start.split('-')[0]),
            },
            CustomDateRangeEnd: {
              Day: parseInt(timeRange.end.split('-')[2]),
              Month: parseInt(timeRange.end.split('-')[1]),
              Year: parseInt(timeRange.end.split('-')[0]),
            },
          }
        : {
            PredefinedTime: datePreset || 'LastThirtyDays',
          },
    },
  }
}

/**
 * Format Bing Ads API response
 */
function formatBingAdsResponse(data: any, parsedQuery: ParsedBingQuery): any {
  let campaigns = data.Campaigns || []

  // Apply campaign filter if specified
  if (parsedQuery.campaignFilter) {
    const filterLower = parsedQuery.campaignFilter.toLowerCase()
    campaigns = campaigns.filter((campaign: any) => {
      const campaignName = (campaign.Name || '').toLowerCase()
      // Match if campaign name contains the filter or equals it
      return campaignName.includes(filterLower) || campaignName === filterLower
    })
    
    logger.info('Applied campaign filter', {
      filter: parsedQuery.campaignFilter,
      matchedCount: campaigns.length,
      originalCount: data.Campaigns?.length || 0,
    })
  }

  return {
    campaigns: campaigns.map((campaign: any) => ({
      id: campaign.Id,
      name: campaign.Name,
      status: campaign.Status,
      budget: campaign.DailyBudget,
      budgetType: campaign.BudgetType,
    })),
    report_type: parsedQuery.reportType,
    date_preset: parsedQuery.datePreset,
    time_range: parsedQuery.timeRange,
    aggregation: parsedQuery.aggregation,
    columns_requested: parsedQuery.columns,
    campaign_filter: parsedQuery.campaignFilter,
  }
}

/**
 * Get mock campaign data for testing/development
 * This will be replaced with real API data once credentials are configured
 */
function getMockCampaignData(accountId: string, parsedQuery: ParsedBingQuery): any {
  logger.info('Generating mock Bing Ads data for development', { accountId })

  return {
    campaigns: [
      {
        id: 'mock-campaign-1',
        name: 'Sample Campaign 1',
        status: 'Active',
        impressions: 15000,
        clicks: 450,
        spend: 225.50,
        conversions: 12,
        ctr: 3.0,
        avg_cpc: 0.50,
        cost_per_conversion: 18.79,
      },
      {
        id: 'mock-campaign-2',
        name: 'Sample Campaign 2',
        status: 'Active',
        impressions: 8500,
        clicks: 280,
        spend: 168.00,
        conversions: 8,
        ctr: 3.29,
        avg_cpc: 0.60,
        cost_per_conversion: 21.00,
      },
    ],
    account_totals: {
      impressions: 23500,
      clicks: 730,
      spend: 393.50,
      conversions: 20,
      ctr: 3.11,
      avg_cpc: 0.54,
      cost_per_conversion: 19.68,
    },
    report_type: parsedQuery.reportType,
    date_preset: parsedQuery.datePreset,
    aggregation: parsedQuery.aggregation,
    columns_requested: parsedQuery.columns,
    _note: 'This is mock data. Configure BING_ADS_* environment variables for real data.',
  }
}
