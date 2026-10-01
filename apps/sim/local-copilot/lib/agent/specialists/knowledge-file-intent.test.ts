/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { classifyLocalCopilotIntent } from '@/local-copilot/lib/agent/specialists/classify'
import { toolNamesForIntent } from '@/local-copilot/lib/agent/specialists/domains'

describe('knowledge base create intent includes file writes', () => {
  const message = `create a knowledgebase which has below data:
1. Recipe - south indian style food
2. Cricket - All laws and available BCCI approved grounds in India
3. Football - Football laws in detail
4. List of Ministers - Names and roles in Karnataka for the year 2026`

  it('keeps both knowledge and file in the intent for seed-KB asks', () => {
    const intent = classifyLocalCopilotIntent(message)
    const domains = [intent.primary, ...intent.secondary]
    expect(domains).toContain('knowledge')
    expect(domains).toContain('file')
  })

  it('exposes create_file and knowledge_base for knowledge seed intents', () => {
    const intent = classifyLocalCopilotIntent(message)
    const names = toolNamesForIntent(intent)
    expect(names).not.toBeNull()
    expect(names!.has('knowledge_base')).toBe(true)
    expect(names!.has('create_file')).toBe(true)
  })

  it('still exposes create_file when only knowledge is classified', () => {
    const names = toolNamesForIntent({
      primary: 'knowledge',
      secondary: [],
      useFullCatalog: false,
    })
    expect(names!.has('create_file')).toBe(true)
    expect(names!.has('knowledge_base')).toBe(true)
  })
})
