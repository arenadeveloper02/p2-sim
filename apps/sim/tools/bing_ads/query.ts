import { createLogger } from '@/lib/logs/console/logger'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('BingAdsQuery')

interface BingAdsQueryParams {
  account: string
  query: string
}

interface BingAdsAccount {
  id: string
  name: string
}

// Bing Ads (Microsoft Advertising) accounts mapping
// Customer ID: C000736328 (Position2 Inc.)
export const BING_ADS_ACCOUNTS: Record<string, BingAdsAccount> = {
  position2_inc: { id: 'C000736328', name: 'Position2 Inc.' },
  '247insider': { id: 'F113ZL2Q', name: '247Insider.com' },
  absolute_software: { id: 'X7721510', name: 'Absolute Software' },
  altula: { id: 'X7854216', name: 'Altula' },
  amazon_b2b: { id: 'B011MVGU', name: 'Amazon B2B' },
  amazon_web_services: { id: 'B010UE8C', name: 'Amazon Web Services' },
  antivirusreviews: { id: 'F120FMNQ', name: 'AntiVirusReviews.com' },
  autoarena: { id: 'F119PZDA', name: 'AutoArena.com' },
  bargain_net: { id: 'F120JYA3', name: 'Bargain.net' },
  beauterre: { id: 'F143RVD7', name: 'Beauterre' },
  big_g_creative: { id: 'F142Q248', name: 'Big G Creative' },
  bingelocal: { id: 'F120VDGC', name: 'BingeLocal.net' },
  blackfridaystreet: { id: 'F118RML5', name: 'BlackFridayStreet.com' },
  blackfriyay: { id: 'F119W1DJ', name: 'BlackFriyay.com' },
  botmetric: { id: 'B041R11F', name: 'Botmetric' },
  businessbytes: { id: 'F118NT2T', name: 'BusinessBytes.net' },
  capitalcitynurses: { id: 'F120K5EG', name: 'CapitalCityNurses.com' },
  careadvantage: { id: 'F120L8EF', name: 'CareAdvantage' },
  cellphones_guru: { id: 'F120QC4N', name: 'Cellphones.Guru Bing' },
  comfort_soul: { id: 'F1196AW7', name: 'Comfort Soul' },
  cutting_edge_firewood: { id: 'F120JLPM', name: 'Cutting Edge Firewood' },
  cybermondaypicks: { id: 'F119JS7T', name: 'CyberMondayPicks.com' },
  dealsdivine: { id: 'F119T3ZT', name: 'DealsDivine.com' },
  dealsfarms: { id: 'F119FJLP', name: 'DealsFarms.com' },
  discoverlocal: { id: 'F120QD4Q', name: 'DiscoverLocal.net' },
  factuia: { id: 'F113ZYXE', name: 'Factuia.com' },
  findanswerstoday: { id: 'F119YZNS', name: 'FindAnswersToday.com' },
  gentle_dental: { id: '151000820', name: 'Gentle Dental' },
  healthatoz: { id: 'F118679G', name: 'HealthAtoZ.net Bing' },
  hunter_fans: { id: 'F120FD4H', name: 'Hunter Fans' },
  infosavant: { id: 'F113NE34', name: 'InfoSavant.net' },
  karrot: { id: 'B017TFLL', name: 'Karrot' },
  kitchenaid: { id: 'F108SUNH', name: 'KitchenAid' },
  knownemo: { id: 'F119EYGD', name: 'KnowNemo.com' },
  localwizard: { id: 'F120MKTP', name: 'Localwizard.net' },
  mobilesarena: { id: 'F118791H', name: 'MobilesArena.com' },
  offerspod: { id: 'F119BMSP', name: 'OffersPod.com' },
  position2mcc: { id: 'X7420892', name: 'position2mcc' },
  power_wizard: { id: 'F149WSPC', name: 'Power Wizard' },
  quorumlabs: { id: 'X0411997', name: 'QuorumLabs, Inc' },
  reciprocity: { id: 'F132WPW3', name: 'Reciprocity Inc.' },
  resultsbee: { id: 'F120SGQF', name: 'Resultsbee.com' },
  rheem_commercial: { id: 'F120MPUQ', name: 'Rheem Commercial-Water' },
  richrelevance: { id: 'F142WJ32', name: 'RichRelevance' },
  ruckus: { id: 'F1209U1D', name: 'Ruckus' },
  sandstone_diagnostics: { id: 'F108DPJE', name: 'Sandstone Diagnostics' },
  seasondeals: { id: 'F1203CJ7', name: 'seasondeals.store' },
  seeknemo_uk: { id: 'F119ZUAP', name: 'SeekNemo.com - UK' },
}

export const bingAdsQueryTool: ToolConfig<BingAdsQueryParams, any> = {
  id: 'bing_ads_query',
  version: '1.0.0',
  name: 'Bing Ads Query',
  description:
    'Query Microsoft Advertising (Bing Ads) API for campaign performance, ad metrics, and account insights using natural language. Supports all Position2 Bing Ads accounts.',
  params: {
    account: {
      type: 'string',
      description: 'Bing Ads account identifier',
      required: true,
      visibility: 'user-or-llm',
    },
    query: {
      type: 'string',
      description: 'Natural language query about Bing Ads data',
      required: true,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: () => '/api/bing-ads-v1/query',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: BingAdsQueryParams) => ({
      account: params.account,
      query: params.query,
    }),
  },
  transformResponse: async (response: Response, params?: BingAdsQueryParams) => {
    try {
      logger.info('Processing Bing Ads response', {
        status: response.status,
        account: params?.account,
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Bing Ads API request failed', {
          status: response.status,
          error: errorText,
        })
        throw new Error(`Bing Ads API request failed: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      logger.info('Bing Ads query successful', {
        account: params?.account,
        dataLength: data.data?.length || 0,
      })

      return {
        success: true,
        output: data,
      }
    } catch (error) {
      logger.error('Bing Ads query execution failed', { error, account: params?.account })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  },
}
