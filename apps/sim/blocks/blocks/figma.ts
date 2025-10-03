import { FigmaIcon } from '@/components/icons'
import type { BlockConfig, SubBlockType } from '@/blocks/types'
import type { FigmaResponse } from '@/tools/figma/types'

export const FigmaBlock: BlockConfig<FigmaResponse> = {
  type: 'figma',
  name: 'Figma',
  description: 'Interact with Figma files, create designs, and convert to code',
  longDescription:
    'Integrate Figma into your workflow. Create new Figma files, convert designs to HTML/React/Angular code, manage comments, and access team projects. Requires Figma API key for authentication.',
  docsLink: 'https://docs.sim.ai/tools/figma',
  category: 'tools',
  bgColor: '#F24E1E',
  icon: FigmaIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      layout: 'full',
      options: [
        { label: 'Generate Figma Design', id: 'figma_create' },
        { label: 'Convert to Code with AI', id: 'figma_convert' },
        { label: 'Get Comments', id: 'figma_get_comments' },
        { label: 'Post Comment', id: 'figma_post_comment' },
        { label: 'Delete Comment', id: 'figma_delete_comment' },
        { label: 'Get Team Projects', id: 'figma_get_team_projects' },
        { label: 'Get File', id: 'figma_get_file' },
        { label: 'Get File Nodes', id: 'figma_get_file_nodes' },
        { label: 'Get File Images', id: 'figma_get_file_images' },
        { label: 'Get Project Files', id: 'figma_get_project_files' },
      ],
      value: () => 'figma_create',
    },
    // Create Figma File parameters
    {
      id: 'name',
      title: 'File Name',
      type: 'short-input',
      layout: 'full',
      placeholder: 'e.g., My Design',
      condition: { field: 'operation', value: 'figma_create' },
      required: true,
    },
    {
      id: 'description',
      title: 'Description',
      type: 'long-input',
      layout: 'full',
      placeholder: 'Optional description for the file',
      condition: { field: 'operation', value: 'figma_create' },
    },
    {
      id: 'designPrompt',
      title: 'AI Design Prompt',
      type: 'long-input',
      layout: 'full',
      placeholder: 'Describe the design you want to create with AI...',
      required: false,
      description: 'AI prompt to generate design content',
      condition: { field: 'operation', value: 'figma_create' },
    },
    {
      id: 'projectId',
      title: 'Project ID',
      type: 'short-input',
      layout: 'full',
      placeholder: 'Enter Figma project ID',
      required: true,
      description: 'Figma project ID to create the file in',
      condition: { field: 'operation', value: 'figma_create' },
    },
    {
      id: 'brandGuidelines',
      title: 'Brand Guidelines',
      type: 'file-upload' as SubBlockType,
      layout: 'full',
      required: false,
      description: 'Optional brand guidelines file (PDF, image, or text) to inform the design',
      condition: { field: 'operation', value: 'figma_create' },
    },
    // Convert to Code parameters
    {
      id: 'fileKey',
      title: 'File Key',
      type: 'short-input',
      layout: 'full',
      placeholder: 'e.g., abc123def456',
      condition: {
        field: 'operation',
        value: [
          'figma_convert',
          'figma_get_comments',
          'figma_post_comment',
          'figma_delete_comment',
          'figma_get_file',
          'figma_get_file_nodes',
          'figma_get_file_images',
        ],
      },
      required: true,
    },
    {
      id: 'nodeId',
      title: 'Node ID',
      type: 'short-input',
      layout: 'full',
      placeholder: 'e.g., 1:23 (optional)',
      condition: {
        field: 'operation',
        value: ['figma_get_comments', 'figma_get_file_images'],
      },
    },
    {
      id: 'nodeId',
      title: 'Node ID',
      type: 'short-input',
      layout: 'full',
      placeholder: 'e.g., 1:23',
      condition: {
        field: 'operation',
        value: ['figma_convert'],
      },
      required: true,
    },
    {
      id: 'outputFormat',
      title: 'Output Format',
      type: 'dropdown',
      layout: 'full',
      options: [
        { label: 'HTML', id: 'html' },
        { label: 'React', id: 'react' },
        { label: 'Angular', id: 'angular' },
      ],
      condition: { field: 'operation', value: 'figma_convert' },
      required: true,
    },
    {
      id: 'includeStyles',
      title: 'Include Styles',
      type: 'switch',
      layout: 'full',
      condition: { field: 'operation', value: 'figma_convert' },
    },
    {
      id: 'responsive',
      title: 'Responsive',
      type: 'switch',
      layout: 'full',
      condition: { field: 'operation', value: 'figma_convert' },
    },
    // Comment parameters
    {
      id: 'message',
      title: 'Comment Message',
      type: 'long-input',
      layout: 'full',
      placeholder: 'Enter your comment',
      condition: { field: 'operation', value: 'figma_post_comment' },
      required: true,
    },
    {
      id: 'commentId',
      title: 'Comment ID',
      type: 'short-input',
      layout: 'full',
      placeholder: 'e.g., 12345',
      condition: { field: 'operation', value: 'figma_delete_comment' },
      required: true,
    },
    // Team and Project parameters
    {
      id: 'teamId',
      title: 'Team ID',
      type: 'short-input',
      layout: 'full',
      placeholder: 'e.g., 123456789',
      condition: { field: 'operation', value: 'figma_get_team_projects' },
      required: true,
    },
    {
      id: 'projectId',
      title: 'Project ID',
      type: 'short-input',
      layout: 'full',
      placeholder: 'e.g., 987654321',
      condition: { field: 'operation', value: 'figma_get_project_files' },
      required: true,
    },
    // File parameters
    {
      id: 'version',
      title: 'Version',
      type: 'short-input',
      layout: 'full',
      placeholder: 'e.g., 1.0 (optional)',
      condition: {
        field: 'operation',
        value: ['figma_get_file', 'figma_get_file_nodes', 'figma_get_file_images'],
      },
    },
    {
      id: 'ids',
      title: 'Node IDs',
      type: 'long-input',
      layout: 'full',
      placeholder: 'e.g., 1:23,1:24 (comma-separated)',
      condition: {
        field: 'operation',
        value: ['figma_get_file_nodes', 'figma_get_file_images'],
      },
      required: true,
    },
    {
      id: 'format',
      title: 'Image Format',
      type: 'dropdown',
      layout: 'full',
      options: [
        { label: 'PNG', id: 'png' },
        { label: 'JPG', id: 'jpg' },
        { label: 'SVG', id: 'svg' },
        { label: 'PDF', id: 'pdf' },
      ],
      condition: { field: 'operation', value: 'figma_get_file_images' },
    },
    {
      id: 'scale',
      title: 'Scale',
      type: 'slider',
      layout: 'full',
      min: 0.1,
      max: 4,
      step: 0.1,
      condition: { field: 'operation', value: 'figma_get_file_images' },
    },
  ],
  tools: {
    access: [
      'figma_create',
      'figma_convert',
      'figma_get_comments',
      'figma_post_comment',
      'figma_delete_comment',
      'figma_get_team_projects',
      'figma_get_file',
      'figma_get_file_nodes',
      'figma_get_file_images',
      'figma_get_project_files',
    ],
    config: {
      tool: (params) => {
        switch (params.operation) {
          case 'figma_create':
            return 'figma_create'
          case 'figma_convert':
            return 'figma_convert'
          case 'figma_get_comments':
            return 'figma_get_comments'
          case 'figma_post_comment':
            return 'figma_post_comment'
          case 'figma_delete_comment':
            return 'figma_delete_comment'
          case 'figma_get_team_projects':
            return 'figma_get_team_projects'
          case 'figma_get_file':
            return 'figma_get_file'
          case 'figma_get_file_nodes':
            return 'figma_get_file_nodes'
          case 'figma_get_file_images':
            return 'figma_get_file_images'
          case 'figma_get_project_files':
            return 'figma_get_project_files'
          default:
            return 'figma_get_file'
        }
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
    name: { type: 'string', description: 'File name' },
    description: { type: 'string', description: 'File description' },
    fileKey: { type: 'string', description: 'Figma file key' },
    nodeId: { type: 'string', description: 'Node ID' },
    outputFormat: { type: 'string', description: 'Output format for conversion' },
    includeStyles: { type: 'boolean', description: 'Include CSS styles' },
    responsive: { type: 'boolean', description: 'Make output responsive' },
    message: { type: 'string', description: 'Comment message' },
    commentId: { type: 'string', description: 'Comment ID to delete' },
    teamId: { type: 'string', description: 'Team ID' },
    projectId: { type: 'string', description: 'Project ID' },
    version: { type: 'string', description: 'File version' },
    ids: { type: 'string', description: 'Comma-separated node IDs' },
    format: { type: 'string', description: 'Image format' },
    scale: { type: 'number', description: 'Image scale factor' },
    designPrompt: { type: 'string', description: 'AI design prompt' },
    brandGuidelines: { type: 'json', description: 'Brand guidelines file' },
  },
  outputs: {
    content: { type: 'string', description: 'Response content' },
    metadata: { type: 'json', description: 'Response metadata' },
  },
}
