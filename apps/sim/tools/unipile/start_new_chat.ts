import type { ToolConfig } from '@/tools/types'
import type {
  UnipileStartNewChatParams,
  UnipileStartNewChatToolResponse,
} from '@/tools/unipile/types'

export const unipileStartNewChatTool: ToolConfig<
  UnipileStartNewChatParams,
  UnipileStartNewChatToolResponse
> = {
  id: 'unipile_start_new_chat',
  name: 'Unipile Start New Chat',
  description:
    'Starts a new chat via Unipile (`POST /api/v1/chats` as multipart form). Uses `UNIPILE_API_KEY` from the server environment.',
  version: '1.0.0',

  params: {
    account_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Unipile connected account id',
    },
    text: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Initial message text',
    },
    attachments: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Attachments field (Unipile form string)',
    },
    voice_message: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Voice message field (Unipile form string)',
    },
    video_message: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Video message field (Unipile form string)',
    },
    attendees_ids: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Attendee ids (Unipile form string)',
    },
    subject: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Chat subject',
    },
    api: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: "Unipile `api` form field (default: 'classic')",
    },
    topic: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: "Unipile `topic` form field (default: 'service_request')",
    },
    applicant_id: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Applicant id (Unipile form string)',
    },
    invitation_id: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Invitation id (Unipile form string)',
    },
    inmail: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: "Set to 'true' or 'false' to send the `inmail` form field",
    },
  },

  request: {
    url: '/api/tools/unipile/start-chat',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      account_id: params.account_id?.trim(),
      text: params.text,
      attachments: params.attachments,
      voice_message: params.voice_message,
      video_message: params.video_message,
      attendees_ids: params.attendees_ids,
      subject: params.subject,
      api: params.api,
      topic: params.topic,
      applicant_id: params.applicant_id,
      invitation_id: params.invitation_id,
      inmail: params.inmail,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const err = typeof data.error === 'string' ? data.error : 'Unipile request failed'
      throw new Error(err)
    }

    return {
      success: true,
      output: {
        object: typeof data.object === 'string' ? data.object : null,
        chat_id: typeof data.chat_id === 'string' ? data.chat_id : null,
        message_id: typeof data.message_id === 'string' ? data.message_id : null,
      },
    }
  },

  outputs: {
    object: {
      type: 'string',
      description: 'Unipile object type (e.g. ChatStarted)',
      optional: true,
    },
    chat_id: { type: 'string', description: 'Created chat id', optional: true },
    message_id: { type: 'string', description: 'Created message id', optional: true },
  },
}
