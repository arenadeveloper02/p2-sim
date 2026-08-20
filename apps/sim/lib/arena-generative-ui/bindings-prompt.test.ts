/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { bindingsSummaryForPrompt } from '@/lib/arena-generative-ui/bindings-prompt'

describe('bindingsSummaryForPrompt', () => {
  it('adds a synthetic example and bind-by-schema layout when outputSchema exists', () => {
    const summary = bindingsSummaryForPrompt([
      {
        key: 'qualify_lead',
        label: 'Qualify',
        kind: 'workflow',
        workflowId: 'wf-1',
        outputSchema: [
          { name: 'score', type: 'number' },
          { name: 'reasons', type: 'array' },
        ],
      },
    ])

    expect(summary[0]?.outputExample).toEqual({
      score: 72,
      reasons: [{ title: 'Example', id: 'ex-1' }],
    })
    expect(summary[0]?.resultLayout).toBe('bind outputSchema field names as statePath')
  })

  it('treats a missing outputSchema as a prose DataText constraint', () => {
    const summary = bindingsSummaryForPrompt([
      { key: 'run', label: 'Run', kind: 'workflow', workflowId: 'wf-1' },
    ])
    expect(summary[0]?.outputExample).toBeUndefined()
    expect(summary[0]?.resultLayout).toContain('do not invent Table columns')
  })

  it('keeps field descriptions on inputSchema', () => {
    const summary = bindingsSummaryForPrompt([
      {
        key: 'run',
        label: 'Run',
        kind: 'workflow',
        workflowId: 'wf-1',
        inputSchema: [
          { name: 'company', type: 'string', description: 'Legal name of the account' },
        ],
      },
    ])
    expect(summary[0]?.inputSchema).toEqual([
      { name: 'company', type: 'string', description: 'Legal name of the account' },
    ])
  })
})
