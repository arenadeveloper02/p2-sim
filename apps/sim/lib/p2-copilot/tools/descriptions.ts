/**
 * Human-readable descriptions for the Sim tools exposed to the P2 copilot brain.
 *
 * The generated tool catalog only carries parameter-level descriptions, so we
 * supply tool-level summaries here. Anything not listed falls back to a
 * humanized version of the tool id (see `describeTool`).
 */
export const TOOL_DESCRIPTIONS: Record<string, string> = {
  // Workflow reads
  get_workflow_data: 'Get workflow data: global variables, custom tools, MCP tools, or files.',
  get_block_outputs:
    'Get the outputs (and reference tags) of blocks in the current workflow. Omit blockIds to list all blocks.',
  get_block_upstream_references:
    'Get the upstream blocks/values a given block can reference as inputs.',
  get_deployed_workflow_state: 'Get the currently deployed state of a workflow.',
  get_workflow_run_options: 'Get the available ways (triggers) a workflow can be run.',
  list_user_workspaces: 'List the workspaces the current user can access.',
  list_folders: 'List folders in a workspace.',
  diff_workflows: 'Compute the diff between two workflow states.',

  // Workflow edits
  edit_workflow:
    'Edit the current workflow: add, edit, delete, or move blocks. Use this to build and modify the canvas.',
  create_workflow: 'Create a new workflow in a workspace/folder.',
  delete_workflow: 'Delete a workflow.',
  rename_workflow: 'Rename a workflow.',
  move_workflow: 'Move a workflow to a different folder.',
  set_block_enabled: 'Enable or disable a block in the workflow.',
  set_global_workflow_variables: 'Set global variables for a workflow.',
  create_folder: 'Create a folder in a workspace.',
  delete_folder: 'Delete a folder.',
  move_folder: 'Move a folder.',

  // Execution
  run_workflow: 'Run the current workflow end-to-end.',
  run_workflow_until_block: 'Run the workflow up to a specific block.',
  run_from_block: 'Run the workflow starting from a specific block.',
  run_block: 'Run a single block in isolation.',
  function_execute: 'Execute a code function in a sandbox.',

  // Deployment
  deploy_api: 'Deploy the workflow as an API endpoint.',
  deploy_chat: 'Deploy the workflow as a chat interface.',
  deploy_mcp: 'Deploy the workflow as an MCP server.',
  redeploy: 'Redeploy the workflow.',
  promote_to_live: 'Promote a deployment version to live.',
  check_deployment_status: 'Check the deployment status of a workflow.',
  get_deployment_log: 'Get logs for a deployment.',
  load_deployment: 'Load a specific deployment version.',
  update_deployment_version: 'Update a deployment version.',
  generate_api_key: 'Generate an API key for the workflow.',

  // Management
  manage_custom_tool: 'Create, update, or delete a custom tool.',
  manage_mcp_tool: 'Manage MCP tools available to the workspace.',
  manage_skill: 'Create, update, or delete a reusable skill (playbook).',
  manage_credential: 'Manage stored credentials for integrations.',
  manage_job: 'Create or manage a scheduled job.',
  complete_job: 'Mark a job as complete.',
  update_job_history: 'Update the run history of a job.',
  list_workspace_mcp_servers: 'List MCP servers configured for the workspace.',
  create_workspace_mcp_server: 'Add an MCP server to the workspace.',
  update_workspace_mcp_server: 'Update an MCP server configuration.',
  delete_workspace_mcp_server: 'Remove an MCP server from the workspace.',
  oauth_get_auth_link: 'Get an OAuth authorization link for an integration.',
  oauth_request_access: 'Request OAuth access for an integration.',

  // Resources / files
  open_resource: 'Open a resource (workflow, file, etc.) in the UI.',
  restore_resource: 'Restore a previously deleted resource.',
  get_platform_actions: 'List the platform actions/integrations available.',
  materialize_file: 'Materialize a generated file into the workspace.',
  read: 'Read the contents of a workspace file.',
  glob: 'Find workspace files matching a glob pattern.',
  grep: 'Search workspace file contents with a regex.',
}

/** Returns a description for a tool id, falling back to a humanized id. */
export function describeTool(toolId: string): string {
  if (TOOL_DESCRIPTIONS[toolId]) return TOOL_DESCRIPTIONS[toolId]
  const humanized = toolId.replace(/_/g, ' ')
  return `Sim platform tool: ${humanized}.`
}
