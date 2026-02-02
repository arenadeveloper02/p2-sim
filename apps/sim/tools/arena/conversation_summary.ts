import type {
  ArenaConversationSummaryParams,
  ArenaConversationSummaryResponse,
} from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

export const conversationSummary: ToolConfig<
  ArenaConversationSummaryParams,
  ArenaConversationSummaryResponse
> = {
  id: 'arena_conversation_summary',
  name: 'Arena Conversation Summary',
  description: 'Get the conversation summary for an Arena task.',
  version: '1.0.0',

  params: {
    operation: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Operation to perform (e.g., conversation_summary)',
    },
    'conversation-summary-task-id': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Task ID used to fetch conversation summary',
    },
  },

  request: {
    url: (params: ArenaConversationSummaryParams) => {
      if (!params._context?.workflowId) throw new Error('Missing required field: workflowId')
      const taskId = params['conversation-summary-task-id']?.trim()
      if (!taskId) throw new Error('Missing required field: Task ID')

      let url = `/api/tools/arena/conversation-summary`
      url += `?workflowId=${encodeURIComponent(params._context.workflowId)}`
      url += `&taskId=${encodeURIComponent(taskId)}`

      return url
    },
    method: 'GET',
    headers: () => {
      return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }
    },
  },

  transformResponse: async (
    response: Response
  ): Promise<ArenaConversationSummaryResponse> => {
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
