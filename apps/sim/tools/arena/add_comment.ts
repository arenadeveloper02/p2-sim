import type { ArenaCommentsParams, ArenaCommentsResponse } from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

export const addComment: ToolConfig<ArenaCommentsParams, ArenaCommentsResponse> = {
  id: 'arena_comments',
  name: 'Arena Add Comment',
  description: 'Add a comment to a task in Arena.',
  version: '1.0.0',

  params: {
    operation: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Operation to perform (e.g., comments)',
    },
    'comment-client': {
      type: 'object',
      required: true,
      visibility: 'user-or-llm',
      description: 'Client associated with the comment',
    },
    'comment-project': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Project under which the task belongs',
    },
    'comment-group': {
      type: 'object',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional task group with id and name',
    },
    'comment-task': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Task to add comment to',
    },
    'comment-text': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Comment text to add',
    },
    'comment-client-note': {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Whether this is a client note',
    },
  },

  request: {
    url: (params: ArenaCommentsParams) => {
      const url = `/api/tools/arena/comments`
      return url
    },
    method: 'POST',
    headers: (params: ArenaCommentsParams) => {
      return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }
    },
    body: (params: ArenaCommentsParams) => {
      // ✅ Validation checks
      if (!params._context?.workflowId) throw new Error('Missing required field: workflowId')

      const clientValue = params['comment-client']
      const clientId = typeof clientValue === 'string' ? clientValue : clientValue?.clientId
      if (!clientId) throw new Error('Missing required field: Client')

      const projectValue = params['comment-project']
      const projectId =
        typeof projectValue === 'string' ? projectValue : projectValue?.sysId
      if (!projectId) throw new Error('Missing required field: Project')

      const projectName =
        typeof projectValue === 'string' ? '' : projectValue?.name || ''

      const taskValue = params['comment-task']
      const elementId =
        typeof taskValue === 'string'
          ? taskValue
          : taskValue?.sysId || taskValue?.id
      if (!elementId) throw new Error('Missing required field: Task')

      if (!params['comment-text']) throw new Error('Missing required field: Comment Text')

      // Handle client note toggle: if true, internal=false and showToClient=true
      // If false or undefined, internal=true and showToClient=false
      const clientNote = Boolean(params['comment-client-note'])

      const body: Record<string, any> = {
        workflowId: params._context.workflowId,
        elementId: elementId,
        value: params['comment-text'],
        projectName: projectName,
        internal: !clientNote,
        showToClient: clientNote,
        userMentionedIds: [],
        name: 'pm_project_task',
        chatFor: 'project',
        parentId: '',
      }

      // Only include element key when client note is OFF (normal comment)
      if (!clientNote) {
        body.element = 'WORK_NOTES'
      }

      return body
    },
  },

  transformResponse: async (
    response: Response,
    params?: ArenaCommentsParams
  ): Promise<ArenaCommentsResponse> => {
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

