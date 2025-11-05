import { SemrushIcon } from '@/components/icons'
import { isHosted } from '@/lib/environment'
import type { BlockConfig } from '@/blocks/types'
import type { SemrushResponse } from '@/tools/semrush/types'

export const SemrushBlock: BlockConfig<SemrushResponse> = {
  type: 'semrush',
  name: 'Semrush',
  description: 'Get SEO data from Semrush',
  longDescription:
    'Access Semrush SEO data including organic keywords, backlinks, domain rank, and competitor analysis. Supports all Semrush API endpoints dynamically. Requires API Key.',
  docsLink: '',
  category: 'tools',
  bgColor: '#E0E0E0',
  icon: SemrushIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      layout: 'full',
      required: true,
      options: [
        { label: 'Get Organic Keywords for URL', id: 'url_organic' },
        { label: 'Get AdWords Keywords for URL', id: 'url_adwords' },
        { label: 'Get Domain Organic Keywords', id: 'domain_organic' },
        { label: 'Get Domain AdWords Keywords', id: 'domain_adwords' },
        { label: 'Get Organic Competitors', id: 'domain_organic_organic' },
        { label: 'Get AdWords Competitors', id: 'domain_adwords_adwords' },
        { label: 'Get Backlinks Overview', id: 'backlinks_overview' },
        { label: 'Get Referring Domains', id: 'backlinks_refdomains' },
        { label: 'Get Backlinks', id: 'backlinks_backlinks' },
        { label: 'Get Domain Rank', id: 'domain_rank' },
        { label: 'Custom Report (Advanced)', id: 'custom' },
      ],
      value: () => 'url_organic',
    },
    // Report Type - only shown for custom
    {
      id: 'reportType',
      title: 'Report Type',
      type: 'short-input',
      layout: 'full',
      placeholder: 'url_organic, domain_rank, backlinks_overview, etc.',
      required: true,
      condition: { field: 'operation', value: 'custom' },
    },
    // URL input - shown for URL-based reports
    {
      id: 'url',
      title: 'URL',
      type: 'short-input',
      layout: 'full',
      placeholder: 'https://example.com/page',
      required: true,
      condition: {
        field: 'operation',
        value: ['url_organic', 'url_adwords'],
      },
    },
    // Domain input - shown for domain-based reports
    {
      id: 'domain',
      title: 'Domain',
      type: 'short-input',
      layout: 'full',
      placeholder: 'example.com',
      required: true,
      condition: {
        field: 'operation',
        value: [
          'domain_organic',
          'domain_adwords',
          'domain_organic_organic',
          'domain_adwords_adwords',
          'backlinks_overview',
          'backlinks_refdomains',
          'backlinks_backlinks',
          'domain_rank',
        ],
      },
    },
    // Target input - shown for custom reports (can be URL or domain)
    {
      id: 'target',
      title: 'Target (URL or Domain)',
      type: 'short-input',
      layout: 'full',
      placeholder: 'example.com or https://example.com/page',
      required: true,
      condition: { field: 'operation', value: 'custom' },
    },
    // Database
    {
      id: 'database',
      title: 'Database',
      type: 'dropdown',
      layout: 'half',
      options: [
        { label: 'US', id: 'us' },
        { label: 'UK', id: 'uk' },
        { label: 'CA', id: 'ca' },
        { label: 'AU', id: 'au' },
        { label: 'DE', id: 'de' },
        { label: 'FR', id: 'fr' },
        { label: 'ES', id: 'es' },
        { label: 'IT', id: 'it' },
        { label: 'NL', id: 'nl' },
        { label: 'PL', id: 'pl' },
        { label: 'RU', id: 'ru' },
        { label: 'JP', id: 'jp' },
        { label: 'BR', id: 'br' },
        { label: 'IN', id: 'in' },
        { label: 'MX', id: 'mx' },
        { label: 'AR', id: 'ar' },
        { label: 'CH', id: 'ch' },
        { label: 'BE', id: 'be' },
        { label: 'DK', id: 'dk' },
        { label: 'FI', id: 'fi' },
        { label: 'NO', id: 'no' },
        { label: 'SE', id: 'se' },
        { label: 'TR', id: 'tr' },
        { label: 'ZA', id: 'za' },
        { label: 'SG', id: 'sg' },
        { label: 'HK', id: 'hk' },
        { label: 'NZ', id: 'nz' },
        { label: 'IE', id: 'ie' },
        { label: 'PT', id: 'pt' },
        { label: 'GR', id: 'gr' },
        { label: 'CZ', id: 'cz' },
        { label: 'HU', id: 'hu' },
        { label: 'RO', id: 'ro' },
        { label: 'MY', id: 'my' },
        { label: 'TH', id: 'th' },
        { label: 'PH', id: 'ph' },
        { label: 'ID', id: 'id' },
        { label: 'VN', id: 'vn' },
        { label: 'KR', id: 'kr' },
        { label: 'TW', id: 'tw' },
        { label: 'CN', id: 'cn' },
      ],
      value: () => 'us',
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
          'custom',
        ],
      },
    },
    // Display Limit
    {
      id: 'displayLimit',
      title: 'Display Limit',
      type: 'short-input',
      layout: 'half',
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
          'custom',
        ],
      },
    },
    // Export Columns
    {
      id: 'exportColumns',
      title: 'Export Columns',
      type: 'short-input',
      layout: 'half',
      placeholder: 'Ph,Nq,Cp',
      defaultValue: 'Ph,Nq,Cp',
      description: 'Comma-separated column codes (e.g., Ph=Phrase, Nq=Search Volume, Cp=CPC)',
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
          'custom',
        ],
      },
    },
    // Additional Parameters - only for custom
    {
      id: 'additionalParams',
      title: 'Additional Parameters',
      type: 'long-input',
      layout: 'full',
      placeholder: 'param1=value1&param2=value2',
      description: 'Additional Semrush API parameters as URL query string format',
      condition: { field: 'operation', value: 'custom' },
    },
    // API Key
    {
      id: 'apiKey',
      title: 'API Key',
      type: 'short-input',
      layout: 'full',
      placeholder: 'Enter your Semrush API key',
      password: true,
      required: false, // Optional - will use env variable if available, otherwise requires user input
      hidden: isHosted, // Hide API key field when hosted (uses SEMRUSH_API_KEY env variable)
      description: 'Enter your Semrush API key',
    },
  ],
  tools: {
    access: ['semrush_query'],
    config: {
      tool: () => 'semrush_query',
      params: (params: Record<string, any>) => {
        // Determine report type based on operation
        let reportType = params.operation || 'url_organic'
        if (reportType === 'custom') {
          reportType = params.reportType || ''
        }

        // Determine target based on operation
        let target = ''
        if (reportType === 'custom') {
          target = params.target || ''
        } else if (reportType.startsWith('url_')) {
          target = params.url || ''
        } else {
          target = params.domain || ''
        }

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
          additionalParams: params.additionalParams || undefined,
          apiKey: params.apiKey || undefined,
        }
        return toolParams
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Semrush operation selection' },
    reportType: { type: 'string', description: 'Semrush report type (for custom)' },
    url: { type: 'string', description: 'URL to analyze' },
    domain: { type: 'string', description: 'Domain to analyze' },
    target: { type: 'string', description: 'Target URL or domain (for custom)' },
    database: { type: 'string', description: 'Geographic database code' },
    displayLimit: { type: 'string', description: 'Number of results to return' },
    exportColumns: { type: 'string', description: 'Comma-separated column codes' },
    additionalParams: { type: 'string', description: 'Additional API parameters' },
    apiKey: { type: 'string', description: 'Semrush API key' },
  },
  outputs: {
    data: { type: 'json', description: 'Parsed Semrush data as array of objects' },
    columns: { type: 'json', description: 'Column headers from the response' },
    totalRows: { type: 'number', description: 'Total number of data rows returned' },
  },
}
