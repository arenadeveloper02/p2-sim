import type { ArenaGenerativeUiResponse } from '@/tools/arena-generative-ui/types'

interface ArenaGenerativeResultLike {
  success: boolean
  error?: string
  output?: ArenaGenerativeUiResponse['output']
}

const emptyOutput: ArenaGenerativeUiResponse['output'] = {
  draftId: '',
  revisionId: '',
  entryPath: '',
  pages: [],
  content: '',
  manifest: { entryPath: '', pages: {}, actions: {} },
}

/**
 * Maps generator / API result JSON into the Arena Generative UI tool response shape.
 */
export function mapArenaGenerativeResultToToolResponse(
  result: ArenaGenerativeResultLike
): ArenaGenerativeUiResponse {
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? 'Failed to generate app',
      output: result.output ?? emptyOutput,
    }
  }

  return {
    success: true,
    output: result.output ?? emptyOutput,
  }
}
