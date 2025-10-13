import { createLogger } from '@/lib/logs/console/logger'
import { getIndustryData } from '@/lib/industry-mapping'
import type { ToolConfig } from '@/tools/types'
import type { IndustryBenchmarkParams, IndustryBenchmarkResponse } from './types'

const logger = createLogger('IndustryBenchmarkTool')

export const industryBenchmarkTool: ToolConfig<
  IndustryBenchmarkParams,
  IndustryBenchmarkResponse
> = {
  id: 'industry_benchmark_analyze',
  name: 'Industry Benchmark Analysis',
  description: 'Analyze Google Ads performance against industry benchmarks with AI insights',
  version: '1.0.0',

  params: {
    clientAccount: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Client account identifier',
    },
    googleAdsData: {
      type: 'object',
      required: true,
      visibility: 'user-or-llm',
      description: 'Google Ads performance data',
    },
    timePeriod: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Analysis time period',
    },
    includeCompetitorAnalysis: {
      type: 'boolean',
      required: false,
      visibility: 'user-only',
      description: 'Whether to include competitor analysis',
    },
    exaApiKey: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Exa API key for web research',
    },
    openaiApiKey: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'OpenAI API key for AI analysis',
    },
  },

  request: {
    url: () => 'internal://industry-benchmark',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params) => params,
  },

  transformResponse: async (response: Response, params): Promise<IndustryBenchmarkResponse> => {
    if (!params) {
      throw new Error('Parameters are required')
    }

    try {
      logger.info('Starting industry benchmark analysis', { client: params.clientAccount })

      // Step 1: Get industry data for the client
      const industryData = getIndustryData(params.clientAccount)
      if (!industryData) {
        throw new Error(`No industry data found for client: ${params.clientAccount}`)
      }

      logger.info('Industry data retrieved', {
        industry: industryData.industry,
        category: industryData.category,
      })

      // Step 2: Extract Google Ads metrics
      const googleAdsMetrics = extractGoogleAdsMetrics(params.googleAdsData)
      logger.info('Google Ads metrics extracted', googleAdsMetrics)

      // Step 3: Search for industry benchmarks using Exa
      const benchmarkData = await searchIndustryBenchmarks(
        industryData.searchTerms,
        params.exaApiKey
      )
      logger.info('Industry benchmarks retrieved', { sources: benchmarkData.sources.length })

      // Step 4: Extract benchmark numbers using OpenAI
      const industryBenchmarks = await extractBenchmarks(
        benchmarkData.content,
        industryData.industry,
        params.openaiApiKey
      )
      logger.info('Benchmarks extracted', industryBenchmarks)

      // Step 5: Calculate performance gaps
      const performanceGaps = calculatePerformanceGaps(googleAdsMetrics, industryBenchmarks)
      logger.info('Performance gaps calculated', performanceGaps)

      // Step 6: Get competitor insights (if enabled)
      let competitorInsights: string[] = []
      if (params.includeCompetitorAnalysis) {
        competitorInsights = await getCompetitorInsights(
          industryData.industry,
          params.exaApiKey,
          params.openaiApiKey
        )
        logger.info('Competitor insights generated', { count: competitorInsights.length })
      }

      // Step 7: Generate AI recommendations
      const recommendations = await generateRecommendations(
        googleAdsMetrics,
        industryBenchmarks,
        performanceGaps,
        industryData,
        params.openaiApiKey
      )
      logger.info('Recommendations generated')

      // Step 8: Build final response
      const response: IndustryBenchmarkResponse = {
        success: true,
        output: {
          client: params.clientAccount,
          industry: industryData.industry,
          demographics: industryData.demographics,
          googleAdsPerformance: googleAdsMetrics,
          industryBenchmarks,
          performanceGaps,
          locationRecommendations: recommendations.locations,
          abTestingRecommendations: recommendations.abTests,
          demographicInsights: recommendations.demographics,
          competitorInsights,
        },
      }

      logger.info('Industry benchmark analysis completed successfully')
      return response
    } catch (error) {
      logger.error('Industry benchmark analysis failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        output: {
          client: params.clientAccount,
          industry: '',
          demographics: {
            targetAgeGroups: [],
            targetIncome: '',
            primeLocations: [],
            genderSplit: '',
          },
          googleAdsPerformance: {
            ctr: '0%',
            cpc: '$0',
            conversionRate: '0%',
            cost: '$0',
            impressions: 0,
            clicks: 0,
            conversions: 0,
          },
          industryBenchmarks: {
            avgCtr: '0%',
            avgCpc: '$0',
            avgConversionRate: '0%',
            topPerformerCtr: '0%',
          },
          performanceGaps: {
            ctr: 'N/A',
            cpc: 'N/A',
            conversionRate: 'N/A',
          },
          locationRecommendations: [],
          abTestingRecommendations: [],
          demographicInsights: [],
          competitorInsights: [],
        },
      }
    }
  },
}

