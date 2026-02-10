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
      placeholder: '50',
      defaultValue: '50',
      condition: {
        field: 'operation',
        value: [
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
    access: ['semrush_query'],
    config: {
      tool: () => 'semrush_query',
      params: (params: Record<string, any>) => {
        const reportType = params.operation || 'url_organic'
        const target = reportType.startsWith('url_') ? params.url || '' : params.domain || ''

        // Set default export columns to Ph,Nq,Cp if not specified
        // Ph = Phrase (Keyword), Nq = Search Volume, Cp = CPC
        const exportColumns = params.exportColumns || 'Ph,Nq,Cp'

        // Set default display limit if not provided
        const displayLimit =
          params.displayLimit || (reportType === 'url_organic' ? '50' : undefined)

        const toolParams = {
          reportType,
          target,
          database: params.database || 'us', // Default to 'us' for all operations
          displayLimit,
          exportColumns: exportColumns || undefined,
          apiKey: params.apiKey || undefined,
        }
        return toolParams
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Semrush operation selection' },
    url: { type: 'string', description: 'URL to analyze' },
    domain: { type: 'string', description: 'Domain to analyze' },
    database: { type: 'string', description: 'Geographic database code' },
    displayLimit: { type: 'string', description: 'Number of results to return' },
    exportColumns: { type: 'string', description: 'Comma-separated column codes' },
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
