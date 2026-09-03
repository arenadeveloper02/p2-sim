/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  extractOutputSchemaFromBlocks,
  extractResponseOutputSchemaFromBlocks,
} from '@/lib/arena-generative-ui/extract-workflow-output'

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

  it('returns no Response fields when only Agent schema exists', () => {
    expect(
      extractResponseOutputSchemaFromBlocks({
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
    ).toEqual([])
  })

  it('does not invent fields for a workflow with no declared output', () => {
    expect(
      extractOutputSchemaFromBlocks({
        start: { type: 'start_trigger', subBlocks: { inputFormat: { value: [{ name: 'q' }] } } },
        agent: { type: 'agent', subBlocks: {} },
      })
    ).toEqual([])
  })

  it('walks a Builder object whose value is a nested JSON string', () => {
    const names = extractOutputSchemaFromBlocks({
      respond: {
        type: 'response',
        subBlocks: {
          builderData: {
            value: [
              {
                name: 'run_data',
                type: 'object',
                value: JSON.stringify({
                  history: [
                    {
                      id: 'h1',
                      email: 'ada@example.com',
                      input: { keyword: 'Dental Implants', client: 'Gentle Dental' },
                      output: '',
                      createdAt: '2026-08-24T06:28:56.717Z',
                    },
                  ],
                }),
              },
            ],
          },
        },
      },
    }).map((field) => field.name)

    expect(names).toEqual(
      expect.arrayContaining([
        'run_data',
        'run_data.history',
        'run_data.history[].id',
        'run_data.history[].input.keyword',
        'run_data.history[].createdAt',
      ])
    )
  })

  it('walks a Builder array whose value is a JSON string of objects', () => {
    expect(
      extractOutputSchemaFromBlocks({
        respond: {
          type: 'response',
          subBlocks: {
            builderData: {
              value: [
                {
                  name: 'history',
                  type: 'array',
                  value: JSON.stringify([{ keyword: 'Dental Implants', client: 'Gentle Dental' }]),
                },
              ],
            },
          },
        },
      })
    ).toEqual([
      { name: 'history', type: 'array' },
      { name: 'history[].keyword', type: 'string' },
      { name: 'history[].client', type: 'string' },
    ])
  })

  it('follows a Response JSON editor whole-object ref to Agent responseFormat', () => {
    const names = extractOutputSchemaFromBlocks({
      research: {
        type: 'agent',
        name: 'Agent',
        subBlocks: {
          responseFormat: {
            value: {
              schema: {
                type: 'object',
                properties: {
                  history: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        keyword: { type: 'string' },
                        client: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      respond: {
        type: 'response',
        subBlocks: {
          dataMode: { value: 'json' },
          data: { value: '{ "run_data": "<block.agent.response.content>" }' },
        },
      },
    }).map((field) => field.name)

    expect(names).toEqual(
      expect.arrayContaining(['run_data', 'run_data.history', 'run_data.history[].keyword'])
    )
  })

  it('fills a stub Response object from Agent responseFormat', () => {
    const names = extractOutputSchemaFromBlocks({
      agent: {
        type: 'agent',
        subBlocks: {
          responseFormat: {
            value: {
              schema: {
                type: 'object',
                properties: {
                  history: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      respond: {
        type: 'response',
        subBlocks: {
          builderData: {
            value: [{ name: 'run_data', type: 'object', value: '' }],
          },
        },
      },
    }).map((field) => field.name)

    expect(names).toEqual(['run_data', 'run_data.history', 'run_data.history[]'])
  })
})
