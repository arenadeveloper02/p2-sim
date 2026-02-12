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
        {
          label: 'Get Meetings',
          id: 'arena_get_meetings',
        },
        {
          label: 'Get Token',
          id: 'arena_get_token',
        },
      ],
      value: () => 'arena_create_task',
    },

    //create task blocks - basic mode
    {
      id: 'task-name',
      title: 'Task Name',
      type: 'long-input',
      required: true,
      placeholder: 'Enter task name',
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
      placeholder: 'Enter task description',
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
      placeholder: 'Enter client name',
      mode: 'basic',
      dependsOn: ['operation'],
      condition: { field: 'operation', value: ['arena_create_task', 'arena_create_sub_task'] },
    },
    {
      id: 'task-project',
      title: 'Project',
      type: 'arena-project-selector',
      required: true,
      placeholder: 'Enter project name',
      mode: 'basic',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_create_task', 'arena_create_sub_task'],
      },
    },
    {
      id: 'task-group',
      title: 'Group',
      type: 'arena-group-selector',
      required: true,
      placeholder: 'Enter group name',
      mode: 'basic',
      dependsOn: ['operation'],
      condition: { field: 'operation', value: ['arena_create_task'] },
    },
    {
      id: 'task-task',
      title: 'Task',
      type: 'arena-task-selector',
      required: true,
      placeholder: 'Enter task name',
      mode: 'basic',
      condition: {
        field: 'operation',
        value: ['arena_create_sub_task'],
      },
    },
    {
      id: 'task-assignee',
      title: 'Assignee',
      type: 'arena-assignee-selector',
      required: true,
      placeholder: 'Enter assignee name',
      mode: 'basic',
      dependsOn: ['operation', 'task-client', 'task-project'],
      condition: {
        field: 'operation',
        value: ['arena_create_task', 'arena_create_sub_task'],
      },
    },
    //create task blocks - advanced mode
    {
      id: 'task-client-name',
      title: 'Client Name',
      type: 'short-input',
      required: true,
      placeholder: 'Enter client name or use <function.result.client_name>',
      mode: 'advanced',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_create_task', 'arena_create_sub_task'],
      },
    },
    {
      id: 'task-project-name',
      title: 'Project Name',
      type: 'short-input',
      required: true,
      placeholder: 'Enter project name or use <function.result.project_name>',
      mode: 'advanced',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_create_task', 'arena_create_sub_task'],
      },
    },
    {
      id: 'task-epic-name',
      title: 'Group Name',
      type: 'short-input',
      required: true,
      placeholder: 'Enter group name or use <function.result.group_name>',
      mode: 'advanced',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_create_task'],
      },
    },
    {
      id: 'task-assignee-email',
      title: 'Assignee Email',
      type: 'short-input',
      required: true,
      placeholder: 'Enter assignee email or use <function.result.assignee_email>',
      mode: 'advanced',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_create_task', 'arena_create_sub_task'],
      },
    },
    {
      id: 'task-number',
      title: 'Task Number',
      type: 'short-input',
      required: true,
      placeholder: 'Enter task number or use <function.result.task_number>',
      mode: 'advanced',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_create_sub_task'],
      },
    },

    //search task blocks
    {
      id: 'search-task-name',
      title: 'Task Name or Task Number',
      type: 'long-input',
      required: false,
      placeholder: 'Enter task name or task number or use <function.result.task_name>',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_search_task'],
      },
    },
    //search task blocks - basic mode only
    {
      id: 'search-task-client',
      title: 'Client',
      type: 'arena-client-selector',
      required: false,
      placeholder: 'Enter client name',
      mode: 'basic',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_search_task'],
      },
    },
    {
      id: 'search-task-project',
      title: 'Project',
      type: 'arena-project-selector',
      required: false,
      placeholder: 'Enter project name',
      mode: 'basic',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_search_task'],
      },
    },
    {
      id: 'search-task-state',
      title: 'State',
      type: 'arena-states-selector',
      required: false,
      placeholder: 'Enter state',
      mode: 'basic',
      //value: () => 'open',
      condition: {
        field: 'operation',
        value: ['arena_search_task'],
      },
    },
    {
      id: 'search-task-visibility',
      title: 'Task Visibility',
      type: 'combobox',
      required: false,
      placeholder: 'Enter visibility',
      mode: 'basic',
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
      mode: 'basic',
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
      placeholder: 'Enter assignee name',
      mode: 'basic',
      dependsOn: ['search-task-client'],
      condition: {
        field: 'operation',
        value: ['arena_search_task'],
      },
    },
    {
      id: 'search-task-max-results',
      title: 'Max Results',
      type: 'short-input',
      placeholder: '10',
      mode: 'basic',
      dependsOn: ['operation'],
      condition: { field: 'operation', value: 'arena_search_task' },
    },

    //save summary blocks
    {
      id: 'save-summary-client',
      title: 'Client',
      type: 'arena-client-selector',
      required: true,
      placeholder: 'Enter client name',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_save_summary'],
      },
    },
    {
      id: 'save-summary-text',
      title: 'Summary',
      type: 'long-input',
      required: true,
      placeholder: 'Enter summary',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_save_summary'],
      },
    },

    //comments blocks - basic mode
    {
      id: 'comment-client',
      title: 'Client',
      type: 'arena-client-selector',
      required: true,
      placeholder: 'Enter client name',
      mode: 'basic',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_comments'],
      },
    },
    {
      id: 'comment-project',
      title: 'Project',
      type: 'arena-project-selector',
      required: true,
      placeholder: 'Enter project name',
      mode: 'basic',
      dependsOn: ['operation', 'comment-client'],
      condition: {
        field: 'operation',
        value: ['arena_comments'],
      },
    },
    {
      id: 'comment-group',
      title: 'Group',
      type: 'arena-group-selector',
      required: true,
      placeholder: 'Enter group name',
      mode: 'basic',
      dependsOn: ['operation', 'comment-client', 'comment-project'],
      condition: {
        field: 'operation',
        value: ['arena_comments'],
      },
    },
    {
      id: 'comment-task',
      title: 'Task',
      type: 'arena-task-selector',
      required: true,
      placeholder: 'Enter task name',
      mode: 'basic',
      dependsOn: ['operation', 'comment-project'],
      condition: {
        field: 'operation',
        value: ['arena_comments'],
      },
    },
    //comments blocks - advanced mode
    {
      id: 'comment-task-number',
      title: 'Task Number',
      type: 'short-input',
      required: true,
      placeholder: 'Enter task number or use <function.result.task_number>',
      mode: 'advanced',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_comments'],
      },
    },
    {
      id: 'comment-to',
      title: 'To',
      type: 'short-input',
      required: false,
      placeholder: 'e.g. email@example.com or <function.result.to_emails>',
      mode: 'advanced',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_comments'],
      },
    },
    {
      id: 'comment-cc',
      title: 'CC',
      type: 'short-input',
      required: false,
      placeholder: 'e.g. email@example.com or <function.result.cc_emails>',
      mode: 'advanced',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_comments'],
      },
    },
    //comments blocks - both modes
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
      placeholder: 'Enter comments',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_comments'],
      },
    },

    //get meetings blocks - basic mode
    {
      id: 'get-meetings-client',
      title: 'Client',
      type: 'arena-client-selector',
      required: true,
      placeholder: 'Enter client name',
      mode: 'basic',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_get_meetings'],
      },
    },
    {
      id: 'get-meetings-period',
      title: 'Period',
      type: 'combobox',
      required: true,
      placeholder: 'Select period',
      dependsOn: ['operation'],
      options: [
        { label: '7 days', id: '7days' },
        { label: 'Today', id: 'today' },
        { label: '14 days', id: '14days' },
      ],
      value: () => '7days',
      condition: {
        field: 'operation',
        value: ['arena_get_meetings'],
      },
    },
    //get meetings blocks - advanced mode
    {
      id: 'get-meetings-client-id',
      title: 'Client ID',
      type: 'short-input',
      required: true,
      placeholder: 'Enter client ID or use <function.result.client_id>',
      mode: 'advanced',
      dependsOn: ['operation'],
      condition: {
        field: 'operation',
        value: ['arena_get_meetings'],
      },
    },
  ],
  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
  },
  outputs: {
    success: { type: 'boolean', description: 'Indicates if transform was successful' },
    output: { type: 'json', description: 'Output from Arena' },
  },
  tools: {
    access: [
      'arena_create_task',
      'arena_save_summary',
      'arena_comments',
      'arena_get_meetings',
      'arena_get_token',
    ],
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
          case 'arena_get_meetings':
            return 'arena_get_meetings'
          case 'arena_get_token':
            return 'arena_get_token'
          default:
            throw new Error(`Invalid Arena operation: ${params.operation}`)
        }
      },
      params: (params) => {
        return params
      },
    },
  },
}
