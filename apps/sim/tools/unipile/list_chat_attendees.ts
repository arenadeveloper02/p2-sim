import type { ToolConfig } from '@/tools/types'
import { parseUnipilePagedBody } from '@/tools/unipile/parse_paged_body'
import type {
  UnipileListChatAttendeesParams,
  UnipileListChatAttendeesToolResponse,
} from '@/tools/unipile/types'

export const unipileListChatAttendeesTool: ToolConfig<
  UnipileListChatAttendeesParams,
  UnipileListChatAttendeesToolResponse
> = {
  id: 'unipile_list_chat_attendees',
  name: 'Unipile List Chat Attendees',
  description:
    'Lists attendees for a chat (`GET /api/v1/chats/{chat_id}/attendees`). Uses server `UNIPILE_API_KEY`.',
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
    url: '/api/tools/unipile/list-chat-attendees',
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

    return {
      success: true,
      output: parseUnipilePagedBody(data),
    }
  },

  outputs: {
    object: {
      type: 'string',
      description: 'Unipile object type (e.g. ChatAttendeeList)',
      optional: true,
    },
    item_count: { type: 'number', description: 'Number of attendees' },
    items: { type: 'json', description: 'ChatAttendee items' },
    cursor: { type: 'string', description: 'Pagination cursor when present', optional: true },
    paging: { type: 'json', description: 'Paging metadata when present', optional: true },
    total_items: {
      type: 'number',
      description: 'Total items when returned by API',
      optional: true,
    },
  },
}
