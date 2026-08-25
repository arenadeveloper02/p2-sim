/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  applyUnchangedOutputLayout,
  curlFromHttpBinding,
  displayedBindingOutputSchema,
  emptyBindingFormState,
  formStateFromBinding,
} from '@/lib/arena-generative-ui/binding-form'
import { httpBindingFromCurl } from '@/lib/arena-generative-ui/from-curl'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'

const history: ArenaGenerativeApiBinding = {
  key: 'run_history',
  label: 'vij- Run history',
  kind: 'workflow',
  workflowId: 'wf-history',
  stream: true,
  outputSchema: [
    { name: 'run_data', type: 'object' },
    { name: 'run_data.history', type: 'array' },
  ],
  outputSchemaSource: 'sample',
  inputSchema: [
    { name: 'type', type: 'string', source: 'constant', value: 'history' },
    { name: 'email', type: 'string', source: 'visitorEmail' },
  ],
}

describe('formStateFromBinding', () => {
  it('hydrates a workflow binding including input overrides', () => {
    const form = formStateFromBinding(history)
    expect(form.source).toBe('workflow')
    expect(form.key).toBe('run_history')
    expect(form.workflowId).toBe('wf-history')
    expect(form.streamMode).toBe('on')
    expect(form.outputSample).toBe('')
    expect(form.inputSourceOverrides).toEqual({
      type: { source: 'constant', value: 'history' },
      email: { source: 'visitorEmail' },
    })
  })

  it('puts stored stream prose back in Sample response', () => {
    expect(
      formStateFromBinding({
        key: 'writeup',
        label: 'writeup',
        kind: 'workflow',
        workflowId: 'wf-1',
        stream: true,
        outputHint: '# Company analysis',
      }).outputSample
    ).toBe('# Company analysis')
  })

  it('rebuilds an HTTP curl the importer can parse', () => {
    const saved: ArenaGenerativeApiBinding = {
      key: 'crm_lookup',
      label: 'crm_lookup',
      kind: 'http',
      http: {
        method: 'POST',
        url: 'https://api.example.com/lookup',
        headersSecretName: 'CRM_API_TOKEN',
      },
      forwardEmailId: true,
      inputSchema: [{ name: 'company', type: 'string' }],
    }
    const form = formStateFromBinding(saved)
    expect(form.source).toBe('http')
    expect(form.secretVar).toBe('CRM_API_TOKEN')
    expect(form.forwardEmail).toBe('on')
    const roundTrip = httpBindingFromCurl({
      key: form.key,
      curl: form.curl,
      headersSecretName: form.secretVar,
    })
    expect(roundTrip.http).toEqual({
      method: 'POST',
      url: 'https://api.example.com/lookup',
      headersSecretName: 'CRM_API_TOKEN',
    })
    expect(roundTrip.inputSchema?.map((field) => field.name)).toEqual(['company'])
  })

  it('leaves Sample empty when the schema came from the deployed workflow', () => {
    expect(
      formStateFromBinding({
        key: 'run',
        label: 'run',
        kind: 'workflow',
        workflowId: 'wf-1',
        outputSchema: [{ name: 'run_data', type: 'string' }],
      }).outputSample
    ).toBe('')
  })
})

describe('curlFromHttpBinding', () => {
  it('omits a body when there are no input fields', () => {
    expect(
      curlFromHttpBinding({
        key: 'ping',
        label: 'ping',
        kind: 'http',
        http: { method: 'GET', url: 'https://api.example.com/ping' },
      })
    ).toBe('curl -X GET https://api.example.com/ping')
  })
})

describe('applyUnchangedOutputLayout', () => {
  it('keeps a pasted schema when Sample is left blank on edit', () => {
    const next: ArenaGenerativeApiBinding = {
      key: 'run_history',
      label: 'vij- Run history',
      kind: 'workflow',
      workflowId: 'wf-history',
      outputSchema: [{ name: 'run_data.history', type: 'number' }],
    }
    expect(applyUnchangedOutputLayout(next, history, '   ')).toEqual({
      ...next,
      outputSchema: history.outputSchema,
      outputSchemaSource: 'sample',
    })
  })

  it('drops last-run warnings when keeping a pasted Sample on edit', () => {
    const next: ArenaGenerativeApiBinding = {
      key: 'run_history',
      label: 'vij- Run history',
      kind: 'workflow',
      workflowId: 'wf-history',
      outputSchema: [{ name: 'run_data', type: 'object' }],
      outputSchemaWarnings: ['Schema is from a run of an older deployment.'],
    }
    expect(applyUnchangedOutputLayout(next, history, '')).toEqual({
      key: 'run_history',
      label: 'vij- Run history',
      kind: 'workflow',
      workflowId: 'wf-history',
      outputSchema: history.outputSchema,
      outputSchemaSource: 'sample',
    })
  })

  it('uses the newly pasted sample instead of the saved layout', () => {
    const next: ArenaGenerativeApiBinding = {
      key: 'run_history',
      label: 'vij- Run history',
      kind: 'workflow',
      workflowId: 'wf-history',
      outputSchema: [{ name: 'items', type: 'array' }],
      outputSchemaSource: 'sample',
    }
    expect(applyUnchangedOutputLayout(next, history, '{"items":[]}')).toEqual(next)
  })

  it('takes the live workflow extract when the saved schema was not a sample', () => {
    const previous: ArenaGenerativeApiBinding = {
      key: 'run_history',
      label: 'Run history',
      kind: 'workflow',
      workflowId: 'wf-history',
      outputSchema: [{ name: 'run_data', type: 'object' }],
    }
    const next: ArenaGenerativeApiBinding = {
      ...previous,
      outputSchema: [
        { name: 'run_data', type: 'object' },
        { name: 'run_data.history', type: 'array' },
      ],
    }
    expect(applyUnchangedOutputLayout(next, previous, '')).toEqual(next)
  })
})

describe('displayedBindingOutputSchema', () => {
  it('prefers a live Sample paste', () => {
    expect(
      displayedBindingOutputSchema({
        sampleFields: [{ name: 'items', type: 'array' }],
        liveFields: [{ name: 'run_data', type: 'object' }],
        savedSchema: [{ name: 'run_data', type: 'object' }],
        savedFromSample: false,
      })
    ).toEqual([{ name: 'items', type: 'array' }])
  })

  it('keeps a saved Sample while the textarea is empty', () => {
    expect(
      displayedBindingOutputSchema({
        sampleFields: [],
        liveFields: [{ name: 'run_data', type: 'object' }],
        savedSchema: [{ name: 'items', type: 'array' }],
        savedFromSample: true,
      })
    ).toEqual([{ name: 'items', type: 'array' }])
  })

  it('shows the deployed extract over a truncated saved workflow schema', () => {
    expect(
      displayedBindingOutputSchema({
        sampleFields: [],
        liveFields: [
          { name: 'run_data', type: 'object' },
          { name: 'run_data.history', type: 'array' },
        ],
        savedSchema: [{ name: 'run_data', type: 'object' }],
        savedFromSample: false,
      })
    ).toEqual([
      { name: 'run_data', type: 'object' },
      { name: 'run_data.history', type: 'array' },
    ])
  })
})

describe('emptyBindingFormState', () => {
  it('returns a blank add form', () => {
    expect(emptyBindingFormState().key).toBe('')
    expect(emptyBindingFormState().source).toBe('http')
  })
})
