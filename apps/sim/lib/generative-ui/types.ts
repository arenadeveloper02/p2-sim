/**
 * Output mode for Generative UI HTML generation.
 */
export type GenerativeUiMode = 'email' | 'webpage'

/**
 * Result of prompt → json-render → HTML generation.
 */
export interface GenerativeUiGenerateResult {
  success: boolean
  html?: string
  spec?: Record<string, unknown>
  mode?: GenerativeUiMode
  error?: string
}
