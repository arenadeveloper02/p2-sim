import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'
import type { ToolResponse } from '@/tools/types'

export interface ArenaGenerativeUiParams {
  userInput: string
  pages?: unknown
  entryPath?: string
  apiBindings?: unknown
  designNotes?: string
  existingDraftId?: string
}

export interface ArenaGenerativeUiResponse extends ToolResponse {
  output: {
    draftId: string
    revisionId: string
    entryPath: string
    pages: Array<{ path: string; title: string }>
    content: string
    manifest: ArenaGenerativeAppManifest | Record<string, unknown>
  }
}
