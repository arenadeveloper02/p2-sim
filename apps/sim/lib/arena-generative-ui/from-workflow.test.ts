/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  inputSchemaFromWorkflowFields,
  workflowBindingFromSelection,
} from '@/lib/arena-generative-ui/from-workflow'
import { parseApiBindings } from '@/lib/arena-generative-ui/parse-inputs'

describe('inputSchemaFromWorkflowFields', () => {
  it('keeps names, types, and descriptions', () => {
    expect(
      inputSchemaFromWorkflowFields([
        { id: 'f1', name: 'company', type: 'string', description: 'Legal name' },
        { id: 'f2', name: 'seats', type: 'number', placeholder: '10', required: true },
      ])
    ).toEqual([
      { name: 'company', type: 'string', description: 'Legal name' },
      { name: 'seats', type: 'number' },
    ])
  })

  it('defaults a field with no declared type to string', () => {
    expect(inputSchemaFromWorkflowFields([{ name: 'notes', type: '' }])).toEqual([
      { name: 'notes', type: 'string' },
    ])
  })

  it('drops unnamed fields and de-duplicates repeats', () => {
    expect(
      inputSchemaFromWorkflowFields([
        { name: '  ', type: 'string' },
        { name: 'company', type: 'string' },
        { name: 'company', type: 'number' },
      ])
    ).toEqual([{ name: 'company', type: 'string' }])
  })

  it('returns an empty schema for a workflow with no start-block fields', () => {
    expect(inputSchemaFromWorkflowFields(undefined)).toEqual([])
    expect(inputSchemaFromWorkflowFields([])).toEqual([])
  })
})

describe('workflowBindingFromSelection', () => {
  it('builds a workflow binding with the derived inputSchema', () => {
    const binding = workflowBindingFromSelection({
      key: 'qualify_lead',
      workflowId: 'wf-1',
      label: 'Qualify',
      inputFields: [{ name: 'company', type: 'string' }],
    })

    expect(binding).toEqual({
      key: 'qualify_lead',
      label: 'Qualify',
      kind: 'workflow',
      workflowId: 'wf-1',
      inputSchema: [{ name: 'company', type: 'string' }],
    })
  })

  it('falls back to the key when no label is given', () => {
    expect(workflowBindingFromSelection({ key: 'qualify_lead', workflowId: 'wf-1' }).label).toBe(
      'qualify_lead'
    )
  })

  it('omits inputSchema entirely when the workflow declares no inputs', () => {
    const binding = workflowBindingFromSelection({ key: 'run', workflowId: 'wf-1' })

    expect(binding.inputSchema).toBeUndefined()
    expect(binding.outputSchema).toBeUndefined()
    expect(binding.stream).toBeUndefined()
  })

  it('derives outputSchema from a sample response', () => {
    const binding = workflowBindingFromSelection({
      key: 'run',
      workflowId: 'wf-1',
      outputSample: '{"score": 91, "reasons": ["fit"]}',
    })

    expect(binding.outputSchema?.map((field) => field.name)).toEqual(
      expect.arrayContaining(['score', 'reasons'])
    )
  })

  it('stores stream prose as outputHint instead of throwing', () => {
    const binding = workflowBindingFromSelection({
      key: 'run',
      workflowId: 'wf-1',
      stream: true,
      outputSample: '# Company analysis',
    })
    expect(binding.outputSchema).toBeUndefined()
    expect(binding.outputHint).toBe('# Company analysis')
  })

  it('rejects non-JSON output format when not streaming', () => {
    expect(() =>
      workflowBindingFromSelection({
        key: 'run',
        workflowId: 'wf-1',
        outputSample: '# Company analysis',
      })
    ).toThrow('Output format must be valid JSON')
  })

  it('sets stream only when asked', () => {
    expect(workflowBindingFromSelection({ key: 'r', workflowId: 'w', stream: true }).stream).toBe(
      true
    )
    expect(
      workflowBindingFromSelection({ key: 'r', workflowId: 'w', stream: false }).stream
    ).toBeUndefined()
  })

  it('rejects a missing key or workflow', () => {
    expect(() => workflowBindingFromSelection({ key: '  ', workflowId: 'wf-1' })).toThrow(
      'Key is required'
    )
    expect(() => workflowBindingFromSelection({ key: 'run', workflowId: '  ' })).toThrow(
      'Select a workflow'
    )
  })

  /**
   * The picker writes JSON that is read back by the same allowlist parser the block
   * uses, so a field the parser ignores would vanish on the next save.
   */
  it('round-trips through parseApiBindings without losing a field', () => {
    const binding = workflowBindingFromSelection({
      key: 'qualify_lead',
      workflowId: 'wf-1',
      label: 'Qualify',
      inputFields: [
        { name: 'company', type: 'string' },
        { name: 'seats', type: 'number' },
      ],
      outputSample: '{"score": 91}',
      stream: true,
    })

    expect(parseApiBindings([binding])).toEqual([binding])
  })
})
