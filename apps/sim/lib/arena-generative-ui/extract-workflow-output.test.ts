/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { extractOutputSchemaFromBlocks } from '@/lib/arena-generative-ui/extract-workflow-output'

describe('extractOutputSchemaFromBlocks', () => {
  it('returns nothing when there are no blocks', () => {
    expect(extractOutputSchemaFromBlocks(null)).toEqual([])
    expect(extractOutputSchemaFromBlocks(undefined)).toEqual([])
    expect(extractOutputSchemaFromBlocks({})).toEqual([])
  })

  it('reads structured fields from a Response block', () => {
    expect(
      extractOutputSchemaFromBlocks({
        start: { type: 'start_trigger', subBlocks: {} },
        respond: {
          type: 'response',
          subBlocks: {
            builderData: {
              value: [
                { name: 'articles', type: 'array', value: [] },
                { name: 'count', type: 'number', value: '0' },
              ],
            },
          },
        },
      })
    ).toEqual([
      { name: 'articles', type: 'array' },
      { name: 'count', type: 'number' },
    ])
  })

  it('walks nested Response builder objects and array items', () => {
    expect(
      extractOutputSchemaFromBlocks({
        respond: {
          type: 'response',
          subBlocks: {
            builderData: {
              value: [
                {
                  name: 'articles',
                  type: 'array',
                  value: [
                    {
                      type: 'object',
                      value: [
                        { name: 'title', type: 'string', value: '' },
                        { name: 'score', type: 'number', value: '0' },
                      ],
                    },
                  ],
                },
                {
                  name: 'meta',
                  type: 'object',
                  value: [{ name: 'total', type: 'number', value: '0' }],
                },
              ],
            },
          },
        },
      })
    ).toEqual([
      { name: 'articles', type: 'array' },
      { name: 'articles[].title', type: 'string' },
      { name: 'articles[].score', type: 'number' },
      { name: 'meta', type: 'object' },
      { name: 'meta.total', type: 'number' },
    ])
  })

  it('parses Response JSON editor values that contain block references', () => {
    expect(
      extractOutputSchemaFromBlocks({
        respond: {
          type: 'response',
          subBlocks: {
            dataMode: { value: 'json' },
            builderData: {
              value: [{ name: 'stale', type: 'string', value: '' }],
            },
            data: {
              value: `{
  "name": "<block.function.output.name>",
  "age": <block.function.output.age>
}`,
            },
          },
        },
      })
    ).toEqual([
      { name: 'name', type: 'string' },
      { name: 'age', type: 'number' },
    ])
  })

  it('reads an Agent responseFormat JSON schema', () => {
    expect(
      extractOutputSchemaFromBlocks({
        agent: {
          type: 'agent',
          subBlocks: {
            responseFormat: {
              value: {
                schema: {
                  type: 'object',
                  properties: {
                    companies: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          industry: { type: 'string' },
                        },
                      },
                    },
                    count: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      })
    ).toEqual([
      { name: 'companies', type: 'array' },
      { name: 'companies[].name', type: 'string' },
      { name: 'companies[].industry', type: 'string' },
      { name: 'count', type: 'number' },
    ])
  })

  it('prefers a Response block over an Agent responseFormat', () => {
    expect(
      extractOutputSchemaFromBlocks({
        agent: {
          type: 'agent',
          subBlocks: {
            responseFormat: {
              value: { schema: { type: 'object', properties: { score: { type: 'number' } } } },
            },
          },
        },
        respond: {
          type: 'response',
          subBlocks: {
            builderData: {
              value: [{ name: 'articles', type: 'array', value: [] }],
            },
          },
        },
      })
    ).toEqual([{ name: 'articles', type: 'array' }])
  })

  it('falls through to Agent responseFormat when Response declares nothing', () => {
    expect(
      extractOutputSchemaFromBlocks({
        respond: { type: 'response', subBlocks: { builderData: { value: [] } } },
        agent: {
          type: 'agent',
          subBlocks: {
            responseFormat: {
              value: JSON.stringify({
                schema: { type: 'object', properties: { summary: { type: 'string' } } },
              }),
            },
          },
        },
      })
    ).toEqual([{ name: 'summary', type: 'string' }])
  })

  it('does not invent fields for a workflow with no declared output', () => {
    expect(
      extractOutputSchemaFromBlocks({
        start: { type: 'start_trigger', subBlocks: { inputFormat: { value: [{ name: 'q' }] } } },
        agent: { type: 'agent', subBlocks: {} },
      })
    ).toEqual([])
  })
})
