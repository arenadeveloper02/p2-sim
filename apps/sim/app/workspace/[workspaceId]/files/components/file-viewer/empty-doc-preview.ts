import type { WorkspaceFileRecord } from '@/lib/uploads/contexts/workspace'

/**
 * Generated office docs start as empty shells. Binary preview must not enable
 * its fetch (or look "stuck loading") until committed bytes exist.
 */
export function getEmptyDocPreviewMessage(
  file: Pick<WorkspaceFileRecord, 'size' | 'key' | 'name'>,
  label: 'PDF' | 'presentation' | 'document'
): string | null {
  if ((file.size ?? 0) > 0 && file.key) return null
  return `This ${label} has no content yet. Wait for generation to finish, or ask the agent to write it with edit_content.`
}

export function getZeroByteDocPreviewMessage(label: 'PDF' | 'presentation' | 'document'): string {
  return `The ${label} file is empty (0 bytes). Re-run file generation to rebuild it.`
}
