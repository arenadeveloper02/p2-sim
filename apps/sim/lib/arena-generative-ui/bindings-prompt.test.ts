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
    expect(summary[0]?.layoutPlan?.kind).toBe('collection')
    expect(summary[0]?.layoutPlan?.hostKeys).toEqual(['reasons', 'score'])
    expect(summary[0]?.resultLayout).toContain('bind layoutPlan.hostKeys as statePath')
    expect(summary[0]?.resultLayout).toContain('never "field.content"')
  })

  it('does not send Sample paste values to the planner', () => {
    const summary = bindingsSummaryForPrompt([
      {
        key: 'crm_lookup',
        label: 'Lookup',
        kind: 'http',
        outputSchema: [
          { name: 'email', type: 'string' },
          { name: 'plan', type: 'string' },
        ],
        outputSample: '{"email":"ada@example.com","plan":"enterprise"}',
      },
    ])
    expect(JSON.stringify(summary)).not.toContain('ada@example.com')
    expect(JSON.stringify(summary)).not.toContain('enterprise')
    expect(summary[0]).not.toHaveProperty('outputSample')
  })

  it('treats a missing outputSchema as a prose DataText constraint', () => {
    const summary = bindingsSummaryForPrompt([
      { key: 'run', label: 'Run', kind: 'workflow', workflowId: 'wf-1' },
    ])
    expect(summary[0]?.outputExample).toBeUndefined()
    expect(summary[0]?.layoutPlan?.kind).toBe('prose')
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

  it('includes input source and constant value so the generator does not invent form fields', () => {
    const summary = bindingsSummaryForPrompt([
      {
        key: 'run_history',
        label: 'Run history',
        kind: 'workflow',
        workflowId: 'wf-1',
        inputSchema: [
          { name: 'type', type: 'string', source: 'constant', value: 'history' },
          { name: 'email', type: 'string', source: 'visitorEmail' },
        ],
      },
    ])
    expect(summary[0]?.inputSchema).toEqual([
      { name: 'type', type: 'string', source: 'constant', value: 'history' },
      { name: 'email', type: 'string', source: 'visitorEmail' },
    ])
  })

  it('forwards last-run outputSchemaWarnings to the generator', () => {
    const summary = bindingsSummaryForPrompt([
      {
        key: 'run_history',
        label: 'Run history',
        kind: 'workflow',
        workflowId: 'wf-1',
        outputSchema: [{ name: 'run_data.history', type: 'array' }],
        outputSchemaWarnings: ['Schema is from a run of an older deployment.'],
      },
    ])
    expect(summary[0]?.outputSchemaWarnings).toEqual([
      'Schema is from a run of an older deployment.',
    ])
  })

  it('tells the generator to selectItem when list items include a prose field', () => {
    const summary = bindingsSummaryForPrompt([
      {
        key: 'run_history',
        label: 'Run history',
        kind: 'workflow',
        workflowId: 'wf-1',
        outputSchema: [
          { name: 'history', type: 'array' },
          { name: 'history[].keyword', type: 'string' },
          { name: 'history[].output', type: 'string' },
        ],
      },
    ])
    expect(summary[0]?.layoutPlan?.collections[0]?.samePageSelect).toBe(true)
    expect(summary[0]?.layoutPlan?.collections[0]?.hostKey).toBe('history')
    expect(summary[0]?.resultLayout).toContain('selectItem')
    expect(summary[0]?.resultLayout).toContain('clearItem')
    expect(summary[0]?.resultLayout).toContain('!selectedId')
    expect(summary[0]?.resultLayout).toContain('History-style same-page Open')
    expect(summary[0]?.resultLayout).toContain(
      'Workspace and Drawer keep the collection visible'
    )
    expect(summary[0]?.resultLayout).toContain('do not bind item.output')
    expect(summary[0]?.resultLayout).toContain('{targetKeyword}')
    expect(summary[0]?.resultLayout).not.toContain('restamp inputs')
  })

  it('does not tell the planner to bind envelope key data from a markdown Response sample', () => {
    const summary = bindingsSummaryForPrompt([
      {
        key: 'run_history',
        label: 'Run history',
        kind: 'workflow',
        workflowId: 'wf-1',
        outputSchema: [{ name: 'data', type: 'string' }],
        outputSchemaSource: 'sample',
        outputSample: JSON.stringify({
          data: '# Digital Camera Guide',
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      },
    ])
    expect(summary[0]?.outputSchema).toEqual([])
    expect(summary[0]?.layoutPlan?.kind).toBe('prose')
    expect(summary[0]?.layoutPlan?.hostKeys).toEqual(['content'])
    expect(JSON.stringify(summary)).not.toContain('# Digital Camera Guide')
  })
})