// Helper function to extract Google Ads metrics
function extractGoogleAdsMetrics(googleAdsData: any) {
  try {
    // Handle different Google Ads data structures
    const results = googleAdsData?.results || googleAdsData || []
    const firstResult = Array.isArray(results) ? results[0] : results

    const impressions = firstResult?.impressions || 0
    const clicks = firstResult?.clicks || 0
    const cost = firstResult?.cost || firstResult?.cost_micros / 1000000 || 0
    const conversions = firstResult?.conversions || 0

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
    const cpc = clicks > 0 ? cost / clicks : 0
    const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0

    return {
      ctr: `${ctr.toFixed(2)}%`,
      cpc: `$${cpc.toFixed(2)}`,
      conversionRate: `${conversionRate.toFixed(2)}%`,
      cost: `$${cost.toFixed(2)}`,
      impressions,
      clicks,
      conversions,
    }
  } catch (error) {
    logger.error('Error extracting Google Ads metrics', { error })
    return {
      ctr: '0%',
      cpc: '$0',
      conversionRate: '0%',
      cost: '$0',
      impressions: 0,
      clicks: 0,
      conversions: 0,
    }
  }
}

// Helper function to search for industry benchmarks
async function searchIndustryBenchmarks(searchTerms: string[], exaApiKey: string) {
  try {
    const allContent: string[] = []
    const allSources: string[] = []

    // Search for each term
    for (const term of searchTerms.slice(0, 2)) {
      // Limit to 2 searches to avoid rate limits
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': exaApiKey,
        },
        body: JSON.stringify({
          query: term,
          numResults: 3,
          useAutoprompt: true,
          type: 'auto',
          contents: {
            text: true,
          },
        }),
      })

      if (!response.ok) {
        logger.warn('Exa search failed', { term, status: response.status })
        continue
      }

      const data = await response.json()
      const results = data.results || []

      for (const result of results) {
        if (result.text) {
          allContent.push(result.text.substring(0, 1000)) // Limit text length
          allSources.push(result.url)
        }
      }
    }

    return {
      content: allContent.join('\n\n'),
      sources: allSources,
    }
  } catch (error) {
    logger.error('Error searching industry benchmarks', { error })
    return {
      content: '',
      sources: [],
    }
  }
}

