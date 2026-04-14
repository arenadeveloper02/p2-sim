import { getAccurateTokenCount } from '@/lib/tokenization/accurate'

export function countAgentTokens(text: string, model?: string): number {
  return getAccurateTokenCount(text, model)
}
