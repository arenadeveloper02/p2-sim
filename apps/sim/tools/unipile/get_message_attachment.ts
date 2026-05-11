import type { ToolConfig } from '@/tools/types'
import type {
  UnipileGetMessageAttachmentParams,
  UnipileGetMessageAttachmentToolResponse,
} from '@/tools/unipile/types'

export const unipileGetMessageAttachmentTool: ToolConfig<
  UnipileGetMessageAttachmentParams,
  UnipileGetMessageAttachmentToolResponse
> = {
  id: 'unipile_get_message_attachment',
  name: 'Unipile Get Message Attachment',
  description:
    'Downloads an attachment from a message (`GET /api/v1/messages/{message_id}/attachments/{attachment_id}`). Text-like bodies return `content`; binary returns `content_base64` plus `mime_type`.',
  version: '1.0.0',

  params: {
    message_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Unipile message id',
    },
    attachment_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Attachment id',
    },
  },

  request: {
    url: '/api/tools/unipile/get-message-attachment',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      message_id: params.message_id?.trim(),
      attachment_id: params.attachment_id?.trim(),
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
        content: typeof data.content === 'string' ? data.content : null,
        content_base64: typeof data.content_base64 === 'string' ? data.content_base64 : null,
        mime_type: typeof data.mime_type === 'string' ? data.mime_type : null,
      },
    }
  },

  outputs: {
    content: { type: 'string', description: 'UTF-8 body when text-like', optional: true },
    content_base64: {
      type: 'string',
      description: 'Base64 body for binary attachments',
      optional: true,
    },
    mime_type: { type: 'string', description: 'Response content type when known', optional: true },
  },
}