// Helper function to extract benchmarks using OpenAI
async function extractBenchmarks(content: string, industry: string, openaiApiKey: string) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a data extraction expert. Extract numerical benchmarks for ${industry} from the provided content. Return ONLY a JSON object with these fields: avgCtr, avgCpc, avgConversionRate, topPerformerCtr. Use percentage format for CTR and conversion rate (e.g., "2.5%"), and dollar format for CPC (e.g., "$3.50"). If data is not found, use reasonable industry estimates.`,
          },
          {
            role: 'user',
            content: `Extract ${industry} PPC benchmarks from this content:\n\n${content.substring(0, 3000)}`,
          },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    const benchmarks = JSON.parse(data.choices[0].message.content)

    return {
      avgCtr: benchmarks.avgCtr || '2.5%',
      avgCpc: benchmarks.avgCpc || '$3.50',
      avgConversionRate: benchmarks.avgConversionRate || '4.0%',
      topPerformerCtr: benchmarks.topPerformerCtr || '3.5%',
    }
  } catch (error) {
    logger.error('Error extracting benchmarks', { error })
    // Return default benchmarks
    return {
      avgCtr: '2.5%',
      avgCpc: '$3.50',
      avgConversionRate: '4.0%',
      topPerformerCtr: '3.5%',
    }
  }
}

// Helper function to calculate performance gaps
function calculatePerformanceGaps(googleAds: any, benchmarks: any) {
  const clientCtr = parseFloat(googleAds.ctr)
  const benchmarkCtr = parseFloat(benchmarks.avgCtr)
  const ctrGap = benchmarkCtr > 0 ? ((clientCtr - benchmarkCtr) / benchmarkCtr) * 100 : 0

  const clientCpc = parseFloat(googleAds.cpc.replace('$', ''))
  const benchmarkCpc = parseFloat(benchmarks.avgCpc.replace('$', ''))
  const cpcGap = benchmarkCpc > 0 ? ((clientCpc - benchmarkCpc) / benchmarkCpc) * 100 : 0

  const clientConvRate = parseFloat(googleAds.conversionRate)
  const benchmarkConvRate = parseFloat(benchmarks.avgConversionRate)
  const convRateGap =
    benchmarkConvRate > 0 ? ((clientConvRate - benchmarkConvRate) / benchmarkConvRate) * 100 : 0

  return {
    ctr: `${ctrGap > 0 ? '+' : ''}${ctrGap.toFixed(0)}% ${ctrGap < 0 ? '(underperforming)' : '(outperforming)'}`,
    cpc: `${cpcGap > 0 ? '+' : ''}${cpcGap.toFixed(0)}% ${cpcGap > 0 ? '(overpaying)' : '(efficient)'}`,
    conversionRate: `${convRateGap > 0 ? '+' : ''}${convRateGap.toFixed(0)}% ${convRateGap < 0 ? '(underperforming)' : '(outperforming)'}`,
  }
}

// Helper function to get competitor insights
async function getCompetitorInsights(
  industry: string,
  exaApiKey: string,
  openaiApiKey: string
): Promise<string[]> {
  try {
    // Search for competitor strategies
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': exaApiKey,
      },
      body: JSON.stringify({
        query: `${industry} top competitors advertising strategies 2025`,
        numResults: 3,
        useAutoprompt: true,
        contents: {
          text: true,
        },
      }),
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    const content = data.results
      ?.map((r: any) => r.text?.substring(0, 500))
      .filter(Boolean)
      .join('\n\n')

    // Use OpenAI to extract insights
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Extract 3-5 key competitor insights from the content. Return as a JSON array of strings.',
          },
          {
            role: 'user',
            content: `Extract competitor insights for ${industry}:\n\n${content}`,
          },
        ],
        temperature: 0.5,
        response_format: { type: 'json_object' },
      }),
    })

    const aiData = await aiResponse.json()
    const insights = JSON.parse(aiData.choices[0].message.content)
    return insights.insights || []
  } catch (error) {
    logger.error('Error getting competitor insights', { error })
    return []
  }
}

// Helper function to generate recommendations
async function generateRecommendations(
  googleAds: any,
  benchmarks: any,
  gaps: any,
  industryData: any,
  openaiApiKey: string
) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a digital marketing expert. Generate actionable recommendations based on performance data. Return JSON with: locations (array of {location, reason, suggestedBudget}), abTests (array of {test, variantA, variantB, expectedImpact}), demographics (array of strings).`,
          },
          {
            role: 'user',
            content: `Industry: ${industryData.industry}
Target Demographics: ${JSON.stringify(industryData.demographics)}
Current Performance: ${JSON.stringify(googleAds)}
Industry Benchmarks: ${JSON.stringify(benchmarks)}
Performance Gaps: ${JSON.stringify(gaps)}

Generate recommendations for location targeting, A/B testing, and demographic insights.`,
          },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    })

    const data = await response.json()
    const recommendations = JSON.parse(data.choices[0].message.content)

    return {
      locations: recommendations.locations || [],
      abTests: recommendations.abTests || [],
      demographics: recommendations.demographics || [],
    }
  } catch (error) {
    logger.error('Error generating recommendations', { error })
    return {
      locations: [],
      abTests: [],
      demographics: [],
    }
  }
}
