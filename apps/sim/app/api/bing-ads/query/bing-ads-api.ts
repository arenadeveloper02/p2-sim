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
    scope: 'https://ads.microsoft.com/msads.manage offline_access',
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

  const submitUrl = 'https://reporting.api.bingads.microsoft.com/Api/Advertiser/Reporting/v13/ReportingService.svc'
  const pollUrl = 'https://reporting.api.bingads.microsoft.com/Api/Advertiser/Reporting/v13/ReportingService.svc'

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
    logger.info('Poll raw response', { attempt, pollResponseStatus: pollResponse.status, pollTextLength: pollText.length, pollTextPreview: pollText.substring(0, 500) })
    
    if (!pollResponse.ok) {
      throw new Error(`PollGenerateReport failed (${pollResponse.status}): ${pollText}`)
    }

    const status = extractFirstXmlTagValue(pollText, 'Status')
    const reportDownloadUrl = extractFirstXmlTagValue(pollText, 'ReportDownloadUrl')

    logger.info('Poll response parsed', { attempt, status, hasDownloadUrl: !!reportDownloadUrl, reportDownloadUrl: reportDownloadUrl?.substring(0, 150) })

    if (status && status.toLowerCase() === 'success') {
      if (!reportDownloadUrl) {
        throw new Error(`Report status is Success but no ReportDownloadUrl found. Response: ${pollText}`)
      }

      logger.info('Downloading report from URL', { url: reportDownloadUrl })
      const csvText = await downloadReportAsCsvText(reportDownloadUrl, accessToken)
      logger.info('Downloaded CSV content', { csvLength: csvText.length, csvPreview: csvText.substring(0, 500) })
      const rows = await parseCsvToRecords(csvText)
      logger.info('Parsed CSV rows', { rowCount: rows.length, firstRow: rows[0] })
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

function buildReportRequestXml(accountId: string, parsedQuery: ParsedBingQuery): string {
  const reportType = parsedQuery.reportType || 'CampaignPerformance'
  
  // Map report type to XML type and column element name
  const reportTypeMap: Record<string, { xmlType: string; columnElement: string; requiredColumns: string[] }> = {
    'CampaignPerformance': {
      xmlType: 'CampaignPerformanceReportRequest',
      columnElement: 'CampaignPerformanceReportColumn',
      requiredColumns: ['CampaignName', 'CampaignId', 'Impressions', 'Clicks', 'Spend', 'Conversions']
    },
    'AccountPerformance': {
      xmlType: 'AccountPerformanceReportRequest',
      columnElement: 'AccountPerformanceReportColumn',
      requiredColumns: ['AccountName', 'AccountId', 'Impressions', 'Clicks', 'Spend', 'Conversions']
    },
    'AdGroupPerformance': {
      xmlType: 'AdGroupPerformanceReportRequest',
      columnElement: 'AdGroupPerformanceReportColumn',
      requiredColumns: ['CampaignName', 'AdGroupName', 'AdGroupId', 'Impressions', 'Clicks', 'Spend', 'Conversions']
    },
    'KeywordPerformance': {
      xmlType: 'KeywordPerformanceReportRequest',
      columnElement: 'KeywordPerformanceReportColumn',
      requiredColumns: ['CampaignName', 'AdGroupName', 'Keyword', 'KeywordId', 'Impressions', 'Clicks', 'Spend']
    },
    'SearchQueryPerformance': {
      xmlType: 'SearchQueryPerformanceReportRequest',
      columnElement: 'SearchQueryPerformanceReportColumn',
      requiredColumns: ['CampaignName', 'AdGroupName', 'SearchQuery', 'Impressions', 'Clicks', 'Spend']
    },
    'GeographicPerformance': {
      xmlType: 'GeographicPerformanceReportRequest',
      columnElement: 'GeographicPerformanceReportColumn',
      requiredColumns: ['Country', 'Impressions', 'Clicks', 'Spend']
    },
    'AdExtensionByAdReport': {
      xmlType: 'AdExtensionByAdReportRequest',
      columnElement: 'AdExtensionByAdReportColumn',
      requiredColumns: ['CampaignName', 'AdGroupName', 'AdExtensionType', 'AdExtensionId', 'Impressions', 'Clicks']
    },
    'AdExtensionDetailReport': {
      xmlType: 'AdExtensionDetailReportRequest',
      columnElement: 'AdExtensionDetailReportColumn',
      requiredColumns: ['CampaignName', 'AdExtensionType', 'AdExtensionId', 'Impressions', 'Clicks']
    }
  }
  
  const config = reportTypeMap[reportType] || reportTypeMap['CampaignPerformance']
  const requested = Array.isArray(parsedQuery.columns) ? parsedQuery.columns : []
  const columns = Array.from(new Set([...config.requiredColumns, ...requested]))

  const aggregation = parsedQuery.aggregation || 'Summary'
  const reportName = `${reportType}_${new Date().toISOString()}`

  // Build Time element - use CustomDateRange if timeRange provided, otherwise use PredefinedTime
  let timeElement = ''
  if (parsedQuery.timeRange && parsedQuery.timeRange.start && parsedQuery.timeRange.end) {
    const startParts = parsedQuery.timeRange.start.split('-')
    const endParts = parsedQuery.timeRange.end.split('-')
    
    logger.info('Building custom date range XML', {
      start: parsedQuery.timeRange.start,
      end: parsedQuery.timeRange.end,
      startParts,
      endParts,
      startDay: parseInt(startParts[2]),
      startMonth: parseInt(startParts[1]),
      startYear: parseInt(startParts[0]),
      endDay: parseInt(endParts[2]),
      endMonth: parseInt(endParts[1]),
      endYear: parseInt(endParts[0])
    })
    
    timeElement = `<Time i:nil="false">
    <CustomDateRangeStart>
      <Day>${parseInt(startParts[2])}</Day>
      <Month>${parseInt(startParts[1])}</Month>
      <Year>${parseInt(startParts[0])}</Year>
    </CustomDateRangeStart>
    <CustomDateRangeEnd>
      <Day>${parseInt(endParts[2])}</Day>
      <Month>${parseInt(endParts[1])}</Month>
      <Year>${parseInt(endParts[0])}</Year>
    </CustomDateRangeEnd>
    <ReportTimeZone i:nil="false">PacificTimeUSCanadaTijuana</ReportTimeZone>
  </Time>`
  } else {
    const predefinedTime = parsedQuery.datePreset || 'LastSevenDays'
    timeElement = `<Time i:nil="false">
    <PredefinedTime i:nil="false">${escapeXml(predefinedTime)}</PredefinedTime>
    <ReportTimeZone i:nil="false">PacificTimeUSCanadaTijuana</ReportTimeZone>
  </Time>`
  }

  return `<ReportRequest i:nil="false" i:type="${config.xmlType}" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <ExcludeColumnHeaders i:nil="false">false</ExcludeColumnHeaders>
  <ExcludeReportFooter i:nil="false">true</ExcludeReportFooter>
  <ExcludeReportHeader i:nil="false">true</ExcludeReportHeader>
  <Format i:nil="false">Csv</Format>
  <FormatVersion i:nil="false">2.0</FormatVersion>
  <ReportName i:nil="false">${escapeXml(reportName)}</ReportName>
  <ReturnOnlyCompleteData i:nil="false">false</ReturnOnlyCompleteData>
  <Aggregation>${escapeXml(aggregation)}</Aggregation>
  <Columns i:nil="false">${columns
    .map((c) => `<${config.columnElement}>${escapeXml(c)}</${config.columnElement}>`)
    .join('')}</Columns>
  <Scope i:nil="false">
    <AccountIds i:nil="false" xmlns:a1="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
      <a1:long>${escapeXml(accountId)}</a1:long>
    </AccountIds>
  </Scope>
  ${timeElement}
</ReportRequest>`
}

// Keep backward compatibility
function buildCampaignPerformanceReportRequestXml(accountId: string, parsedQuery: ParsedBingQuery): string {
  return buildReportRequestXml(accountId, parsedQuery)
}

async function downloadReportAsCsvText(url: string, _accessToken?: string): Promise<string> {
  // The report download URL from Bing Ads is a pre-signed Azure blob URL with SAS token
  // Do NOT add Authorization header - Azure blob storage uses SAS tokens in the URL itself
  // Adding Bearer token causes 403 AuthenticationFailed error
  
  logger.info('Attempting report download', { urlLength: url.length, urlPreview: url.substring(0, 200) })
  
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    logger.error('Report download failed', { status: response.status, url, body: body.substring(0, 500) })
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
    // Bing Ads CSV has metadata headers before the actual data
    // Format:
    // "Report Name: Test"
    // "Report Time: ..."
    // ... more metadata ...
    // "Rows: N"
    // 
    // "Column1","Column2",...
    // "Value1","Value2",...
    
    // Find the actual data section by looking for the header row after "Rows:" line
    const lines = csvText.split('\n')
    let dataStartIndex = 0
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      // Look for the "Rows:" line which indicates end of metadata
      if (line.startsWith('"Rows:') || line.startsWith('Rows:')) {
        // Skip the empty line after "Rows:" and start from the header row
        dataStartIndex = i + 2 // Skip "Rows:" line and empty line
        break
      }
    }
    
    // If we found metadata, extract only the data portion
    let dataCsv = csvText
    if (dataStartIndex > 0 && dataStartIndex < lines.length) {
      dataCsv = lines.slice(dataStartIndex).join('\n')
      logger.info('Extracted data CSV from Bing Ads report', { 
        originalLines: lines.length, 
        dataStartIndex, 
        dataLines: lines.length - dataStartIndex,
        dataCsvPreview: dataCsv.substring(0, 300)
      })
    }
    
    const mod: any = await import('csv-parse/sync')
    const parseSync = mod.parse
    const rows = parseSync(dataCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    })
    
    // Remove quotes from column names if they exist
    // Bing Ads CSV sometimes has quoted column names like "CampaignName"
    return rows.map((row: Record<string, any>) => {
      const cleanRow: Record<string, any> = {}
      for (const [key, value] of Object.entries(row)) {
        // Remove all quotes from column names (both leading and trailing)
        const cleanKey = key.replace(/"/g, '').trim()
        cleanRow[cleanKey] = value
      }
      return cleanRow
    })
  } catch (e) {
    throw new Error(
      `CSV parsing unavailable. Ensure the 'csv-parse' dependency is installed. ${(e as Error).message}`
    )
  }
}

