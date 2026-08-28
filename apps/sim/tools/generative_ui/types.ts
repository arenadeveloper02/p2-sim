import type { GenerativeUiMode } from '@/lib/generative-ui/types'
import type { ToolResponse } from '@/tools/types'

export interface GenerativeUiGenerateHtmlParams {
  userInput: string
  mode: GenerativeUiMode
}

export interface GenerativeUiGenerateHtmlResponse extends ToolResponse {
  output: {
    html: string
    spec: Record<string, unknown>
    mode: GenerativeUiMode
  }
}
