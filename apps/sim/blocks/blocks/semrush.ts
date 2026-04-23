import { SemrushIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { SemrushResponse } from '@/tools/semrush/types'

export const SemrushBlock: BlockConfig<SemrushResponse> = {
  type: 'semrush',
  name: 'Semrush',
  description: 'Get SEO data from Semrush',
  longDescription:
    'Access Semrush SEO data including organic keywords, backlinks, domain rank, and competitor analysis.',
  docsLink: '',
  category: 'tools',
  bgColor: '#E0E0E0',
  icon: SemrushIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      required: true,
      options: [
        { label: 'Get Organic Keywords for URL', id: 'url_organic' },
        { label: 'Get Domain Organic Keywords', id: 'domain_organic' },
        { label: 'Get Organic Competitors', id: 'domain_organic_organic' },
        { label: 'Get Domain Rank', id: 'domain_rank' },
        { label: 'Organic Positions Report (Position Tracking)', id: 'tracking_position_organic' },
      ],
      value: () => 'url_organic',
    },
    // URL input - shown for URL-based reports
    {
      id: 'url',
      title: 'URL',
      type: 'short-input',
      placeholder: 'https://example.com/page',
      required: true,
      condition: {
        field: 'operation',
        value: ['url_organic'],
      },
    },
    // Domain input - shown for domain-based reports
    {
      id: 'domain',
      title: 'Domain',
      type: 'short-input',
      placeholder: 'example.com',
      required: true,
      condition: {
        field: 'operation',
        value: ['domain_organic', 'domain_organic_organic', 'domain_rank'],
      },
    },
    // Position Tracking: campaign ID
    {
      id: 'campaignId',
      title: 'Campaign ID',
      type: 'short-input',
      placeholder: 'e.g. 103345921_15710',
      required: true,
      description: 'Position Tracking campaign ID from your Semrush project',
      condition: {
        field: 'operation',
        value: ['tracking_position_organic'],
      },
    },
    // Position tracking URL mask (unique id avoids duplicate React keys with `url` for url_organic;
    // canonicalParamId maps to tool param `url` for semrush_organic_positions)
    {
      id: 'trackingUrl',
      title: 'Tracked URL',
      type: 'short-input',
      placeholder: '*.example.com/* or *.apple.com/*:*.amazon.com/*',
      required: true,
      canonicalParamId: 'url',
      description: 'URL with mask; use : to separate multiple domains',
      condition: {
        field: 'operation',
        value: ['tracking_position_organic'],
      },
    },
    // Position Tracking: date range
    {
      id: 'dateBegin',
      title: 'Date begin',
      type: 'short-input',
      placeholder: 'YYYYMMDD',
      description: 'Start date of the period',
      condition: {
        field: 'operation',
        value: ['tracking_position_organic'],
      },
    },
    {
      id: 'dateEnd',
      title: 'Date end',
      type: 'short-input',
      placeholder: 'YYYYMMDD',
      description: 'End date of the period',
      condition: {
        field: 'operation',
        value: ['tracking_position_organic'],
      },
    },
    // Position Tracking: linktype filter
    {
      id: 'linktypeFilter',
      title: 'Link type filter',
      type: 'dropdown',
      options: [
        { label: 'Include all', id: '0' },
        { label: 'Only local pack & hotels', id: '1' },
        { label: 'Exclude local pack', id: '2' },
        { label: 'Exclude hotels', id: '524288' },
        { label: 'Exclude local pack & hotels', id: '524290' },
        { label: 'Exclude AI Overview', id: '536870912' },
        { label: 'Exclude local pack & AI Overview', id: '536870914' },
        { label: 'Exclude local pack, hotels & AI Overview', id: '537395202' },
      ],
      value: () => '0',
      description: 'Include or exclude local pack, hotels, AI Overview',
      condition: {
        field: 'operation',
        value: ['tracking_position_organic'],
      },
    },
    // Position Tracking: display options
    {
      id: 'displaySort',
      title: 'Sort',
      type: 'dropdown',
      options: [
        { label: 'Position (domain 0) ascending', id: '0_pos_asc' },
        { label: 'Position (domain 0) descending', id: '0_pos_desc' },
        { label: 'Volume descending', id: 'nq_desc' },
        { label: 'Volume ascending', id: 'nq_asc' },
        { label: 'Keyword ascending', id: 'ph_asc' },
        { label: 'Keyword descending', id: 'ph_desc' },
        { label: 'Position change (domain 0) ascending', id: '0_diff_asc' },
        { label: 'Position change (domain 0) descending', id: '0_diff_desc' },
        { label: 'Visibility ascending', id: 'vi_asc' },
        { label: 'Visibility descending', id: 'vi_desc' },
      ],
      value: () => '0_pos_asc',
      condition: {
        field: 'operation',
        value: ['tracking_position_organic'],
      },
    },
    {
      id: 'displayOffset',
      title: 'Display offset',
      type: 'short-input',
      placeholder: '0',
      description: 'Skip this many results',
      condition: {
        field: 'operation',
        value: ['tracking_position_organic'],
      },
    },
    {
      id: 'displayTags',
      title: 'Display tags',
      type: 'short-input',
      placeholder: 'tag1|tag2 or tag1|-tag2',
      description: 'Filter by tags (| = OR, - = exclude)',
      condition: {
        field: 'operation',
        value: ['tracking_position_organic'],
      },
    },
    {
      id: 'displayTagsCondition',
      title: 'Display tags condition',
      type: 'short-input',
      placeholder: 'tag1&!tag2',
      description: 'Newer filter: | OR, & AND, ! exclude',
      condition: {
        field: 'operation',
        value: ['tracking_position_organic'],
      },
    },
    {
      id: 'displayFilter',
      title: 'Display filter',
      type: 'short-input',
      placeholder: 'e.g. +|Ph|Co|keyword',
      description: 'Filter for Ph, Nq, Cp columns (API display_filter)',
      condition: {
        field: 'operation',
        value: ['tracking_position_organic'],
      },
    },
    {
      id: 'topFilter',
      title: 'Top filter',
      type: 'short-input',
      placeholder: 'e.g. top_3, top_1page, top_100',
      description: 'Position filter (top_filter)',
      condition: {
        field: 'operation',
        value: ['tracking_position_organic'],
      },
    },
    {
      id: 'useVolume',
      title: 'Use volume',
      type: 'dropdown',
      options: [
        { label: 'Default', id: '' },
        { label: 'National', id: 'national' },
        { label: 'Regional', id: 'regional' },
        { label: 'Local', id: 'local' },
      ],
      value: () => '',
      description: 'Volume level for the report (use_volume)',
      condition: {
        field: 'operation',
        value: ['tracking_position_organic'],
      },
    },
    {
      id: 'businessName',
      title: 'Business name',
      type: 'short-input',
      placeholder: 'Google Business Profile name',
      description: 'Must match your Google Business Profile when required by the project',
      condition: {
        field: 'operation',
        value: ['tracking_position_organic'],
      },
    },
    {
      id: 'serpFeatureFilter',
      title: 'SERP feature filter',
      type: 'short-input',
      placeholder: 'e.g. fsn,0',
      description: 'SERP feature filter (serp_feature_filter), e.g. fsn,0 for Featured Snippet',
      condition: {
        field: 'operation',
        value: ['tracking_position_organic'],
      },
    },
    // Database
    {
      id: 'database',
      title: 'Database',
      type: 'dropdown',
      options: [
        { label: 'United States', id: 'us' },
        { label: 'United Kingdom', id: 'uk' },
        { label: 'Canada', id: 'ca' },
        { label: 'Australia', id: 'au' },
        { label: 'Germany', id: 'de' },
        { label: 'France', id: 'fr' },
        { label: 'Spain', id: 'es' },
        { label: 'Italy', id: 'it' },
        { label: 'Netherlands', id: 'nl' },
        { label: 'Poland', id: 'pl' },
        { label: 'Russia', id: 'ru' },
        { label: 'Japan', id: 'jp' },
        { label: 'Brazil', id: 'br' },
        { label: 'India', id: 'in' },
        { label: 'Mexico', id: 'mx' },
        { label: 'Argentina', id: 'ar' },
        { label: 'Switzerland', id: 'ch' },
        { label: 'Belgium', id: 'be' },
        { label: 'Denmark', id: 'dk' },
        { label: 'Finland', id: 'fi' },
        { label: 'Norway', id: 'no' },
        { label: 'Sweden', id: 'se' },
        { label: 'Turkey', id: 'tr' },
        { label: 'South Africa', id: 'za' },
        { label: 'Singapore', id: 'sg' },
        { label: 'Hong Kong', id: 'hk' },
        { label: 'New Zealand', id: 'nz' },
        { label: 'Ireland', id: 'ie' },
        { label: 'Portugal', id: 'pt' },
        { label: 'Greece', id: 'gr' },
        { label: 'Czech Republic', id: 'cz' },
        { label: 'Hungary', id: 'hu' },
        { label: 'Romania', id: 'ro' },
        { label: 'Malaysia', id: 'my' },
        { label: 'Thailand', id: 'th' },
        { label: 'Philippines', id: 'ph' },
        { label: 'Indonesia', id: 'id' },
        { label: 'Vietnam', id: 'vn' },
        { label: 'South Korea', id: 'kr' },
        { label: 'Taiwan', id: 'tw' },
        { label: 'China', id: 'cn' },
      ],
      value: () => 'us',
      condition: {
        field: 'operation',
        value: ['url_organic', 'domain_organic', 'domain_organic_organic'],
      },
    },
    // Display Limit
    {
      id: 'displayLimit',
      title: 'Display Limit',
      type: 'short-input',
      placeholder: '10',
      defaultValue: '10',
      description: 'Number of API rows to return (default 10)',
      condition: {
        field: 'operation',
        value: [
          'tracking_position_organic',
          'url_organic',
          'url_adwords',
          'domain_organic',
          'domain_adwords',
          'domain_organic_organic',
          'domain_adwords_adwords',
          'backlinks_overview',
          'backlinks_refdomains',
          'backlinks_backlinks',
        ],
      },
    },
    // Export Columns
    {
      id: 'exportColumns',
      title: 'Export Columns',
      type: 'short-input',
      placeholder: 'Ph,Nq,Cp',
      defaultValue: 'Ph,Nq,Cp',
      description: 'Comma-separated column codes (e.g., Ph=Phrase, Nq=Search Volume, Cp=CPC)',
      condition: {
        field: 'operation',
        value: ['url_organic', 'domain_organic', 'domain_organic_organic'],
      },
    },
    {
      id: 'apiKey',
      title: 'API Key',
      type: 'short-input',
      placeholder: 'Enter your Semrush API key',
      password: true,
      required: false,
      hidden: true,
      description: 'Enter your Semrush API key',
    },
  ],
  tools: {
    access: ['semrush_query', 'semrush_organic_positions'],
    config: {
      tool: (params: Record<string, any>) =>
        params.operation === 'tracking_position_organic'
          ? 'semrush_organic_positions'
          : 'semrush_query',
      params: (params: Record<string, any>) => {
        if (params.operation === 'tracking_position_organic') {
          const out: Record<string, unknown> = {
            campaignId: params.campaignId ?? '',
            url: (params.trackingUrl ?? params.url ?? '') as string,
            dateBegin: params.dateBegin || undefined,
            dateEnd: params.dateEnd || undefined,
            linktypeFilter: params.linktypeFilter || undefined,
            displayTags: params.displayTags || undefined,
            displayTagsCondition: params.displayTagsCondition || undefined,
            displaySort: params.displaySort || undefined,
            displayLimit: params.displayLimit || undefined,
            displayOffset: params.displayOffset || undefined,
            displayFilter: params.displayFilter || undefined,
            topFilter: params.topFilter || undefined,
            useVolume: params.useVolume || undefined,
            businessName: params.businessName || undefined,
            serpFeatureFilter: params.serpFeatureFilter || undefined,
            apiKey: params.apiKey || undefined,
          }
          if (out.displayLimit != null && out.displayLimit !== '') {
            out.displayLimit = String(out.displayLimit)
          }
          return out
        }

        // Exa-style: subBlock ids match tool param ids; only coerce when needed
        const out: Record<string, unknown> = {}
        if (params.displayLimit != null && params.displayLimit !== '') {
          out.displayLimit = String(params.displayLimit)
        }
        return out
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Semrush operation selection' },
    url: { type: 'string', description: 'Page URL to analyze (url_organic report)' },
    trackingUrl: {
      type: 'string',
      description: 'Position Tracking URL mask (tracking_position_organic)',
    },
    domain: { type: 'string', description: 'Domain to analyze' },
    database: { type: 'string', description: 'Geographic database code' },
    displayLimit: { type: 'string', description: 'Number of results to return (default 10)' },
    exportColumns: { type: 'string', description: 'Comma-separated column codes' },
    campaignId: { type: 'string', description: 'Position Tracking campaign ID' },
    dateBegin: { type: 'string', description: 'Start date YYYYMMDD' },
    dateEnd: { type: 'string', description: 'End date YYYYMMDD' },
    linktypeFilter: { type: 'string', description: 'Link type filter for Position Tracking' },
    displaySort: { type: 'string', description: 'Sort order for Position Tracking report' },
    displayOffset: { type: 'string', description: 'Pagination offset' },
    displayTags: { type: 'string', description: 'Tag filter for Position Tracking' },
    displayTagsCondition: { type: 'string', description: 'Tag condition filter' },
    displayFilter: { type: 'string', description: 'Column filter (Position Tracking display_filter)' },
    topFilter: { type: 'string', description: 'Position top_filter' },
    useVolume: { type: 'string', description: 'use_volume: national, regional, or local' },
    businessName: { type: 'string', description: 'Google Business Profile business name' },
    serpFeatureFilter: { type: 'string', description: 'SERP feature filter' },
    apiKey: {
      type: 'string',
      description: 'Semrush API key',
    },
  },
  outputs: {
    reportType: {
      type: 'string',
      description: 'Semrush report type (e.g. domain_organic, url_organic)',
    },
    data: {
      type: 'json',
      description: 'Parsed Semrush data as JSON array of objects (one per row)',
    },
    columns: {
      type: 'json',
      description: 'Column headers from the response',
    },
    totalRows: {
      type: 'number',
      description: 'Total number of data rows returned',
    },
    rawCsv: {
      type: 'string',
      description: 'Raw CSV response from Semrush API (semicolon-delimited)',
    },
  },
}
