/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  parsePostgresConnection,
  populatePostgresBlocks,
} from '@/lib/workflows/default-user-workflows/postgres'

describe('parsePostgresConnection', () => {
  it('returns undefined when postgres config is omitted', () => {
    expect(parsePostgresConnection(undefined)).toBeUndefined()
  })

  it('parses a valid connection object', () => {
    const result = parsePostgresConnection({
      host: 'db.example.com',
      port: 5433,
      database: 'app',
      username: 'app_user',
      password: 'secret',
      ssl: 'required',
    })

    expect(result).toEqual({
      host: 'db.example.com',
      port: '5433',
      database: 'app',
      username: 'app_user',
      password: 'secret',
      ssl: 'required',
    })
  })

  it('defaults port and ssl when omitted', () => {
    const result = parsePostgresConnection({
      host: 'localhost',
      database: 'sim',
      username: 'postgres',
      password: 'pw',
    })

    expect(result).toMatchObject({ port: '5432', ssl: 'preferred' })
  })

  it('returns an error when required fields are missing', () => {
    expect(parsePostgresConnection({ host: 'localhost' })).toEqual({
      error: 'postgres.database is required.',
    })
  })
})

describe('populatePostgresBlocks', () => {
  it('updates every postgresql block in workflow state', () => {
    const workflowData = {
      blocks: {
        'block-1': { type: 'agent', subBlocks: {} },
        'block-2': {
          type: 'postgresql',
          subBlocks: {
            host: { id: 'host', type: 'short-input', value: 'old-host' },
          },
        },
        'block-3': {
          type: 'postgresql',
          subBlocks: {},
        },
      },
    }

    const count = populatePostgresBlocks(workflowData, {
      host: 'new-host',
      port: '5432',
      database: 'prod',
      username: 'user',
      password: 'pass',
      ssl: 'preferred',
    })

    expect(count).toBe(2)
    expect(workflowData.blocks['block-2'].subBlocks.host).toMatchObject({ value: 'new-host' })
    expect(workflowData.blocks['block-2'].subBlocks.password).toMatchObject({ value: 'pass' })
    expect(workflowData.blocks['block-3'].subBlocks.database).toMatchObject({ value: 'prod' })
  })
})
