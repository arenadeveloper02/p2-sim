import type { ToolResponse } from '@/tools/types'

export interface IndustryBenchmarkParams {
  clientAccount: string
  googleAdsData: any
  timePeriod: string
  includeCompetitorAnalysis: boolean
  exaApiKey: string
  openaiApiKey: string
}

export interface LocationRecommendation {
  location: string
  reason: string
  suggestedBudget: string
}

export interface ABTestRecommendation {
  test: string
  variantA: string
  variantB: string
  expectedImpact: string
}

export interface IndustryBenchmarkResponse extends ToolResponse {
  output: {
    client: string
    industry: string
    demographics: {
      targetAgeGroups: string[]
      targetIncome: string
      primeLocations: string[]
      genderSplit: string
    }
    googleAdsPerformance: {
      ctr: string
      cpc: string
      conversionRate: string
      cost: string
      impressions: number
      clicks: number
      conversions: number
    }
    industryBenchmarks: {
      avgCtr: string
      avgCpc: string
      avgConversionRate: string
      topPerformerCtr: string
    }
    performanceGaps: {
      ctr: string
      cpc: string
      conversionRate: string
    }
    locationRecommendations: LocationRecommendation[]
    abTestingRecommendations: ABTestRecommendation[]
    demographicInsights: string[]
    competitorInsights: string[]
  }
}
