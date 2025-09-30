// PPC Template System for Google Ads Analysis

export interface PPCTemplate {
  id: string
  name: string
  description: string
  prompt: string
  requiredParams: string[]
  outputFormat: 'table' | 'analysis' | 'comparison' | 'table_with_analysis' | 'structured_table' | 'dual_table'
  parameters: PPCTemplateParameter[]
}

export interface PPCTemplateParameter {
  name: string
  type: 'account' | 'dateRange' | 'metric' | 'campaign' | 'string' | 'number'
  required: boolean
  options?: string[]
  defaultValue?: any
}

export interface PPCReportResult {
  templateId: string
  templateName: string
  accounts: string[]
  dateRange: {
    startDate: string
    endDate: string
  }
  data: any[]
  analysis?: string
  tables?: Record<string, any[]>
  insights?: string[]
  recommendations?: string[]
}

export const PPC_TEMPLATES: Record<string, PPCTemplate> = {
  performance_highlights: {
    id: 'performance_highlights',
    name: 'Performance Highlights',
    description: 'CPL and spend analysis across multiple accounts with month-by-month breakdown',
    prompt: `Access Google Ads accounts for {accounts} via MCP integration.
Task: Deep dive into CPL (Cost Per Lead) and total ad spends.
Period: {startDate} to {endDate} (month-by-month breakdown)
Status: All campaigns and ad groups (including paused/removed for complete picture)

Required Output - Table Format:
Generate a table showing month-on-month performance for each account:
| Account Name | Month | Spends | Leads | Cost Per Lead |

Analysis Sections:
1. Low CPL & High Leads Analysis: Identify what went well in high-performing months
2. Campaign/Ad Group Performance: Specific overperforming elements
3. Keyword Performance: High-volume, low-cost keywords
4. July vs Other Months Comparison: Significant changes and reasons`,
    requiredParams: ['accounts', 'startDate', 'endDate'],
    outputFormat: 'table_with_analysis',
    parameters: [
      {
        name: 'accounts',
        type: 'account',
        required: true
      },
      {
        name: 'startDate',
        type: 'dateRange',
        required: true
      },
      {
        name: 'endDate',
        type: 'dateRange',
        required: true
      }
    ]
  },

  asset_gap: {
    id: 'asset_gap',
    name: 'Asset Gap Analysis',
    description: 'Identify missing ad assets and extensions for optimal performance',
    prompt: `Perform detailed asset and ad extension gap analysis for {account}.

Instructions:
1. Access {account} Google Ads data via simulated MCP connection
2. Review all active ads, ad extensions, and Pmax campaigns
3. Perform asset audit comparing current vs optimal counts:
   - Headlines (RSA): Optimal = 15
   - Descriptions (RSA): Optimal = 4
   - Ad Extensions: Check against Google best practices
   - Pmax Asset Groups: Full asset utilization check

Output Format - Structured Table:
| Campaign Name | Ad Group Name | Ad Name/ID | Asset Type | Used | Required | Gap Status | Suggestions |

Focus: {industry} industry-specific suggestions for common search queries and customer pain points.`,
    requiredParams: ['account', 'industry'],
    outputFormat: 'structured_table',
    parameters: [
      {
        name: 'account',
        type: 'account',
        required: true
      },
      {
        name: 'industry',
        type: 'string',
        required: true,
        defaultValue: 'HVAC'
      }
    ]
  },

  sqr_analysis: {
    id: 'sqr_analysis',
    name: 'Search Query Report Analysis',
    description: 'Identify positive and negative keyword opportunities from search terms',
    prompt: `Access {account} Google Ads search term report via MCP integration.

Data Retrieval:
- Period: {startDate} to {endDate}
- Pull search term report + existing keywords + negative keywords
- Target CPA: {targetCPA}
- Geographic Focus: {geoTargets}

Analysis Criteria:
Positive Keywords:
- Sufficient spend (cost > $0)
- CPA ≤ {targetCPA}
- Relevant to business services
- Geographic relevance to target counties
- Exclude broad terms and competitor keywords

Negative Keywords:
- Spending money but irrelevant
- CPA > {targetCPA}
- Competitor terms (if underperforming)

Output: Two separate tables
Table 1: Positive Keyword Recommendations
Table 2: Negative Keyword Recommendations`,
    requiredParams: ['account', 'startDate', 'endDate', 'targetCPA', 'geoTargets'],
    outputFormat: 'dual_table',
    parameters: [
      {
        name: 'account',
        type: 'account',
        required: true
      },
      {
        name: 'startDate',
        type: 'dateRange',
        required: true
      },
      {
        name: 'endDate',
        type: 'dateRange',
        required: true
      },
      {
        name: 'targetCPA',
        type: 'number',
        required: true,
        defaultValue: 80
      },
      {
        name: 'geoTargets',
        type: 'string',
        required: true,
        defaultValue: 'Baldwin County, Mobile County, Escambia County, Santa Rosa County'
      }
    ]
  },

  top_spending_keywords: {
    id: 'top_spending_keywords',
    name: 'Top Spending Keywords Analysis',
    description: 'Week-on-week performance analysis of highest spending keywords',
    prompt: `Access {account} Google Ads keyword-level data via MCP integration.

Data Extraction:
- Period: {startDate} to {endDate}
- Segment: Week-on-week breakdown
- Columns: Campaign, Ad Group, Keyword, Match Type, Impressions, Clicks, Cost, Conversions, Search Impression Share

Analysis Steps:
1. Identify top 30 keywords by spend
2. Create week-on-week performance pivot
3. Calculate metrics: CPC, Cost/Conversion, Impression Share
4. Add performance comments for latest week vs previous weeks

Output: Tabular format with weekly breakdown and performance insights`,
    requiredParams: ['account', 'startDate', 'endDate'],
    outputFormat: 'table_with_analysis',
    parameters: [
      {
        name: 'account',
        type: 'account',
        required: true
      },
      {
        name: 'startDate',
        type: 'dateRange',
        required: true
      },
      {
        name: 'endDate',
        type: 'dateRange',
        required: true
      }
    ]
  },

  segment_analysis: {
    id: 'segment_analysis',
    name: 'Segment Performance Analysis',
    description: 'Comprehensive segmentation analysis across multiple dimensions',
    prompt: `Access {account} Google Ads segment data via MCP integration.

Period: {startDate} to {endDate}

Generate separate tables for each segment:
1. Day of the week
2. Hour of the day (0-23)
3. Age demographics
4. Gender demographics
5. Device type (mobile, desktop, tablet)
6. Network (Search, Display)
7. Brand vs Non-brand campaigns
8. City performance
9. Audience segments

Each table includes: Impressions, Clicks, Cost, % Cost, CTR, CPC, Conversions, Cost/Conversion

Campaign Type Breakdown: Brand Search, Non-brand Search, Pmax for each segment`,
    requiredParams: ['account', 'startDate', 'endDate'],
    outputFormat: 'analysis',
    parameters: [
      {
        name: 'account',
        type: 'account',
        required: true
      },
      {
        name: 'startDate',
        type: 'dateRange',
        required: true
      },
      {
        name: 'endDate',
        type: 'dateRange',
        required: true
      }
    ]
  },

  geo_performance: {
    id: 'geo_performance',
    name: 'Geographic Performance Analysis',
    description: 'Location targeting efficiency and spend allocation analysis',
    prompt: `Access {account} Google Ads geographic performance data via MCP integration.

Analysis Focus:
- Target Location vs User Location verification
- Spend allocation to targeted vs untargeted locations
- County-level performance breakdown

Dimensions:
- Target Location (campaign targeting settings)
- User Location (actual user location)
- County Matched (user location county mapping)

Metrics: Impressions, Clicks, Cost, Conversions, Conversion Value
Calculated: CPL (Cost/Conversions), ROAS (Conversion Value/Cost)

Output: Geographic performance table with spend efficiency comments and actionable recommendations`,
    requiredParams: ['account'],
    outputFormat: 'table_with_analysis',
    parameters: [
      {
        name: 'account',
        type: 'account',
        required: true
      }
    ]
  }
}

// Helper function to get template by ID
export function getTemplate(templateId: string): PPCTemplate | null {
  return PPC_TEMPLATES[templateId] || null
}

// Helper function to get all template IDs
export function getTemplateIds(): string[] {
  return Object.keys(PPC_TEMPLATES)
}

// Helper function to validate template parameters
export function validateTemplateParams(template: PPCTemplate, params: Record<string, any>): string[] {
  const errors: string[] = []
  
  for (const param of template.parameters) {
    if (param.required && !params[param.name]) {
      errors.push(`Missing required parameter: ${param.name}`)
    }
  }
  
  return errors
}
