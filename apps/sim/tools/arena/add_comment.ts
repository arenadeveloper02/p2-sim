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
    body: async (params: ArenaCommentsParams) => {
      // Dynamic import to avoid client-side bundling issues
      const { resolveClientId, resolveProjectId, resolveTaskId } = await import(
        './utils/resolve-ids'
      )

      // ✅ Validation checks
      if (!params._context?.workflowId) throw new Error('Missing required field: workflowId')
      const workflowId = params._context.workflowId

      // Resolve client ID (supports name/id from advanced mode or variables)
      const clientId = await resolveClientId(params['comment-client'] as any, workflowId)
      if (!clientId) throw new Error('Missing required field: Client')

      // Resolve project ID (supports name/id from advanced mode or variables)
      const projectId = await resolveProjectId(
        params['comment-project'] as any,
        clientId,
        workflowId
      )
      if (!projectId) throw new Error('Missing required field: Project')
      const projectName =
        typeof params['comment-project'] === 'object'
          ? (params['comment-project'] as any)?.name || ''
          : ''

      // Resolve task ID (supports name/id from advanced mode or variables)
      const elementId = await resolveTaskId(
        params['comment-task'] as any,
        clientId,
        projectId,
        workflowId
      )
      if (!elementId) throw new Error('Missing required field: Task')

      if (!params['comment-text']) throw new Error('Missing required field: Comment Text')

      // Handle client note toggle: if true, internal=false and showToClient=true
      // If false or undefined, internal=true and showToClient=false
      const clientNote = Boolean(params['comment-client-note'])

      // Extract user mentioned IDs from HTML content
      const commentText = params['comment-text'] || ''
      const userMentionedIds = extractMentionedUserIds(commentText)

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

    // Extract IDs from params for variable referencing
    const clientValue = params?.['comment-client']
    const clientId = typeof clientValue === 'string' ? clientValue : clientValue?.clientId

    const projectValue = params?.['comment-project']
    const projectId = typeof projectValue === 'string' ? projectValue : projectValue?.sysId

    const groupValue = params?.['comment-group']
    const groupId = groupValue?.id

    const taskValue = params?.['comment-task']
    const taskId = typeof taskValue === 'string' ? taskValue : taskValue?.sysId || taskValue?.id

    return {
      success: true,
      output: {
        success: true,
        output: data,
        // Expose IDs for variable referencing
        client_id: clientId,
        customerId: clientId,
        project_id: projectId,
        projectId: projectId,
        group_id: groupId,
        epicId: groupId,
        task_id: taskId,
        id: taskId,
        sysId: taskId,
      },
    }
  },

  outputs: {
    success: { type: 'boolean', description: 'Indicates if transform was successful' },
    output: { type: 'object', description: 'Output from Arena' },
    client_id: { type: 'string', description: 'Client ID (customerId)' },
    customerId: { type: 'string', description: 'Customer ID' },
    project_id: { type: 'string', description: 'Project ID' },
    projectId: { type: 'string', description: 'Project ID' },
    group_id: { type: 'string', description: 'Group ID (epicId)' },
    epicId: { type: 'string', description: 'Epic/Group ID' },
    task_id: { type: 'string', description: 'Task ID (sysId)' },
    id: { type: 'string', description: 'Task ID (id field)' },
    sysId: { type: 'string', description: 'Task system ID' },
  },
}
