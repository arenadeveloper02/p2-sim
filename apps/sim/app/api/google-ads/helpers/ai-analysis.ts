import { createLogger } from '@/lib/logs/console/logger'
import OpenAI from 'openai'

const logger = createLogger('GoogleAdsAIAnalysis')

interface MonthlyData {
  month: string
  spends: number
  leads: number
  cpl: number
  campaigns: any[]
  keywords: any[]
  adGroups: any[]
}

interface AnalysisRequest {
  prompt: string
  accountId: string
  accountName: string
}

interface AnalysisResponse {
  queries: GAQLQuery[]
  monthlyData: MonthlyData[]
  insights: string
  recommendations: string
  comparison: string
}

interface GAQLQuery {
  query: string
  month: string
  purpose: string
}

/**
 * AI-Powered Deep Dive Analysis System
 * Handles complex multi-month analysis requests with AI-generated insights
 */
export class GoogleAdsAIAnalyzer {
  private openai: OpenAI
  
  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey })
  }

  /**
   * Main analysis function - orchestrates the entire analysis flow
   */
  async analyzePerformance(request: AnalysisRequest): Promise<AnalysisResponse> {
    logger.info('Starting AI-powered analysis', { 
      accountName: request.accountName,
      promptLength: request.prompt.length 
    })

    try {
      // Step 1: Use AI to understand the request and generate GAQL queries
      const queries = await this.generateAnalysisQueries(request.prompt)
      logger.info('Generated analysis queries', { queryCount: queries.length })

      // Step 2: Execute all queries and collect data
      // Note: Actual execution will be done by the route handler
      // This function returns the queries to be executed
      
      return {
        queries,
        monthlyData: [], // Will be populated after query execution
        insights: '',
        recommendations: '',
        comparison: ''
      }
    } catch (error) {
      logger.error('AI analysis failed', { error })
      throw error
    }
  }

  /**
   * Generate multiple GAQL queries based on analysis request
   */
  private async generateAnalysisQueries(prompt: string): Promise<GAQLQuery[]> {
    const systemPrompt = `You are a Google Ads GAQL query expert. Analyze the user's request and generate multiple GAQL queries to collect all necessary data.

IMPORTANT RULES:
1. Generate separate queries for each month requested
2. Include queries for: campaigns, keywords, ad groups
3. Always use segments.date for date filtering
4. Always include campaign.status != 'REMOVED' in WHERE clause
5. For conversions (leads), use metrics.conversions
6. For spend, use metrics.cost_micros (divide by 1,000,000 for actual cost)

AVAILABLE METRICS:
- metrics.cost_micros (spend in micros)
- metrics.conversions (leads/conversions)
- metrics.clicks, metrics.impressions
- metrics.ctr, metrics.average_cpc
- metrics.conversions_value

AVAILABLE RESOURCES:
- campaign (for campaign-level data)
- keyword_view (for keyword performance - MUST include campaign.name)
- ad_group (for ad group performance - MUST include campaign.name)

CRITICAL: Always include campaign.name in SELECT clause for ALL queries!

Return a JSON object with a "queries" array like this:
{
  "queries": [
    {
      "query": "SELECT campaign.name, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '2025-05-01' AND '2025-05-31' AND campaign.status != 'REMOVED'",
      "month": "May 2025",
      "purpose": "Campaign performance for May"
    },
    {
      "query": "SELECT campaign.name, ad_group.name, metrics.cost_micros, metrics.conversions FROM ad_group WHERE segments.date BETWEEN '2025-05-01' AND '2025-05-31' AND campaign.status != 'REMOVED'",
      "month": "May 2025",
      "purpose": "Ad group performance for May"
    },
    {
      "query": "SELECT campaign.name, ad_group_criterion.keyword.text, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE segments.date BETWEEN '2025-05-01' AND '2025-05-31' AND campaign.status != 'REMOVED'",
      "month": "May 2025",
      "purpose": "Keyword performance for May"
    }
  ]
}

Generate queries for ALL months requested and ALL data types needed (campaigns, keywords, ad groups).`

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('No response from OpenAI')
      }

      logger.info('OpenAI response received', { contentLength: content.length, content: content.substring(0, 200) })

      const parsed = JSON.parse(content)
      const queries = parsed.queries || []
      
      if (queries.length === 0) {
        logger.warn('No queries generated', { parsed })
      }
      
      logger.info('AI generated queries', { count: queries.length, queries })
      return queries
    } catch (error) {
      logger.error('Failed to generate queries with AI', { error, errorMessage: error instanceof Error ? error.message : 'Unknown' })
      throw new Error(`AI query generation failed: ${error}`)
    }
  }

  /**
   * Analyze collected data and generate insights
   */
  async generateInsights(
    monthlyData: MonthlyData[],
    originalPrompt: string
  ): Promise<{
    insights: string
    recommendations: string
    comparison: string
  }> {
    logger.info('Generating AI insights', { monthCount: monthlyData.length })

    const dataContext = JSON.stringify(monthlyData, null, 2)
    
    const systemPrompt = `You are a Google Ads performance analyst. Analyze the provided data and generate detailed insights.

Focus on:
1. CPL (Cost Per Lead) trends across months
2. Identify best performing periods and why
3. Campaign/keyword/ad group performance analysis
4. Month-over-month comparisons
5. Actionable recommendations

Provide insights in a clear, structured format with specific numbers and examples.`

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `Original Request: ${originalPrompt}\n\nData:\n${dataContext}\n\nProvide detailed analysis covering:\n1. Overall performance insights\n2. What worked well (low CPL, high leads)\n3. Month-over-month comparison (especially July vs May/June)\n4. Specific recommendations` 
          }
        ],
        temperature: 0.3
      })

      const content = response.choices[0]?.message?.content || ''
      
      // Split the response into sections
      const sections = this.parseInsightsSections(content)
      
      return sections
    } catch (error) {
      logger.error('Failed to generate insights', { error })
      throw new Error(`AI insights generation failed: ${error}`)
    }
  }

  /**
   * Parse AI response into structured sections
   */
  private parseInsightsSections(content: string): {
    insights: string
    recommendations: string
    comparison: string
  } {
    // Simple parsing - can be enhanced
    const sections = content.split('\n\n')
    
    return {
      insights: sections.slice(0, Math.floor(sections.length / 3)).join('\n\n'),
      recommendations: sections.slice(Math.floor(sections.length / 3), Math.floor(2 * sections.length / 3)).join('\n\n'),
      comparison: sections.slice(Math.floor(2 * sections.length / 3)).join('\n\n')
    }
  }

  /**
   * Process raw Google Ads API responses into monthly data structure
   */
  processMonthlyData(
    apiResponses: any[],
    queries: GAQLQuery[]
  ): MonthlyData[] {
    logger.info('Processing monthly data', { responseCount: apiResponses.length })

    const monthlyMap = new Map<string, MonthlyData>()

    apiResponses.forEach((response, index) => {
      const query = queries[index]
      if (!query) return

      const month = query.month
      
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, {
          month,
          spends: 0,
          leads: 0,
          cpl: 0,
          campaigns: [],
          keywords: [],
          adGroups: []
        })
      }

      const monthData = monthlyMap.get(month)!
      
      // Process response based on query purpose
      if (query.purpose.includes('campaign')) {
        monthData.campaigns = response.results || []
        // Calculate totals
        response.results?.forEach((row: any) => {
          monthData.spends += (row.metrics?.cost_micros || 0) / 1000000
          monthData.leads += row.metrics?.conversions || 0
        })
      } else if (query.purpose.includes('keyword')) {
        monthData.keywords = response.results || []
      } else if (query.purpose.includes('ad group')) {
        monthData.adGroups = response.results || []
      }
    })

    // Calculate CPL for each month
    monthlyMap.forEach((data) => {
      data.cpl = data.leads > 0 ? data.spends / data.leads : 0
    })

    return Array.from(monthlyMap.values())
  }
}

/**
 * Helper function to detect if a prompt requires deep analysis
 */
export function isDeepAnalysisRequest(prompt: string): boolean {
  const analysisKeywords = [
    'deep dive',
    'analysis',
    'investigate',
    'compare',
    'month-by-month',
    'breakdown',
    'performance analysis',
    'what went well',
    'identify',
    'cpl',
    'cost per lead'
  ]

  const lowerPrompt = prompt.toLowerCase()
  return analysisKeywords.some(keyword => lowerPrompt.includes(keyword))
}
