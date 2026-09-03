/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  inputSchemaFromWorkflowFields,
  outputSchemaFromWorkflowFields,
  workflowBindingFromSelection,
} from '@/lib/arena-generative-ui/from-workflow'
import { bindingWithInputOverrides } from '@/lib/arena-generative-ui/input-schema'
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

  it('marks actor-specific start inputs as visitorEmail and keeps email as form', () => {
    expect(
      inputSchemaFromWorkflowFields([
        { name: 'type', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'userEmail', type: 'string' },
        { name: 'actor', type: 'string', description: "Logged-in user's email" },
      ])
    ).toEqual([
      { name: 'type', type: 'string' },
      { name: 'email', type: 'string' },
      { name: 'userEmail', type: 'string', source: 'visitorEmail' },
      {
        name: 'actor',
        type: 'string',
        description: "Logged-in user's email",
      },
    ])
  })

  it('records reserved Start fields as chatProtocol and keeps declared form fields', () => {
    const binding = workflowBindingFromSelection({
      key: 'recommend',
      workflowId: 'wf-1',
      inputFields: [
        { name: 'input', type: 'string' },
        { name: 'conversationId', type: 'string' },
        { name: 'files', type: 'file[]' },
        { name: 'companyName', type: 'string' },
        { name: 'brand', type: 'string' },
      ],
    })
    expect(binding.inputSchema).toEqual([
      { name: 'companyName', type: 'string' },
      { name: 'brand', type: 'string' },
    ])
    expect(binding.chatProtocol).toEqual({
      input: true,
      conversationId: true,
      files: true,
    })
  })

  it('omits reserved Start fields and drops other protocol fields', () => {
    expect(
      inputSchemaFromWorkflowFields([
        { name: 'input', type: 'string' },
        { name: 'conversationId', type: 'string' },
        { name: 'files', type: 'file[]' },
        { name: 'stream', type: 'boolean' },
        { name: 'includeThinking', type: 'boolean' },
        { name: 'attachments', type: 'file[]' },
        { name: 'keyword', type: 'string' },
        { name: 'Files', type: 'array' },
      ])
    ).toEqual([{ name: 'keyword', type: 'string' }])
  })

  it('omits inputSchema for a reserved-only Start and still sets chatProtocol', () => {
    const binding = workflowBindingFromSelection({
      key: 'chat',
      workflowId: 'wf-1',
      inputFields: [
        { name: 'input', type: 'string' },
        { name: 'conversationId', type: 'string' },
        { name: 'files', type: 'file[]' },
      ],
    })
    expect(binding.inputSchema).toBeUndefined()
    expect(binding.chatProtocol).toEqual({
      input: true,
      conversationId: true,
      files: true,
    })
  })

  it('stores a typed input prefix on an otherwise reserved-only Start', () => {
    const built = workflowBindingFromSelection({
      key: 'chat',
      workflowId: 'wf-1',
      inputFields: [
        { name: 'input', type: 'string' },
        { name: 'conversationId', type: 'string' },
        { name: 'files', type: 'file[]' },
      ],
    })
    expect(
      bindingWithInputOverrides(built, {
        input: { source: 'constant', value: 'Do research on ' },
      }).inputSchema
    ).toEqual([{ name: 'input', type: 'string', source: 'constant', value: 'Do research on' }])
    expect(bindingWithInputOverrides(built, {}).inputSchema).toBeUndefined()
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

  it('derives outputSchema from declared Response/Agent fields without a sample', () => {
    const binding = workflowBindingFromSelection({
      key: 'run',
      workflowId: 'wf-1',
      outputFields: [
        { name: 'articles', type: 'array' },
        { name: 'count', type: 'number' },
      ],
    })

    expect(binding.outputSchema).toEqual([
      { name: 'articles', type: 'array' },
      { name: 'count', type: 'number' },
    ])
    expect(binding.outputSchemaSource).toBeUndefined()
  })

  it('keeps last-run warnings unless a sample overrides the schema', () => {
    const warnings = ['Schema is from a run of an older deployment.']
    const fromRun = workflowBindingFromSelection({
      key: 'run',
      workflowId: 'wf-1',
      outputFields: [{ name: 'run_data.history', type: 'array' }],
      outputSchemaWarnings: warnings,
    })
    const fromSample = workflowBindingFromSelection({
      key: 'run',
      workflowId: 'wf-1',
      outputFields: [{ name: 'run_data.history', type: 'array' }],
      outputSchemaWarnings: warnings,
      outputSample: '{"score": 91}',
    })

    expect(fromRun.outputSchemaWarnings).toEqual(warnings)
    expect(fromSample.outputSchemaWarnings).toBeUndefined()
    expect(fromSample.outputSchemaSource).toBe('sample')
    expect(fromSample.outputSample).toBe('{"score": 91}')
  })

  it('lets a pasted sample override the declared output fields', () => {
    const binding = workflowBindingFromSelection({
      key: 'run',
      workflowId: 'wf-1',
      outputFields: [{ name: 'articles', type: 'array' }],
      outputSample: '{"score": 91}',
    })

    expect(binding.outputSchema?.map((field) => field.name)).toEqual(['score'])
    expect(binding.outputSchemaSource).toBe('sample')
    expect(binding.outputSample).toBe('{"score": 91}')
  })

  it('omits outputSchema when nothing is declared and no sample is pasted', () => {
    expect(
      workflowBindingFromSelection({ key: 'run', workflowId: 'wf-1', outputFields: [] })
        .outputSchema
    ).toBeUndefined()
    expect(outputSchemaFromWorkflowFields(undefined)).toBeUndefined()
  })

  it('drops nameless declared output fields', () => {
    expect(
      outputSchemaFromWorkflowFields([
        { type: 'object' } as { name: string; type: string },
        { name: undefined as unknown as string, type: 'string' },
        { name: 'score', type: 'number' },
      ])
    ).toEqual([{ name: 'score', type: 'number' }])
  })

  it('drops execution telemetry from declared output fields', () => {
    expect(
      outputSchemaFromWorkflowFields([
        { name: 'articles', type: 'array' },
        { name: 'tokens', type: 'object' },
        { name: 'tokens.input', type: 'number' },
        { name: 'cost.total', type: 'number' },
        { name: 'providerTiming', type: 'object' },
        { name: 'timeSegments', type: 'array' },
      ])
    ).toEqual([{ name: 'articles', type: 'array' }])
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
    expect(binding.outputSchemaSource).toBe('sample')
    expect(binding.outputSample).toBe('{"score": 91, "reasons": ["fit"]}')
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
    expect(binding.outputSample).toBe('# Company analysis')
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
        { name: 'input', type: 'string' },
        { name: 'company', type: 'string' },
        { name: 'seats', type: 'number' },
        { name: 'email', type: 'string' },
      ],
      outputFields: [{ name: 'articles', type: 'array' }],
      outputSample: '{"score": 91}',
      stream: true,
    })

    expect(parseApiBindings([binding])).toEqual([binding])
  })
})
