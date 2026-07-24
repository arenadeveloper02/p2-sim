import { GenerativeUiIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { IntegrationType } from '@/blocks/types'
import type { GenerativeUiGenerateHtmlResponse } from '@/tools/generative_ui/types'

export const GenerativeUiBlock: BlockConfig<GenerativeUiGenerateHtmlResponse> = {
  type: 'generative_ui',
  name: 'Generative UI',
  description: 'Generate structured HTML from a prompt (email or webpage)',
  longDescription:
    'Uses json-render catalogs to constrain AI output to known components, then renders email-safe or webpage HTML. Outputs html plus the underlying JSON spec and selected mode.',
  bestPractices: `
  - Describe the layout, sections, copy, and style in User Input.
  - Choose Email for transactional/marketing email HTML; Webpage for a full HTML page snapshot.
  - Downstream blocks can use the html output directly (send email, save file, etc.).
  - Requires ANTHROPIC_API_KEY (or rotated Anthropic keys) in the environment.
  `,
  category: 'blocks',
  integrationType: IntegrationType.AI,
  bgColor: '#0F172A',
  icon: GenerativeUiIcon,
  subBlocks: [
    {
      id: 'mode',
      title: 'Mode',
      type: 'dropdown',
      options: [
        { label: 'Email', id: 'email' },
        { label: 'Webpage', id: 'webpage' },
      ],
      value: () => 'email',
    },
    {
      id: 'userInput',
      title: 'User Input',
      type: 'long-input',
      placeholder:
        'Describe the UI or email: purpose, sections, copy, colors, CTAs, and layout preferences...',
      required: true,
    },
  ],
  tools: {
    access: ['generative_ui_generate_html'],
    config: {
      tool: () => 'generative_ui_generate_html',
      params: (params) => ({
        userInput: params.userInput,
        mode: params.mode === 'webpage' ? 'webpage' : 'email',
      }),
    },
  },
  inputs: {
    mode: { type: 'string', description: 'email or webpage' },
    userInput: { type: 'string', description: 'Natural language description of the UI to generate' },
  },
  outputs: {
    html: { type: 'string', description: 'Generated HTML' },
    spec: { type: 'json', description: 'json-render Spec used to produce the HTML' },
    mode: { type: 'string', description: 'Mode used: email or webpage' },
  },
}
