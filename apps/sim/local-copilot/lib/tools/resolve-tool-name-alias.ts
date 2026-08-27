/**
 * Cloud/training tool names the File Agent still emits. Arena Copilot's write
 * path is `create_file` → `workspace_file` → `edit_content`; sandbox code is
 * `function_execute` (not Convex `run_function`).
 */
export const FILE_WRITE_ALIAS_NAMES = ['prepare_file_edit', 'edit_file', 'file_edit'] as const

export const FUNCTION_EXECUTE_ALIAS_NAMES = ['run_function'] as const

export const FILE_WRITE_ALIAS_ERROR =
  'There is no prepare_file_edit, edit_file, or run_function tool. To write a workspace file: (1) create_file with fileName (pass content for md/txt/json/csv/html; empty shell for pptx/docx/pdf), (2) workspace_file with operation, target={kind:"path", path:"files/..."}, and title, (3) edit_content with the body in the NEXT round. For sandbox data processing call function_execute with outputs.files — not a separate run_function tool.'

export type ResolvedLocalCopilotToolName =
  | { kind: 'ok'; name: string }
  | { kind: 'unsupported'; message: string }

/**
 * Remaps hallucinated Cloud file/sandbox names onto Arena Copilot tools, or
 * returns a redirect error the model can follow.
 */
export function resolveLocalCopilotToolName(toolName: string): ResolvedLocalCopilotToolName {
  if ((FILE_WRITE_ALIAS_NAMES as readonly string[]).includes(toolName)) {
    return { kind: 'unsupported', message: FILE_WRITE_ALIAS_ERROR }
  }
  if ((FUNCTION_EXECUTE_ALIAS_NAMES as readonly string[]).includes(toolName)) {
    return { kind: 'ok', name: 'function_execute' }
  }
  return { kind: 'ok', name: toolName }
}