function buildCampaignPerformanceMetrics(rows: Array<Record<string, any>>, parsedQuery: ParsedBingQuery): any {
  const campaignsByName = new Map<string, any>()
  
  // For AccountPerformance reports, there's no CampaignName - use AccountName instead
  const isAccountReport = parsedQuery.reportType === 'AccountPerformance'

  for (const row of rows) {
    // Use CampaignName for campaign reports, AccountName for account reports
    const name = isAccountReport 
      ? String(row.AccountName || '').trim()
      : String(row.CampaignName || '').trim()
    
    // For account reports, if no AccountName, still process the row using a default name
    if (!name && !isAccountReport) continue

    const impressions = toNumber(row.Impressions)
    const clicks = toNumber(row.Clicks)
    const spend = toNumber(row.Spend)
    const conversions = toNumber(row.Conversions)

    const entityName = name || 'Account Total'
    const existing = campaignsByName.get(entityName) || {
      id: isAccountReport ? (row.AccountId ? String(row.AccountId) : undefined) : (row.CampaignId ? String(row.CampaignId) : undefined),
      name: entityName,
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
    }

    existing.impressions += impressions
    existing.clicks += clicks
    existing.spend += spend
    existing.conversions += conversions

    campaignsByName.set(entityName, existing)
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

  // If no campaigns found but we have rows, calculate totals directly from rows
  let totals = { impressions: 0, clicks: 0, spend: 0, conversions: 0 }
  
  if (campaigns.length > 0) {
    totals = campaigns.reduce(
      (acc, c) => {
        acc.impressions += c.impressions
        acc.clicks += c.clicks
        acc.spend += c.spend
        acc.conversions += c.conversions
        return acc
      },
      { impressions: 0, clicks: 0, spend: 0, conversions: 0 }
    )
  } else if (rows.length > 0) {
    // Fallback: calculate totals directly from rows
    for (const row of rows) {
      totals.impressions += toNumber(row.Impressions)
      totals.clicks += toNumber(row.Clicks)
      totals.spend += toNumber(row.Spend)
      totals.conversions += toNumber(row.Conversions)
    }
  }

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
  if (!match || match[1] === undefined) return null
  // Decode XML entities in the extracted value (important for URLs with & characters)
  return match[1]
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
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
  parsedQuery: ParsedBingQuery,
  accountCustomerId?: string
): Promise<any> {
  logger.info('Making Bing Ads API request', {
    accountId,
    accountCustomerId,
    reportType: parsedQuery.reportType,
    datePreset: parsedQuery.datePreset,
    columns: parsedQuery.columns,
  })

  try {
    const developerToken = process.env.BING_ADS_DEVELOPER_TOKEN
    // Use account-specific customerId if provided, otherwise fall back to env/defaults
    const customerId =
      accountCustomerId || process.env.BING_ADS_CUSTOMER_ID || BING_ADS_DEFAULT_CUSTOMER_ID || POSITION2_CUSTOMER_ID

    if (!developerToken) {
      throw new Error(
        'Missing Bing Ads developer token. Please set BING_ADS_DEVELOPER_TOKEN environment variable.'
      )
    }

    const accessToken = await getAccessToken()

    // Use Bing Ads Reporting API (SOAP)
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
      logger.error('Bing Ads Reporting API failed', {
        error: reportingError instanceof Error ? reportingError.message : 'Unknown error',
        accountId,
      })

      // DO NOT fall back to mock data - show the real error
      throw new Error(
        `Bing Ads API request failed: ${reportingError instanceof Error ? reportingError.message : 'Unknown error'}`
      )
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Error in Bing Ads API request', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      accountId,
    })

    // Return structured error response WITH the error message visible
    return {
      error: errorMessage,
      campaigns: [],
      account_totals: {
        clicks: 0,
        impressions: 0,
        spend: 0,
        conversions: 0,
        error_details: errorMessage, // Include error in totals for visibility
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
