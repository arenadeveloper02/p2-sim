import type { ToolConfig } from '@/tools/types'
import { parseUnipilePagedBody } from '@/tools/unipile/parse_paged_body'
import type {
  UnipileListAllChatsParams,
  UnipileListAllChatsToolResponse,
} from '@/tools/unipile/types'

export const unipileListAllChatsTool: ToolConfig<
  UnipileListAllChatsParams,
  UnipileListAllChatsToolResponse
> = {
  id: 'unipile_list_all_chats',
  name: 'Unipile List all chats',
  description:
    'Lists chats (`GET /api/v1/chats`) with optional filters: unread, cursor, before/after ISO UTC datetimes, limit (1–250), account_type, account_id. Uses server UNIPILE_API_KEY.',
  version: '1.0.0',

  params: {
    account_id: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Optional filter: Unipile account id or comma-separated ids (omit to query without account filter).',
    },
    unread: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional: true = unread chats only, false = read chats only.',
    },
    cursor: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Pagination cursor from a previous ChatList response.',
    },
    before: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional ISO 8601 UTC end boundary (exclusive), e.g. 2025-12-31T23:59:59.999Z',
    },
    after: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Optional ISO 8601 UTC start boundary (exclusive), e.g. 2025-01-01T00:00:00.000Z',
    },
    limit: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional page size 1–250.',
    },
    account_type: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Optional provider filter: WHATSAPP, LINKEDIN, SLACK, TWITTER, MESSENGER, INSTAGRAM, TELEGRAM',
    },
  },

  request: {
    url: '/api/tools/unipile/list-all-chats',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => {
      const out: Record<string, unknown> = {}
      if (typeof params.account_id === 'string' && params.account_id.trim() !== '') {
        out.account_id = params.account_id.trim()
      }
      if (params.unread === true || params.unread === false) {
        out.unread = params.unread
      }
      if (typeof params.cursor === 'string' && params.cursor.trim() !== '') {
        out.cursor = params.cursor.trim()
      }
      if (typeof params.before === 'string' && params.before.trim() !== '') {
        out.before = params.before.trim()
      }
      if (typeof params.after === 'string' && params.after.trim() !== '') {
        out.after = params.after.trim()
      }
      if (
        params.limit !== undefined &&
        params.limit !== null &&
        Number.isFinite(Number(params.limit))
      ) {
        out.limit = Number(params.limit)
      }
      if (typeof params.account_type === 'string' && params.account_type.trim() !== '') {
        out.account_type = params.account_type.trim()
      }
      return out
    },
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
      description: 'Unipile object type (e.g. ChatList)',
      optional: true,
    },
    item_count: { type: 'number', description: 'Number of chats in this page' },
    items: { type: 'json', description: 'Chat items' },
    cursor: { type: 'string', description: 'Next page cursor', optional: true },
    paging: { type: 'json', description: 'Paging metadata when present', optional: true },
    total_items: {
      type: 'number',
      description: 'Total items when returned by API',
      optional: true,
    },
  },
}
