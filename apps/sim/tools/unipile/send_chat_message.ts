import type { ToolConfig } from '@/tools/types'
import type {
  UnipileSendChatMessageParams,
  UnipileSendChatMessageToolResponse,
} from '@/tools/unipile/types'

export const unipileSendChatMessageTool: ToolConfig<
  UnipileSendChatMessageParams,
  UnipileSendChatMessageToolResponse
> = {
  id: 'unipile_send_chat_message',
  name: 'Unipile Send Chat Message',
  description:
    'Sends a message in a chat (`POST /api/v1/chats/{chat_id}/messages` as multipart form). Uses server `UNIPILE_API_KEY`.',
  version: '1.0.0',

  params: {
    chat_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Unipile chat id',
    },
    text: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Message body text',
    },
    account_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Unipile connected account id',
    },
    thread_id: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional thread id',
    },
    quote_id: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional quote id',
    },
    voice_message: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Voice message field (form string)',
    },
    video_message: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Video message field (form string)',
    },
    attachments: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Attachments field (form string)',
    },
    typing_duration: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Typing duration field (form string)',
    },
  },

  request: {
    url: '/api/tools/unipile/send-chat-message',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      chat_id: params.chat_id?.trim(),
      text: params.text,
      account_id: params.account_id?.trim(),
      thread_id: params.thread_id,
      quote_id: params.quote_id,
      voice_message: params.voice_message,
      video_message: params.video_message,
      attachments: params.attachments,
      typing_duration: params.typing_duration,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Unipile request failed')
    }

    return {
      success: true,
      output: {
        object: typeof data.object === 'string' ? data.object : null,
        message_id: typeof data.message_id === 'string' ? data.message_id : null,
      },
    }
  },

  outputs: {
    object: {
      type: 'string',
      description: 'Unipile object type (e.g. MessageSent)',
      optional: true,
    },
    message_id: { type: 'string', description: 'Sent message id', optional: true },
  },
}
