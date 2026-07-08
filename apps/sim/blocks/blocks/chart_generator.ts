import { ChartBarIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { IntegrationType } from '@/blocks/types'
import type { ChartGeneratorOutput } from '@/tools/chart/types'

const CHART_TYPE_OPTIONS = [
  { label: 'Auto', id: 'auto' },
  { label: 'Bar', id: 'bar' },
  { label: 'Line', id: 'line' },
  { label: 'Pie', id: 'pie' },
  { label: 'Scatter', id: 'scatter' },
  { label: 'Area', id: 'area' },
]

const OUTPUT_FORMAT_OPTIONS = [
  { label: 'Option + HTML', id: 'both' },
  { label: 'ECharts Option Only', id: 'option' },
  { label: 'HTML File Only', id: 'html' },
]

export const ChartGeneratorBlock: BlockConfig<ChartGeneratorOutput> = {
  type: 'chart_generator',
  name: 'Chart Generator',
  description: 'Generate charts from a prompt and JSON data',
  longDescription:
    'Create ECharts visualizations from natural-language prompts and flexible JSON data. The block normalizes common data shapes automatically, infers chart type and field mappings, and returns an ECharts option plus an interactive HTML file.',
  docsLink: 'https://docs.sim.ai/workflows/blocks/chart-generator',
  category: 'blocks',
  integrationType: IntegrationType.AI,
  bgColor: '#4D5FFF',
  icon: ChartBarIcon,
  subBlocks: [
    {
      id: 'prompt',
      title: 'Prompt',
      type: 'long-input',
      required: true,
      placeholder: 'Describe the chart you want, e.g. "Show monthly revenue trend by region"',
    },
    {
      id: 'data',
      title: 'Data',
      type: 'code',
      language: 'json',
      required: true,
      placeholder: 'Paste JSON or reference upstream data, e.g. <table.rows>',
    },
    {
      id: 'chartType',
      title: 'Chart Type',
      type: 'dropdown',
      options: CHART_TYPE_OPTIONS,
      value: () => 'auto',
    },
    {
      id: 'outputFormat',
      title: 'Output Format',
      type: 'dropdown',
      options: OUTPUT_FORMAT_OPTIONS,
      value: () => 'both',
    },
    {
      id: 'title',
      title: 'Title',
      type: 'short-input',
      placeholder: 'Optional chart title override',
      mode: 'advanced',
    },
    {
      id: 'dataPath',
      title: 'Data Path',
      type: 'short-input',
      placeholder: 'Optional nested path, e.g. results.items',
      mode: 'advanced',
    },
    {
      id: 'width',
      title: 'Width (px)',
      type: 'short-input',
      placeholder: '800',
      mode: 'advanced',
    },
    {
      id: 'height',
      title: 'Height (px)',
      type: 'short-input',
      placeholder: '500',
      mode: 'advanced',
    },
  ],
  tools: {
    access: ['chart_generator'],
    config: {
      tool: () => 'chart_generator',
      params: (params) => {
        if (!params.prompt?.trim()) {
          throw new Error('Prompt is required')
        }
        if (params.data === undefined || params.data === null || params.data === '') {
          throw new Error('Data is required')
        }

        const width = params.width ? Number(params.width) : undefined
        const height = params.height ? Number(params.height) : undefined

        return {
          prompt: params.prompt,
          data: params.data,
          ...(params.chartType && { chartType: params.chartType }),
          ...(params.outputFormat && { outputFormat: params.outputFormat }),
          ...(params.title && { title: params.title }),
          ...(params.dataPath && { dataPath: params.dataPath }),
          ...(width && Number.isFinite(width) ? { width } : {}),
          ...(height && Number.isFinite(height) ? { height } : {}),
        }
      },
    },
  },
  inputs: {
    prompt: { type: 'string', description: 'Natural-language chart description' },
    data: { type: 'json', description: 'Dataset to visualize' },
    chartType: { type: 'string', description: 'Chart type (auto, bar, line, pie, scatter, area)' },
    outputFormat: { type: 'string', description: 'Output format (option, html, both)' },
    title: { type: 'string', description: 'Optional chart title override' },
    dataPath: { type: 'string', description: 'Dot path to nested array data' },
    width: { type: 'number', description: 'Chart width in pixels' },
    height: { type: 'number', description: 'Chart height in pixels' },
  },
  outputs: {
    option: { type: 'json', description: 'ECharts option configuration' },
    chartType: { type: 'string', description: 'Resolved chart type' },
    title: { type: 'string', description: 'Chart title' },
    html: { type: 'file', description: 'Interactive chart HTML file' },
    metadata: { type: 'json', description: 'Field mappings and generation warnings' },
  },
}
