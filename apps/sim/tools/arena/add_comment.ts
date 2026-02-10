import type { ArenaCommentsParams, ArenaCommentsResponse } from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'
import { extractMentionedUserIds } from './utils'

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
      required: false,
      visibility: 'user-or-llm',
      description: 'Client associated with the comment (basic mode)',
    },
    'comment-project': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Project under which the task belongs (basic mode)',
    },
    'comment-group': {
      type: 'object',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional task group with id and name (basic mode)',
    },
    'comment-task': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Task to add comment to (basic mode)',
    },
    'comment-task-number': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Task number (advanced mode) - accepts dynamic values like <function.result.task_number>',
    },
    'comment-to': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'To (advanced mode) - e.g. variable for emails like <function.result.to_emails>',
    },
    'comment-cc': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'CC (advanced mode) - e.g. variable for emails like <function.result.cc_emails>',
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
      // Use advanced mode endpoint if task number is provided
      const isAdvancedMode = !!params['comment-task-number']
      const url = isAdvancedMode ? `/api/tools/arena/comments-updated` : `/api/tools/arena/comments`
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

      if (!params['comment-text']) throw new Error('Missing required field: Comment Text')

      // Handle client note toggle: if true, internal=false and showToClient=true
      // If false or undefined, internal=true and showToClient=false
      const clientNote = Boolean(params['comment-client-note'])

      const commentText = params['comment-text'] || ''

      // Check if we're in advanced mode (task number provided)
      const isAdvancedMode = !!params['comment-task-number']

      // Extract user mentioned IDs from HTML content (only for basic mode)
      let userMentionedIds: string[] = []
      if (!isAdvancedMode) {
        userMentionedIds = extractMentionedUserIds(commentText)

        // Debug logging to help identify issues
        if (commentText?.includes('@') && userMentionedIds.length === 0) {
          const hasMentionTag =
            commentText.includes('class="mention"') || commentText.includes("class='mention'")
          const hasDataUserId = commentText.includes('data-user-id')

          if (hasMentionTag || hasDataUserId) {
            console.warn('[Arena Comments] Mention tags found but no user IDs extracted:', {
              commentTextLength: commentText.length,
              commentTextPreview: commentText.substring(0, 300),
              hasMentionClass: hasMentionTag,
              hasDataUserId: hasDataUserId,
              extractedIds: userMentionedIds,
            })
          }
        }
      }

      if (isAdvancedMode) {
        // Advanced mode: use task number (no @ mentions extraction)
        const taskNumber = params['comment-task-number']?.trim()
        if (!taskNumber) throw new Error('Missing required field: Task Number')

        const body: Record<string, any> = {
          workflowId: params._context.workflowId,
          taskNumber: taskNumber,
          comment: commentText,
          userMentionedIds: [],
          showToClient: clientNote,
          to: params['comment-to']?.trim() ?? '',
          cc: params['comment-cc']?.trim() ?? '',
        }

        return body
      }

      // Basic mode: use existing logic with client, project, group, task
      const clientValue = params['comment-client']
      const clientId = typeof clientValue === 'string' ? clientValue : clientValue?.clientId
      if (!clientId) throw new Error('Missing required field: Client')

      const projectValue = params['comment-project']
      const projectId = typeof projectValue === 'string' ? projectValue : projectValue?.sysId
      if (!projectId) throw new Error('Missing required field: Project')

      const projectName = typeof projectValue === 'string' ? '' : projectValue?.name || ''

      const taskValue = params['comment-task']
      const elementId =
        typeof taskValue === 'string' ? taskValue : taskValue?.sysId || taskValue?.id
      if (!elementId) throw new Error('Missing required field: Task')

      const body: Record<string, any> = {
        workflowId: params._context.workflowId,
        elementId: elementId,
        value: commentText,
        projectName: projectName,
        internal: !clientNote,
        showToClient: clientNote,
        userMentionedIds: userMentionedIds,
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
