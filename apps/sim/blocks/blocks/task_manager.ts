import { AgentIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'

export const TaskManagerBlock: BlockConfig = {
  type: 'task_manager',
  name: 'Task Manager',
  description: 'Task Management',
  longDescription: 'Task Management',
  docsLink: 'https://docs.sim.ai/tools/jira',
  category: 'tools',
  bgColor: '#E0E0E0',
  icon: AgentIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      layout: 'full',
      options: [
        { label: 'Create Task', id: 'arena_create_task' },
        {
          label: 'Create Sub Task',
          id: 'arena_create_sub_task',
        },
        {
          label: 'Search Task',
          id: 'arena_search_task',
        },
      ],
      value: () => 'arena_create_task',
    },

    //create task blocks
    {
      id: 'task-name',
      title: 'Task Name',
      type: 'long-input',
      layout: 'full',
      required: true,
      placeholder: 'Enter task name',
      condition: {
        field: 'operation',
        value: ['arena_create_task', 'arena_create_sub_task'],
      },
    },
    {
      id: 'task-description',
      title: 'Task Description',
      type: 'long-input',
      layout: 'full',
      required: true,
      placeholder: 'Enter task description',
      condition: {
        field: 'operation',
        value: ['arena_create_task', 'arena_create_sub_task'],
      },
    },
    {
      id: 'task-client',
      title: 'Client',
      type: 'arena-client-selector',
      layout: 'full',
      required: true,
      placeholder: 'Enter client name',
      condition: { field: 'operation', value: ['arena_create_task', 'arena_create_sub_task'] },
    },
    {
      id: 'task-project',
      title: 'Project',
      type: 'arena-project-selector',
      layout: 'full',
      required: true,
      placeholder: 'Enter project name',
      condition: {
        field: 'operation',
        value: ['arena_create_task', 'arena_create_sub_task'],
      },
    },
    {
      id: 'task-group',
      title: 'Group',
      type: 'arena-group-selector',
      layout: 'full',
      required: true,
      placeholder: 'Enter group name',
      dependsOn: ['operation'],
      condition: { field: 'operation', value: ['arena_create_task'] },
    },
    {
      id: 'task-task',
      title: 'Task',
      type: 'arena-task-selector',
      layout: 'full',
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
      layout: 'full',
      required: true,
      placeholder: 'Enter assignee name',
      dependsOn: ['task-client', 'task-project'],
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
      layout: 'full',
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
      layout: 'full',
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
      layout: 'full',
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
      layout: 'full',
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
      layout: 'full',
      required: false,
      placeholder: 'Enter visibility',
      options: [
        { label: 'Internal', id: 'INTERNAL' },
        { label: 'Client Facing', id: 'CLIENT-FACING' },
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
      layout: 'full',
      required: false,
      placeholder: 'Enter due date',
      options: [
        { label: 'Today', id: 'today' },
        { label: 'Tomorrow', id: 'tomorrow' },
        { label: 'This Week', id: 'this-week' },
        { label: 'Next Week', id: 'next-week' },
        { label: 'Last Week', id: 'last-week' },
        { label: 'This Month', id: 'this-month' },
        { label: 'Next Month', id: 'next-month' },
        { label: 'Past Dates', id: 'past-dates' },
        { label: 'Future Dates', id: 'future-dates' },
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
      layout: 'full',
      required: false,
      placeholder: 'Enter assignee name',
      dependsOn: ['search-task-client', 'search-task-project'],
      condition: {
        field: 'operation',
        value: ['arena_search_task'],
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
    access: ['arena_create_task'],
    config: {
      tool: (params) => {
        switch (params.operation) {
          case 'arena_create_task':
            return 'arena_create_task'
          case 'arena_create_sub_task':
            return 'arena_create_task'
          case 'arena_search_task':
            return 'arena_search_task'
          default:
            throw new Error(`Invalid Gmail operation: ${params.operation}`)
        }
      },
      params: (params) => {
        return params
      },
    },
  },
}
