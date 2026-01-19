import { ArenaIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'

export const ArenaBlock: BlockConfig = {
  type: 'arena',
  name: 'Arena',
  description: 'Arena',
  longDescription: 'Arena',
  docsLink: '',
  category: 'tools',
  bgColor: '#E0E0E0',
  icon: ArenaIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      required: true,
      options: [
        { label: 'Create Task', id: 'arena_create_task' },
        {
          label: 'Create Sub Task',
          id: 'arena_create_sub_task',
        },
        {
          label: 'Add Comments',
          id: 'arena_comments',
        },
        {
          label: 'Search Task',
          id: 'arena_search_task',
        },
        {
          label: 'Save Summary',
          id: 'arena_save_summary',
        },
      ],
      value: () => 'arena_create_task',
    },

    //create task blocks
    {
      id: 'task-name',
      title: 'Task Name',
      type: 'long-input',
      required: true,
      placeholder: 'Enter task name or use <block.field>',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_create_task', 'arena_create_sub_task'],
      },
    },
    {
      id: 'task-description',
      title: 'Task Description',
      type: 'long-input',
      required: true,
      placeholder: 'Enter task description or use <block.field>',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_create_task', 'arena_create_sub_task'],
      },
    },
    {
      id: 'task-client',
      title: 'Client',
      type: 'arena-client-selector',
      required: true,
      placeholder: 'Select client or enter ID/variable like <block.client_id>',
      dependsOn: ['operation'],
      condition: { field: 'operation', value: ['arena_create_task', 'arena_create_sub_task'] },
      advancedModeSupported: true,
    },
    {
      id: 'task-project',
      title: 'Project',
      type: 'arena-project-selector',
      required: true,
      placeholder: 'Select project or enter ID/variable like <block.project_id>',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_create_task', 'arena_create_sub_task'],
      },
      advancedModeSupported: true,
    },
    {
      id: 'task-group',
      title: 'Group',
      type: 'arena-group-selector',
      required: true,
      placeholder: 'Select group or enter ID/variable like <block.group_id>',
      dependsOn: ['operation'],
      condition: { field: 'operation', value: ['arena_create_task'] },
      advancedModeSupported: true,
    },
    {
      id: 'task-task',
      title: 'Task',
      type: 'arena-task-selector',
      required: true,
      placeholder: 'Select task or enter ID/variable like <block.task_id>',
      condition: {
        field: 'operation',
        value: ['arena_create_sub_task'],
      },
      advancedModeSupported: true,
    },
    {
      id: 'task-assignee',
      title: 'Assignee',
      type: 'arena-assignee-selector',
      required: true,
      placeholder: 'Select assignee or enter ID/variable like <block.assignee_id>',
      dependsOn: ['operation', 'task-client', 'task-project'],
      condition: {
        field: 'operation',
        value: ['arena_create_task', 'arena_create_sub_task'],
      },
      advancedModeSupported: true,
    },

    //search task blocks
    {
      id: 'search-task-name',
      title: 'Task Name',
      type: 'long-input',
      required: false,
      placeholder: 'Enter task name or use <block.field>',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_search_task'],
      },
    },
    {
      id: 'search-task-number',
      title: 'Task Number',
      type: 'short-input',
      required: false,
      placeholder: 'Enter task number or use <block.taskNumber>',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_search_task'],
      },
    },
    {
      id: 'search-task-client',
      title: 'Client',
      type: 'arena-client-selector',
      required: false,
      placeholder: 'Select client or enter ID/variable like <block.client_id>',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_search_task'],
      },
      advancedModeSupported: true,
    },
    {
      id: 'search-task-project',
      title: 'Project',
      type: 'arena-project-selector',
      required: false,
      placeholder: 'Select project or enter ID/variable like <block.project_id>',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_search_task'],
      },
      advancedModeSupported: true,
    },
    {
      id: 'search-task-state',
      title: 'State',
      type: 'arena-states-selector',
      required: false,
      placeholder: 'Select states or enter comma-separated values/variables',
      //value: () => 'open',
      condition: {
        field: 'operation',
        value: ['arena_search_task'],
      },
      advancedModeSupported: true,
    },
    {
      id: 'search-task-visibility',
      title: 'Task Visibility',
      type: 'combobox',
      required: false,
      placeholder: 'Enter visibility',
      dependsOn: ['operation'],
      options: [
        { label: 'Internal', id: 'Internal' },
        { label: 'Client Facing', id: 'Client Facing' },
      ],
      value: () => '',
      condition: {
        field: 'operation',
        value: ['arena_search_task'],
      },
    },
    {
      id: 'search-task-due-date',
      title: 'Due Date',
      type: 'combobox',
      required: false,
      placeholder: 'Enter due date',
      dependsOn: ['operation'],
      options: [
        { label: 'Yesterday', id: 'Yesterday' },
        { label: 'Today', id: 'Today' },
        { label: 'Tomorrow', id: 'Tomorrow' },
        { label: 'This Week', id: 'This Week' },
        { label: 'Next Week', id: 'Next Week' },
        { label: 'Last Week', id: 'Last Week' },
        { label: 'This Month', id: 'This Month' },
        { label: 'Next Month', id: 'Next Month' },
        { label: 'Last Month', id: 'Last Month' },
        // { label: 'Past Dates', id: 'past-dates' },
        // { label: 'Future Dates', id: 'future-dates' },
      ],
      value: () => '',
      condition: {
        field: 'operation',
        value: ['arena_search_task'],
      },
    },
    {
      id: 'search-task-assignee',
      title: 'Search Assignee',
      type: 'arena-assignee-selector',
      required: false,
      placeholder: 'Select assignee or enter ID/variable like <block.assignee_id>',
      dependsOn: ['search-task-client'],
      condition: {
        field: 'operation',
        value: ['arena_search_task'],
      },
      advancedModeSupported: true,
    },
    {
      id: 'search-task-max-results',
      title: 'Max Results',
      type: 'short-input',
      placeholder: '10',
      dependsOn: ['operation'],
      condition: { field: 'operation', value: 'arena_search_task' },
    },

    //save summary blocks
    {
      id: 'save-summary-client',
      title: 'Client',
      type: 'arena-client-selector',
      required: true,
      placeholder: 'Select client or enter ID/variable like <block.client_id>',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_save_summary'],
      },
      advancedModeSupported: true,
    },
    {
      id: 'save-summary-text',
      title: 'Summary',
      type: 'long-input',
      required: true,
      placeholder: 'Enter summary or use <block.field>',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_save_summary'],
      },
    },

    //comments blocks
    {
      id: 'comment-client',
      title: 'Client',
      type: 'arena-client-selector',
      required: true,
      placeholder: 'Select client or enter ID/variable like <block.client_id>',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_comments'],
      },
      advancedModeSupported: true,
    },
    {
      id: 'comment-project',
      title: 'Project',
      type: 'arena-project-selector',
      required: true,
      placeholder: 'Select project or enter ID/variable like <block.project_id>',
      dependsOn: ['operation', 'comment-client'],
      condition: {
        field: 'operation',
        value: ['arena_comments'],
      },
      advancedModeSupported: true,
    },
    {
      id: 'comment-group',
      title: 'Group',
      type: 'arena-group-selector',
      required: true,
      placeholder: 'Select group or enter ID/variable like <block.group_id>',
      dependsOn: ['operation', 'comment-client', 'comment-project'],
      condition: {
        field: 'operation',
        value: ['arena_comments'],
      },
      advancedModeSupported: true,
    },
    {
      id: 'comment-task',
      title: 'Task',
      type: 'arena-task-selector',
      required: true,
      placeholder: 'Select task or enter ID/variable like <block.task_id>',
      dependsOn: ['operation', 'comment-project'],
      condition: {
        field: 'operation',
        value: ['arena_comments'],
      },
      advancedModeSupported: true,
    },
    {
      id: 'comment-client-note',
      title: 'Client Note',
      type: 'switch',
      required: false,
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_comments'],
      },
    },
    {
      id: 'comment-text',
      title: 'Comments',
      type: 'long-input',
      required: true,
      placeholder: 'Enter comments or use <block.field>',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_comments'],
      },
    },
  ],
  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
  },
  outputs: {
    success: { type: 'boolean', description: 'Indicates if transform was successful' },
    output: { type: 'json', description: 'Output from Arena' },
    // Task identifiers - multiple aliases for flexibility
    task_id: { type: 'string', description: 'Task ID (sysId)' },
    id: { type: 'string', description: 'Task ID (id field)' },
    sysId: { type: 'string', description: 'Task system ID' },
    // Client/Project/Group/Assignee IDs - multiple aliases
    client_id: { type: 'string', description: 'Client ID (customerId)' },
    customerId: { type: 'string', description: 'Customer ID' },
    project_id: { type: 'string', description: 'Project ID' },
    projectId: { type: 'string', description: 'Project ID' },
    group_id: { type: 'string', description: 'Group ID (epicId)' },
    epicId: { type: 'string', description: 'Epic/Group ID' },
    assignee_id: { type: 'string', description: 'Assignee ID (assignedToId)' },
    assignedToId: { type: 'string', description: 'Assigned user ID' },
    // Task details
    task_name: { type: 'string', description: 'Task name' },
    name: { type: 'string', description: 'Task name' },
    description: { type: 'string', description: 'Task description' },
    // Additional useful fields
    taskNumber: { type: 'string', description: 'Task number' },
    status: { type: 'string', description: 'Task status' },
    arenaStatus: { type: 'string', description: 'Arena status' },
    projectName: { type: 'string', description: 'Project name' },
    customerName: { type: 'string', description: 'Customer/Client name' },
    epicName: { type: 'string', description: 'Epic/Group name' },
  },
  tools: {
    access: ['arena_create_task', 'arena_save_summary', 'arena_comments'],
    config: {
      tool: (params) => {
        switch (params.operation) {
          case 'arena_create_task':
            return 'arena_create_task'
          case 'arena_create_sub_task':
            return 'arena_create_task'
          case 'arena_search_task':
            return 'arena_search_task'
          case 'arena_save_summary':
            return 'arena_save_summary'
          case 'arena_comments':
            return 'arena_comments'
          default:
            throw new Error(`Invalid Arena operation: ${params.operation}`)
        }
      },
      params: (params) => {
        // Helper function to extract ID from selector object or use string value directly
        // Supports both basic mode (selector objects) and advanced mode (string values/variables)
        const extractId = (value: any): string => {
          if (!value) return ''
          if (typeof value === 'object') {
            // Extract ID from selector object (basic mode)
            return value.clientId || value.sysId || value.id || value.value || String(value)
          }
          // Use string value directly (advanced mode - supports variables like <block.field>)
          return String(value).trim()
        }

        // Helper function to extract string value (for text inputs)
        // Returns empty string for falsy values, but trims whitespace for truthy values
        // Also handles HTML entity decoding to prevent double-escaping issues
        const extractString = (value: any): string => {
          if (value === null || value === undefined) return ''
          let str = String(value).trim()
          // Handle HTML entities that might have been double-escaped
          // Decode common HTML entities to prevent double-escaping issues
          if (str.includes('&')) {
            // Only decode if it looks like HTML entities (to avoid decoding legitimate & characters)
            if (str.includes('&lt;') || str.includes('&gt;') || str.includes('&amp;')) {
              str = str
                .replace(/&amp;lt;/g, '<')
                .replace(/&amp;gt;/g, '>')
                .replace(/&amp;amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
            }
          }
          return str
        }

        const result = { ...params }

        // Extract values for Create Task / Create Sub Task operations
        if (
          params.operation === 'arena_create_task' ||
          params.operation === 'arena_create_sub_task'
        ) {
          result['task-name'] = extractString(params['task-name'])
          result['task-description'] = extractString(params['task-description'])
          result['task-client'] = extractId(params['task-client'])
          result['task-project'] = extractId(params['task-project'])
          result['task-group'] = extractId(params['task-group'])
          result['task-task'] = extractId(params['task-task'])
          result['task-assignee'] = extractId(params['task-assignee'])
        }

        // Extract values for Search Task operation
        if (params.operation === 'arena_search_task') {
          const taskName = extractString(params['search-task-name'])
          const taskNumber = extractString(params['search-task-number'])

          // Only include non-empty values to avoid sending null/empty strings
          if (taskName) result['search-task-name'] = taskName
          if (taskNumber) result['search-task-number'] = taskNumber

          result['search-task-client'] = extractId(params['search-task-client'])
          result['search-task-project'] = extractId(params['search-task-project'])
          result['search-task-assignee'] = extractId(params['search-task-assignee'])
          // For states, handle both array (basic mode) and string (advanced mode)
          if (params['search-task-state']) {
            if (Array.isArray(params['search-task-state'])) {
              result['search-task-state'] = params['search-task-state']
            } else {
              // Advanced mode: comma-separated string or variable reference
              result['search-task-state'] = extractString(params['search-task-state'])
            }
          }
        }

        // Extract values for Add Comments operation
        if (params.operation === 'arena_comments') {
          result['comment-client'] = extractId(params['comment-client'])
          result['comment-project'] = extractId(params['comment-project'])
          result['comment-group'] = extractId(params['comment-group'])
          result['comment-task'] = extractId(params['comment-task'])
          result['comment-text'] = extractString(params['comment-text'])
        }

        // Extract values for Save Summary operation
        if (params.operation === 'arena_save_summary') {
          result['save-summary-client'] = extractId(params['save-summary-client'])
          result['save-summary-text'] = extractString(params['save-summary-text'])
        }

        return result
      },
    },
  },
}
