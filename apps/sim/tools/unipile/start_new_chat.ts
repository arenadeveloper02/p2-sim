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
    'Starts a new chat via Unipile (`POST /api/v1/chats` as multipart form). Requires `attendees_ids` (array of attendee provider ids). Uses `UNIPILE_API_KEY` from the server environment.',
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
    attendees_ids: {
      type: 'json',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Attendee provider ids for Unipile `attendees_ids` (array preferred; comma-separated legacy string also accepted)',
    },
    attachments: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Attachments as UserFile array (preferred) or legacy string',
    },
    voice_message: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Voice message as UserFile (preferred) or legacy string',
    },
    video_message: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Video message as UserFile (preferred) or legacy string',
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
    signature: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Recruiter API: signature',
    },
    hiring_project_id: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Recruiter API: hiring_project_id',
    },
    job_posting_id: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Recruiter API: job_posting_id',
    },
    sourcing_channel: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Recruiter API: sourcing_channel',
    },
    email_address: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Recruiter API: email_address',
    },
    visibility: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Recruiter API: PUBLIC | PRIVATE | PROJECT',
    },
    follow_up: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Recruiter API: JSON string for follow_up object',
    },
  },

  request: {
    url: '/api/tools/unipile/start-chat',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      account_id: params.account_id?.trim(),
      text: params.text,
      attendees_ids: params.attendees_ids,
      attachments: params.attachments,
      voice_message: params.voice_message,
      video_message: params.video_message,
      subject: params.subject,
      api: params.api,
      topic: params.topic,
      applicant_id: params.applicant_id,
      invitation_id: params.invitation_id,
      inmail: params.inmail,
      signature: params.signature,
      hiring_project_id: params.hiring_project_id,
      job_posting_id: params.job_posting_id,
      sourcing_channel: params.sourcing_channel,
      email_address: params.email_address,
      visibility: params.visibility,
      follow_up: params.follow_up,
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
