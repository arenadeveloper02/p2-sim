import { PresentationIcon } from '@/components/icons'
import type { BlockConfig, BlockMeta } from '@/blocks/types'
import { IntegrationType } from '@/blocks/types'

export const P2DocsBlock: BlockConfig = {
  type: 'p2_docs',
  name: 'P2 Docs',
  description: 'Position2 presentation template catalog, icons, and team members',
  longDescription:
    'Access Position2 (P2) presentation resources without Google Slides credentials: fetch the branded template schema, browse the icon library, and look up team member profile images for deck generation workflows.',
  docsLink: 'https://docs.sim.ai/integrations/p2_docs',
  category: 'tools',
  integrationType: IntegrationType.Documents,
  bgColor: '#802FDE',
  icon: PresentationIcon,

  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      options: [
        { label: 'Get Template Schema', id: 'get_template_schema' },
        { label: 'Get Presentation Icons', id: 'get_presentation_icons' },
        { label: 'Get P2 Team Members', id: 'get_p2_users' },
      ],
      value: () => 'get_template_schema',
    },
    {
      id: 'template',
      title: 'Template',
      type: 'dropdown',
      options: [{ label: 'Position2 2026', id: 'position2_2026' }],
      condition: { field: 'operation', value: 'get_template_schema' },
      required: true,
    },
    {
      id: 'iconCategory',
      title: 'Category',
      type: 'short-input',
      placeholder: 'Optional: e.g. marketing, technology, seo',
      condition: { field: 'operation', value: 'get_presentation_icons' },
      required: false,
      mode: 'advanced',
    },
    {
      id: 'iconColor',
      title: 'Icon Color',
      type: 'dropdown',
      options: [
        { label: 'All', id: '' },
        { label: 'Black', id: 'black' },
        { label: 'White', id: 'white' },
      ],
      condition: { field: 'operation', value: 'get_presentation_icons' },
      required: false,
    },
    {
      id: 'p2UsersFilter',
      title: 'Filter',
      type: 'short-input',
      placeholder: 'Optional: filter by name or designation (e.g. "VP", "Board")',
      condition: { field: 'operation', value: 'get_p2_users' },
      required: false,
    },
  ],

  tools: {
    access: [
      'p2_docs_get_template_schema',
      'p2_docs_get_presentation_icons',
      'p2_docs_get_p2_users',
    ],
    config: {
      tool: (params) => {
        switch (params.operation) {
          case 'get_template_schema':
            return 'p2_docs_get_template_schema'
          case 'get_presentation_icons':
            return 'p2_docs_get_presentation_icons'
          case 'get_p2_users':
            return 'p2_docs_get_p2_users'
          default:
            throw new Error(`Invalid P2 Docs operation: ${params.operation}`)
        }
      },
      params: (params) => {
        if (params.operation === 'get_template_schema') {
          const template = ((params.template as string) || '').trim()
          return { template: template || undefined }
        }

        if (params.operation === 'get_presentation_icons') {
          const result: Record<string, string> = {}
          const category = ((params.iconCategory as string) || '').trim()
          const color = ((params.iconColor as string) || '').trim()
          if (category) result.category = category
          if (color) result.color = color
          return result
        }

        if (params.operation === 'get_p2_users') {
          const filter = ((params.p2UsersFilter as string) || '').trim()
          return filter ? { filter } : {}
        }

        return {}
      },
    },
  },

  inputs: {
    operation: { type: 'string', description: 'P2 Docs operation to run' },
    template: { type: 'string', description: 'Template id (e.g. position2_2026)' },
    iconCategory: { type: 'string', description: 'Optional icon category filter' },
    iconColor: { type: 'string', description: 'Icon color variant: black or white' },
    p2UsersFilter: { type: 'string', description: 'Optional filter for team members' },
  },

  outputs: {
    schema: {
      type: 'json',
      description: 'Full presentation template schema (slides, blocks, shapeIds)',
    },
    icons: {
      type: 'json',
      description: 'Presentation icon catalog entries (id, label, category, tags, pngUrl)',
    },
    count: { type: 'number', description: 'Number of icons returned' },
    baseUrl: { type: 'string', description: 'Base URL for presentation icon assets' },
    version: { type: 'string', description: 'Icon library version' },
    users: {
      type: 'json',
      description: 'P2 team members (name, designation, profile image url)',
    },
    total: { type: 'number', description: 'Number of team members returned' },
  },
}

export const P2DocsBlockMeta = {
  tags: ['content-management', 'document-processing'],
  templates: [
    {
      icon: PresentationIcon,
      title: 'Position2 deck content pipeline',
      prompt:
        'Build a workflow that fetches the Position2 2026 template schema, loads the icon library and team members, uses an agent to fill the schema for a given brief, then passes the filled schema to Google Slides Create from Template.',
      modules: ['agent', 'workflows'],
      category: 'marketing',
      tags: ['presentations', 'content'],
      alsoIntegrations: ['google_slides_v2'],
    },
  ],
  skills: [
    {
      name: 'fill-position2-schema',
      description:
        'Fetch the P2 template schema and icon catalog, then produce a filled schema JSON ready for Google Slides.',
      content:
        '# Fill Position2 Template Schema\n\nUse P2 Docs blocks to gather template resources, then an agent to populate slide content.\n\n## Steps\n1. Run **Get Template Schema** with template `position2_2026`.\n2. Run **Get Presentation Icons** (filter by `iconLibraryColor` when blocks specify white or black icons).\n3. Run **Get P2 Team Members** when the deck includes speaker or team slides.\n4. Pass the schema, icons, and users to an agent with the user brief; output valid filled `schemaJson`.\n5. Hand off to Google Slides **Create from Template**.\n\n## Output\nA complete schema JSON with `id`, `templateVersion`, and `slides` with block `content` filled.',
    },
  ],
} as const satisfies BlockMeta
