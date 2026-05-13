import type {
  ArenaCommentsByTaskNumberParams,
  ArenaCommentsByTaskNumberResponse,
} from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

export const addCommentTaskNumber: ToolConfig<
  ArenaCommentsByTaskNumberParams,
  ArenaCommentsByTaskNumberResponse
> = {
  id: 'arena_comments_task_number',
  name: 'Arena Add Comment (by task number)',
  description:
    'Add a comment to an Arena task using its task number and the updated comment API. Task number is usually set on the block; you supply comment text and optional To/CC.',
  version: '1.0.0',

  params: {
    'comment-task-number': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Arena task number (set in the block or from a prior step).',
    },
    'comment-to': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'To line (optional). Use empty string if not needed.',
    },
    'comment-cc': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'CC (optional). Use empty string if not needed.',
    },
    'comment-text': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Comment body to post.',
    },
    'comment-client-note': {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Client-facing note (optional). Default false if unsure.',
    },
  },

  request: {
    url: () => `/api/tools/arena/comments-updated`,
    method: 'POST',
    headers: () => ({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
    body: (params: ArenaCommentsByTaskNumberParams) => {
      if (!params._context?.workflowId) throw new Error('Missing required field: workflowId')
      if (!params['comment-text']) throw new Error('Missing required field: Comment Text')

      const taskNumber = params['comment-task-number']?.trim()
      if (!taskNumber) throw new Error('Missing required field: Task Number')

      const clientNote = Boolean(params['comment-client-note'])

      return {
        workflowId: params._context.workflowId,
        taskNumber,
        comment: params['comment-text'] || '',
        userMentionedIds: [],
        showToClient: clientNote,
        to: params['comment-to']?.trim() ?? '',
        cc: params['comment-cc']?.trim() ?? '',
      }
    },
  },

  transformResponse: async (
    response: Response
  ): Promise<ArenaCommentsByTaskNumberResponse> => {
    const data = await response.json()
    return {
      success: true,
      output: {
        success: true,
        output: data,
      },
    }
  },

  outputs: {
    success: { type: 'boolean', description: 'Indicates if transform was successful' },
    output: { type: 'object', description: 'Output from Arena' },
  },
}
