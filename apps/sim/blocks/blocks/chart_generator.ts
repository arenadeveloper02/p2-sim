import { ChartBarIcon } from '@/components/icons'
import { CHART_GENERATOR_DEFAULT_MODEL } from '@/lib/chart-generation/chart-generator-config'
import {
  buildChartGeneratorUserPrompt,
  DEFAULT_CHART_GENERATOR_SYSTEM_PROMPT,
} from '@/lib/chart-generation/chart-generator-prompts'
import type { BlockConfig, SuggestedSkill } from '@/blocks/types'
import {
  getModelOptions,
  getProviderCredentialSubBlocks,
  PROVIDER_CREDENTIAL_INPUTS,
} from '@/blocks/utils'

const ECHARTS_JSON_GENERATOR_SKILL: SuggestedSkill = {
  name: 'echarts-json-generator',
  description:
    'Produce valid Apache ECharts option JSON with correct series types, axes, and data mapping.',
  content: `# ECharts JSON Generator

When generating charts:
- Lock the chart type the user requested; do not substitute another type.
- Output the block's required envelope: \`{ "charts": [ ...options ], "count": N }\`.
- Each chart option must include a non-empty \`series\` array with valid \`type\` strings.
- Use only data from the provided dataset; never invent metrics.
- Valid JSON only — no markdown fences, no JavaScript functions.`,
}

export const ChartGeneratorBlock: BlockConfig = {
  type: 'chart_generator',
  name: 'Chart Generator',
  description: 'Generate ECharts visualizations from any data',
  longDescription:
    'Core workflow block. Uses an LLM plus optional skills to decide chart intent and produce valid ECharts JSON for the deployed chat renderer. No hardcoded chart rules — prompts and skills drive behavior. Works with any JSON/tabular data source.',
  docsLink: 'https://docs.sim.ai/workflows/blocks/chart-generator',
  category: 'blocks',
  bgColor: '#7C3AED',
  icon: ChartBarIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Mode',
      type: 'dropdown',
      options: [
        { label: 'Generate (LLM)', id: 'generate' },
        { label: 'Validate JSON only', id: 'validate' },
      ],
      value: () => 'generate',
    },
    {
      id: 'userRequest',
      title: 'Chart request',
      type: 'long-input',
      placeholder: 'e.g. <start.input> or describe the visualization',
      condition: { field: 'operation', value: 'generate' },
    },
    {
      id: 'data',
      title: 'Data',
      type: 'long-input',
      placeholder: 'JSON or table from any upstream block (e.g. <googleadsv11.results>)',
      condition: { field: 'operation', value: 'generate' },
    },
    {
      id: 'rawContent',
      title: 'Chart JSON / agent output',
      type: 'long-input',
      placeholder: 'Paste LLM or agent output to validate (e.g. <agent1.content>)',
      condition: { field: 'operation', value: 'validate' },
    },
    {
      id: 'model',
      title: 'Model',
      type: 'combobox',
      placeholder: 'Type or select a model...',
      required: true,
      defaultValue: CHART_GENERATOR_DEFAULT_MODEL,
      options: getModelOptions,
      condition: { field: 'operation', value: 'generate' },
    },
    ...getProviderCredentialSubBlocks().map((subBlock) => ({
      ...subBlock,
      // Keep model-specific credential visibility (OpenAI vs Vertex vs Bedrock) — do not
      // replace with operation-only or deploy will require every provider field.
      condition: (values?: Record<string, unknown>) => {
        if (values?.operation !== 'generate') {
          return { field: 'operation', value: '__never_show__' }
        }
        if (!subBlock.condition) {
          return { field: 'operation', value: 'generate' }
        }
        const inner =
          typeof subBlock.condition === 'function'
            ? subBlock.condition(values)
            : subBlock.condition
        return { field: 'operation', value: 'generate', and: inner }
      },
      dependsOn: [...(subBlock.dependsOn ?? []), 'operation', 'model'],
    })),
    {
      id: 'skills',
      title: 'Skills',
      type: 'skill-input',
      defaultValue: [],
      condition: { field: 'operation', value: 'generate' },
    },
    {
      id: 'systemPrompt',
      title: 'System prompt',
      type: 'code',
      language: 'markdown',
      placeholder: 'Override default chart generation instructions',
      mode: 'advanced',
      condition: { field: 'operation', value: 'generate' },
      value: () => DEFAULT_CHART_GENERATOR_SYSTEM_PROMPT,
    },
    {
      id: 'userPrompt',
      title: 'User prompt template',
      type: 'code',
      language: 'markdown',
      mode: 'advanced',
      condition: { field: 'operation', value: 'generate' },
      value: (params: Record<string, unknown>) =>
        buildChartGeneratorUserPrompt(
          String(params.userRequest ?? '<userRequest>'),
          String(params.data ?? '<data>')
        ),
    },
    {
      id: 'temperature',
      title: 'Temperature',
      type: 'slider',
      min: 0,
      max: 1,
      defaultValue: 0.2,
      mode: 'advanced',
      condition: { field: 'operation', value: 'generate' },
    },
  ],
  tools: {
    access: ['chart_validate'],
  },
  inputs: {
    operation: { type: 'string', description: 'generate or validate' },
    userRequest: { type: 'string', description: 'Natural language chart request' },
    data: { type: 'json', description: 'Source data from any block' },
    rawContent: { type: 'json', description: 'Raw JSON/text to validate' },
    skills: { type: 'json', description: 'Selected chart skills' },
    systemPrompt: { type: 'string', description: 'Chart system prompt override' },
    userPrompt: { type: 'string', description: 'Chart user prompt override' },
    ...PROVIDER_CREDENTIAL_INPUTS,
    temperature: { type: 'number', description: 'LLM temperature' },
  },
  outputs: {
    charts: {
      type: 'json',
      description: 'ECharts option objects (array)',
    },
    dashboard: {
      type: 'json',
      description: 'Deploy to chat: { charts, count } for the renderer',
    },
    count: { type: 'number', description: 'Number of charts' },
    valid: { type: 'boolean', description: 'True when at least one chart was produced' },
    skipped: {
      type: 'boolean',
      description: 'True when no chart was requested or output was plain text',
    },
    content: { type: 'string', description: 'Raw LLM response (generate mode)' },
    model: { type: 'string', description: 'Model used' },
    tokens: { type: 'json', description: 'Token usage' },
    cost: { type: 'json', description: 'Cost breakdown' },
  },
}

export const ChartGeneratorBlockMeta = {
  tags: ['data-analytics', 'llm'] as const,
  skills: [ECHARTS_JSON_GENERATOR_SKILL],
} as const satisfies {
  tags: readonly import('@/blocks/types').IntegrationTag[]
  skills: readonly SuggestedSkill[]
}
