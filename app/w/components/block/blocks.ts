import { AgentIcon, ApiIcon, ConditionalIcon } from '@/components/icons'

export interface BlockConfig {
  type: string
  title: string
  description: string
  bgColor: string
  icon: any
  category: 'basic' | 'advanced'
}

export const BLOCKS: BlockConfig[] = [
  {
    type: 'agent',
    title: 'Agent',
    description: 'Use any LLM',
    bgColor: '#7F2FFF',
    icon: AgentIcon,
    category: 'basic',
  },
  {
    type: 'api',
    title: 'API',
    description: 'Connect to any API',
    bgColor: '#2F55FF',
    icon: ApiIcon,
    category: 'basic',
  },
  {
    type: 'conditional',
    title: 'Conditional',
    description: 'Create branching logic',
    bgColor: '#FF972F',
    icon: ConditionalIcon,
    category: 'basic',
  },
]