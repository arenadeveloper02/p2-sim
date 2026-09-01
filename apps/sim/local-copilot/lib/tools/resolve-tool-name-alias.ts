/**
 * Cloud/training tool names the File Agent still emits. Arena Copilot's write
 * path is `create_file` → `workspace_file` → `edit_content`; sandbox code is
 * `function_execute` (not Convex `run_function`).
 */
export const FILE_WRITE_ALIAS_NAMES = ['prepare_file_edit', 'edit_file', 'file_edit'] as const

export const FUNCTION_EXECUTE_ALIAS_NAMES = ['run_function'] as const

export const CALL_INTEGRATION_TOOL_ALIAS_NAMES = ['call_integration_tool'] as const

export const FILE_WRITE_ALIAS_ERROR =
  'There is no prepare_file_edit, edit_file, or run_function tool. To create a workspace file: create_file with fileName (pass content for md/txt/json/csv/html; empty shell for pptx/docx/pdf). To edit an existing HTML/text file: read files/<path>/content first, then workspace_file operation=patch with search_replace for a small change (or operation=update only for a full rewrite), then edit_content in the NEXT round. For sandbox data processing call function_execute with outputs.files — not a separate run_function tool.'

export type ResolvedLocalCopilotToolName =
  | { kind: 'ok'; name: string }
  | { kind: 'unsupported'; message: string }

/**
 * Remaps hallucinated Cloud file/sandbox/integration names onto Arena Copilot tools, or
 * returns a redirect error the model can follow.
 */
export function resolveLocalCopilotToolName(toolName: string): ResolvedLocalCopilotToolName {
  if ((FILE_WRITE_ALIAS_NAMES as readonly string[]).includes(toolName)) {
    return { kind: 'unsupported', message: FILE_WRITE_ALIAS_ERROR }
  }
  if ((FUNCTION_EXECUTE_ALIAS_NAMES as readonly string[]).includes(toolName)) {
    return { kind: 'ok', name: 'function_execute' }
  }
  if ((CALL_INTEGRATION_TOOL_ALIAS_NAMES as readonly string[]).includes(toolName)) {
    return { kind: 'ok', name: 'invoke_integration_tool' }
  }
  return { kind: 'ok', name: toolName }
}
