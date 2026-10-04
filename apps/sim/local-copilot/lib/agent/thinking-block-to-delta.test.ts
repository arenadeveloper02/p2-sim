/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { unresolvedThinkingBlockText } from '@/local-copilot/lib/agent/thinking-block-to-delta'
import { resolveLocalCopilotThinkingLevel } from '@/local-copilot/lib/config'
import {
  isBedrockClaudeModel,
  resolveBedrockThinkingAdditionalFields,
} from '@/local-copilot/lib/providers/bedrock'
import { chunksFromGeminiParts } from '@/local-copilot/lib/providers/gemini'
import { createOpenAiCompatibleThinkingBlocksAccumulator } from '@/local-copilot/lib/providers/openai-compatible-thinking-blocks'

describe('unresolvedThinkingBlockText', () => {
  it('returns the full block when nothing was streamed yet', () => {
    expect(unresolvedThinkingBlockText('', 'Plan A then B.')).toBe('Plan A then B.')
  })

  it('returns only the unread suffix when deltas already streamed a prefix', () => {
    expect(unresolvedThinkingBlockText('Plan A', 'Plan A then B.')).toBe(' then B.')
  })

  it('returns empty when the live stream already covered the block', () => {
    expect(unresolvedThinkingBlockText('Plan A then B.', 'Plan A then B.')).toBe('')
  })
})

describe('openai-compatible thinking_blocks live drain', () => {
  it('emits pending thinking text before the signature arrives', () => {
    const acc = createOpenAiCompatibleThinkingBlocksAccumulator()
    acc.push([{ type: 'thinking', thinking: 'First, ' }])
    expect(acc.drainPendingThinking()).toBe('First, ')
    acc.push([{ type: 'thinking', thinking: 'inspect the file.' }])
    expect(acc.drainPendingThinking()).toBe('inspect the file.')
    expect(acc.drainPendingThinking()).toBe('')

    acc.push([{ type: 'thinking', thinking: 'First, inspect the file.', signature: 'sig' }])
    expect(acc.drainCompleted()).toEqual([
      { type: 'thinking', thinking: 'First, inspect the file.', signature: 'sig' },
    ])
  })
})

describe('Bedrock Claude thinking request', () => {
  it('enables budget thinking for Claude 4.6 on Bedrock', () => {
    expect(resolveBedrockThinkingAdditionalFields('anthropic.claude-sonnet-4-6', 'medium')).toEqual(
      {
        thinking: { type: 'enabled', budget_tokens: 8192 },
      }
    )
  })

  it('skips thinking for non-Claude Bedrock models', () => {
    expect(
      resolveBedrockThinkingAdditionalFields('meta.llama3-3-70b-instruct-v1:0', 'medium')
    ).toBe(undefined)
    expect(isBedrockClaudeModel('deepseek.v3.2')).toBe(false)
  })

  it('resolves a thinking level for the bedrock provider', () => {
    expect(resolveLocalCopilotThinkingLevel('bedrock', 'medium')).toBe('medium')
  })
})

describe('Gemini thought parts', () => {
  it('emits thinking chunks for thought text and text chunks for answers', () => {
    const chunks = chunksFromGeminiParts(
      [
        { text: 'Reasoning step. ', thought: true },
        { text: 'Final answer.', thought: false },
      ],
      () => 'call-1'
    )
    expect(chunks).toEqual([
      { type: 'thinking', content: 'Reasoning step. ' },
      { type: 'text', content: 'Final answer.' },
    ])
  })
})
