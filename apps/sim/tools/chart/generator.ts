import { getErrorMessage } from '@sim/utils/errors'
import { runChartGenerator } from '@/lib/chart-generation/run-chart-generator'
import type { ChartGeneratorOutput, ChartGeneratorParams } from '@/tools/chart/types'
import type { ToolConfig, ToolResponse } from '@/tools/types'

export const chartGeneratorTool: ToolConfig<ChartGeneratorParams, ToolResponse> = {
  id: 'chart_generator',
  name: 'Chart Generator',
  description:
    'Generate ECharts visualizations from a natural-language prompt and flexible JSON data.',
  version: '1.0.0',

  params: {
    prompt: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Natural-language description of the chart to generate',
    },
    data: {
      type: 'json',
      required: true,
      visibility: 'user-or-llm',
      description: 'Dataset to visualize. Accepts arrays, objects, and common nested JSON shapes.',
    },
    chartType: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Chart type: auto, bar, line, pie, scatter, or area',
    },
    outputFormat: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Output format: option, html, or both',
    },
    title: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional chart title override',
    },
    dataPath: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Dot path to a nested array inside the data payload',
    },
    width: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Chart width in pixels for HTML output',
    },
    height: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Chart height in pixels for HTML output',
    },
  },

  request: {
    url: '/api/tools/chart-generator',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params) => params,
  },

  directExecution: async (params: ChartGeneratorParams) => {
    try {
      const output: ChartGeneratorOutput = runChartGenerator(params)
      return {
        success: true,
        output,
      }
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error, 'Chart generation failed'),
        output: {
          option: {},
          chartType: 'bar',
          title: '',
          html: '',
          metadata: {
            rowCount: 0,
            fields: [],
            xField: '',
            yFields: [],
            warnings: [],
          },
        },
      }
    }
  },

  outputs: {
    option: { type: 'json', description: 'ECharts option configuration' },
    chartType: { type: 'string', description: 'Resolved chart type' },
    title: { type: 'string', description: 'Chart title' },
    html: {
      type: 'file',
      description: 'Self-contained interactive chart HTML file',
      fileConfig: { mimeType: 'text/html', extension: 'html' },
    },
    metadata: {
      type: 'json',
      description: 'Generation metadata including field mappings and warnings',
      properties: {
        rowCount: { type: 'number', description: 'Number of input rows' },
        fields: {
          type: 'array',
          description: 'Detected field names',
          items: { type: 'string', description: 'Field name' },
        },
        xField: { type: 'string', description: 'Field used for the x-axis or categories' },
        yFields: {
          type: 'array',
          description: 'Numeric fields plotted on the y-axis',
          items: { type: 'string', description: 'Field name' },
        },
        warnings: {
          type: 'array',
          description: 'Non-fatal generation warnings',
          items: { type: 'string', description: 'Warning message' },
        },
      },
    },
  },
}
