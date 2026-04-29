import type { ToolConfig } from '@/tools/types'
import type {
  UnipileListChatMessagesParams,
  UnipileListChatMessagesToolResponse,
} from '@/tools/unipile/types'

export const unipileListChatMessagesTool: ToolConfig<
  UnipileListChatMessagesParams,
  UnipileListChatMessagesToolResponse
> = {
  id: 'unipile_list_chat_messages',
  name: 'Unipile List Chat Messages',
  description:
    'Lists messages in a chat (`GET /api/v1/chats/{chat_id}/messages`). Uses server `UNIPILE_API_KEY`.',
  version: '1.0.0',

  params: {
    chat_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Unipile chat id',
    },
  },

  request: {
    url: '/api/tools/unipile/list-chat-messages',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      chat_id: params.chat_id?.trim(),
    }),
  },

  transformResponse: async (response: Response) => {
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Unipile request failed')
    }

    const rawItems = data.items
    const items = Array.isArray(rawItems) ? rawItems : []

    return {
      success: true,
      output: {
        object: typeof data.object === 'string' ? data.object : null,
        item_count: items.length,
        items,
      },
    }
  },

  outputs: {
    object: {
      type: 'string',
      description: 'Unipile object type (e.g. MessageList)',
      optional: true,
    },
    item_count: { type: 'number', description: 'Number of messages returned' },
    items: { type: 'json', description: 'Message objects from Unipile' },
  },
}
