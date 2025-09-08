import { AgentIcon } from '@/components/icons'
import { createLogger } from '@/lib/logs/console/logger'
import type { BlockConfig } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

const logger = createLogger('RespondToChat')

interface RespondToChatResponse extends ToolResponse {
  output: {
    content: string
  }
}

export const RespondToChatBlock: BlockConfig<RespondToChatResponse> = {
  type: 'respond_to_chat',
  name: 'Respond to Chat',
  description: 'Generate a response to a chat message',
  longDescription: 'Capture response from a user',
  docsLink: 'https://docs.sim.ai/blocks/agent',
  category: 'blocks',
  bgColor: '#F3F8FE',
  icon: AgentIcon,
  subBlocks: [
    {
      id: 'respond_to_chat',
      title: 'Respond to Chat',
      type: 'long-input',
      layout: 'full',
      placeholder: 'Enter message you want to ask user',
      rows: 3,
    },
  ],
  outputs: {
    content: { type: 'string', description: 'Generated response content' },
  },
  tools: {
    access: [],
    config: undefined,
  },
  inputs: {
    respond_to_chat: { type: 'string', description: 'User message or context' },
  },
}
