import type { GenerativeUiGenerateResult, GenerativeUiMode } from '@/lib/generative-ui/types'
import type { GenerativeUiGenerateHtmlResponse } from '@/tools/generative_ui/types'

function normalizeMode(mode: GenerativeUiMode | undefined): GenerativeUiMode {
  return mode === 'webpage' ? 'webpage' : 'email'
}

/**
 * Maps generator / API result JSON into the Generative UI tool response shape.
 */
export function mapGenerativeUiResultToToolResponse(
  result: GenerativeUiGenerateResult
): GenerativeUiGenerateHtmlResponse {
  const mode = normalizeMode(result.mode)

  if (!result.success || !result.html) {
    return {
      success: false,
      error: result.error ?? 'Failed to generate HTML',
      output: {
        html: '',
        spec: result.spec ?? {},
        mode,
      },
    }
  }

  return {
    success: true,
    output: {
      html: result.html,
      spec: result.spec ?? {},
      mode: result.mode ?? mode,
    },
  }
}
