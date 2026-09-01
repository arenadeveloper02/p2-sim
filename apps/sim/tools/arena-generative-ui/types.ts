import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'
import type { ToolResponse, WorkflowToolExecutionContext } from '@/tools/types'

export interface ArenaGenerativeUiParams {
  /** App brief. Required on generate unless screenshots are uploaded; edit sends `editInstructions` instead. */
  userInput?: string
  /** Requested changes only, used by edit so the original brief is not resent. */
  editInstructions?: string
  /** UI screenshots to match. Workspace uploads, not inlined base64. */
  screenshots?: unknown
  pages?: unknown
  entryPath?: string
  apiBindings?: unknown
  designNotes?: string
  existingDraftId?: string
  _context?: WorkflowToolExecutionContext
}

export interface ArenaGenerativeUiResponse extends ToolResponse {
  output: {
    draftId: string
    revisionId: string
    entryPath: string
    pages: Array<{ path: string; title: string }>
    content: string
    manifest: ArenaGenerativeAppManifest | Record<string, unknown>
    structuredBrief?: {
      title: string
      archetype: string
      entryPath: string
      pages: Array<{ path: string; title: string }>
    }
    plannerError?: string
    editScope?: {
      mode: 'pages' | 'global' | 'theme' | 'replan'
      pages: string[]
    }
  }
}
