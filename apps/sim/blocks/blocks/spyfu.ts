import { SpyfuIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { spyfuOperationOptions } from '@/tools/spyfu/operations'
import type { SpyfuResponse } from '@/tools/spyfu/types'

export const SpyfuBlock: BlockConfig<SpyfuResponse> = {
  type: 'spyfu',
  name: 'SpyFu',
  description: 'Query SpyFu for SEO, PPC, competitor, keyword, ranking, and usage data.',
  longDescription:
    'Connect directly to SpyFu’s Domain Stats, Ad History, PPC Research, SEO Research, Competitors, Kombat, Keyword, Ranking History, and Account APIs. Configure a predefined endpoint or supply a custom path, add the required query parameters from the SpyFu docs, and optionally include request bodies for bulk keyword jobs.',
  docsLink: 'https://developer.spyfu.com/reference',
  category: 'tools',
  bgColor: '#14213D',
  icon: SpyfuIcon,
  subBlocks: [
    {
      id: 'mode',
      title: 'Endpoint Mode',
      type: 'dropdown',
      layout: 'half',
      required: true,
      options: [
        { label: 'Predefined SpyFu endpoint', id: 'predefined' },
        { label: 'Custom path / method', id: 'custom' },
      ],
      value: () => 'predefined',
    },
    {
      id: 'operationId',
      title: 'SpyFu Endpoint',
      type: 'dropdown',
      layout: 'full',
      required: true,
      options: spyfuOperationOptions,
      description:
        'Pick any supported SpyFu endpoint. Required query parameters (domain, keyword, date range, filters, etc.) must be added in the Query Parameters table below.',
      condition: {
        field: 'mode',
        value: 'predefined',
      },
    },
    {
      id: 'customPath',
      title: 'Custom Endpoint Path',
      type: 'short-input',
      layout: 'full',
      placeholder: '/apis/domain_stats_api/v2/getAllDomainStats',
      description: 'Accepts relative SpyFu paths or absolute URLs.',
      condition: {
        field: 'mode',
        value: 'custom',
      },
    },
    {
      id: 'customMethod',
      title: 'Custom Method',
      type: 'dropdown',
      layout: 'half',
      options: [
        { label: 'GET', id: 'GET' },
        { label: 'POST', id: 'POST' },
        { label: 'PUT', id: 'PUT' },
        { label: 'PATCH', id: 'PATCH' },
        { label: 'DELETE', id: 'DELETE' },
      ],
      value: () => 'GET',
      condition: {
        field: 'mode',
        value: 'custom',
      },
    },
    {
      id: 'countryCode',
      title: 'Country Code',
      type: 'short-input',
      layout: 'half',
      placeholder: 'US',
      defaultValue: 'US',
      description:
        'SpyFu uses ISO-like country codes (US, UK, DE, etc.). Leave blank only for endpoints that ignore geography.',
    },
    {
      id: 'queryParams',
      title: 'Query Parameters',
      type: 'table',
      layout: 'full',
      columns: ['Key', 'Value'],
      description:
        'Add the required parameters (domain, keyword, pattern, date range, limit, filters, etc.) as documented by SpyFu. Values are appended to the query string.',
    },
    {
      id: 'body',
      title: 'Request Body (JSON)',
      type: 'code',
      layout: 'full',
      placeholder: '{\n  "keywords": ["example.com"]\n}',
      description:
        'Optional JSON payload used by POST endpoints (for example, bulk keyword submissions). Leave blank for GET calls.',
      wandConfig: {
        enabled: true,
        prompt: `You are configuring a SpyFu API payload.
Output ONLY a valid JSON object that matches the users description.
Reference the user's notes plus any block parameters (domain, keyword, etc.) if helpful.
Do not include markdown fences or commentary.`,
        generationType: 'json-object',
        placeholder: 'Describe the JSON payload you need...',
      },
    },
    {
      id: 'apiUsername',
      title: 'API Username',
      type: 'short-input',
      layout: 'half',
      hidden: true,
      description: 'Overrides the SPYFU_API_USERNAME environment variable when provided.',
    },
    {
      id: 'apiPassword',
      title: 'API Password',
      type: 'short-input',
      layout: 'half',
      password: true,
      hidden: true,
      description: 'Overrides the SPYFU_API_PASSWORD environment variable when provided.',
    },
  ],
  tools: {
    access: ['spyfu_request'],
    config: {
      tool: () => 'spyfu_request',
      params: (params) => ({
        mode: params.mode || 'predefined',
        operationId: params.operationId,
        customPath: params.customPath,
        customMethod: params.customMethod,
        countryCode: params.countryCode,
        queryParamsTable: params.queryParams,
        body: params.body,
        apiUsername: params.apiUsername,
        apiPassword: params.apiPassword,
      }),
    },
  },
  inputs: {
    mode: { type: 'string', description: 'Whether to use a predefined SpyFu endpoint or a custom path.' },
    operationId: { type: 'string', description: 'The selected SpyFu endpoint identifier.' },
    customPath: { type: 'string', description: 'Custom SpyFu endpoint path or absolute URL.' },
    customMethod: { type: 'string', description: 'HTTP method to use for custom endpoints.' },
    countryCode: { type: 'string', description: 'SpyFu country code appended to the query string.' },
    queryParams: { type: 'json', description: 'Key-value pairs converted to query parameters.' },
    body: { type: 'json', description: 'Optional JSON request body for POST endpoints.' },
    apiUsername: { type: 'string', description: 'SpyFu API username override.' },
    apiPassword: { type: 'string', description: 'SpyFu API password override.' },
  },
  outputs: {
    data: { type: 'json', description: 'Raw payload returned by SpyFu.' },
    status: { type: 'number', description: 'HTTP status code from SpyFu.' },
    headers: { type: 'json', description: 'SpyFu response headers.' },
    endpoint: { type: 'string', description: 'Endpoint URL that was executed.' },
    method: { type: 'string', description: 'HTTP method used in the request.' },
  },
}

