import type { ToolConfig } from '@/tools/types'
import type { UnipileGetChatParams, UnipileGetChatToolResponse } from '@/tools/unipile/types'

export const unipileGetChatTool: ToolConfig<UnipileGetChatParams, UnipileGetChatToolResponse> = {
  id: 'unipile_get_chat',
  name: 'Unipile Get Chat',
  description:
    'Retrieves a chat by id (`GET /api/v1/chats/{chat_id}`). Uses server `UNIPILE_API_KEY`.',
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
    url: '/api/tools/unipile/get-chat',
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

    const lastMessage = data.lastMessage
    const lastText =
      lastMessage &&
      typeof lastMessage === 'object' &&
      lastMessage !== null &&
      'text' in lastMessage
        ? typeof (lastMessage as { text?: unknown }).text === 'string'
          ? ((lastMessage as { text: string }).text ?? null)
          : null
        : null

    return {
      success: true,
      output: {
        object: typeof data.object === 'string' ? data.object : null,
        id: typeof data.id === 'string' ? data.id : null,
        account_id: typeof data.account_id === 'string' ? data.account_id : null,
        account_type: typeof data.account_type === 'string' ? data.account_type : null,
        provider_id: typeof data.provider_id === 'string' ? data.provider_id : null,
        name: typeof data.name === 'string' ? data.name : null,
        subject: typeof data.subject === 'string' ? data.subject : null,
        timestamp: typeof data.timestamp === 'string' ? data.timestamp : null,
        unread_count: typeof data.unread_count === 'number' ? data.unread_count : null,
        content_type: typeof data.content_type === 'string' ? data.content_type : null,
        last_message_text: lastText,
        chat: data,
      },
    }
  },

  outputs: {
    object: { type: 'string', description: 'Unipile object type (e.g. Chat)', optional: true },
    id: { type: 'string', description: 'Chat id', optional: true },
    account_id: { type: 'string', description: 'Account id', optional: true },
    account_type: { type: 'string', description: 'Account type (e.g. WHATSAPP)', optional: true },
    provider_id: { type: 'string', description: 'Provider id', optional: true },
    name: { type: 'string', description: 'Chat display name', optional: true },
    subject: { type: 'string', description: 'Chat subject', optional: true },
    timestamp: { type: 'string', description: 'Chat timestamp', optional: true },
    unread_count: { type: 'number', description: 'Unread message count', optional: true },
    content_type: { type: 'string', description: 'Content type', optional: true },
    last_message_text: {
      type: 'string',
      description: 'Text of the last message when present',
      optional: true,
    },
    chat: { type: 'json', description: 'Full Chat payload from Unipile' },
  },
}
