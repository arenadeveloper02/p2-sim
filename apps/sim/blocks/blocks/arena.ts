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
      dependsOn: ['operation'],
      condition: { field: 'operation', value: ['arena_create_task', 'arena_create_sub_task'] },
    },
    {
      id: 'task-project',
      title: 'Project',
      type: 'arena-project-selector',
      required: true,
      placeholder: 'Enter project name',
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
      dependsOn: ['operation'],
      condition: { field: 'operation', value: ['arena_create_task'] },
    },
    {
      id: 'task-task',
      title: 'Task',
      type: 'arena-task-selector',
      required: true,
      placeholder: 'Enter task name',
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
      dependsOn: ['operation', 'task-client', 'task-project'],
      condition: {
        field: 'operation',
        value: ['arena_create_task', 'arena_create_sub_task'],
      },
    },

    //search task blocks
    {
      id: 'search-task-name',
      title: 'Task Name',
      type: 'long-input',
      required: false,
      placeholder: 'Enter task name',
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
      placeholder: 'Enter client name',
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
      placeholder: 'Enter assignee name',
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
  ],
  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
  },
  outputs: {
    success: { type: 'boolean', description: 'Indicates if transform was successful' },
    output: { type: 'json', description: 'Output from Arena' },
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
        return params
      },
    },
  },
}
