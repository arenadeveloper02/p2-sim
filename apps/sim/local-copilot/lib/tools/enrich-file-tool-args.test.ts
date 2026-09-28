/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { enrichCreateFileArgs } from '@/local-copilot/lib/tools/enrich-file-tool-args'
import { firstFileBodyString } from '@/local-copilot/lib/tools/file-body-args'

describe('Claude-facing create_file content enrichment', () => {
  it('stringifies native object content', () => {
    const args: Record<string, unknown> = {
      fileName: 'files/Product_and_Architecture/Technical_Architecture/samples.json',
      content: { samples: [{ id: 'a' }] },
    }
    enrichCreateFileArgs(args)
    expect(args.content).toBe(JSON.stringify({ samples: [{ id: 'a' }] }, null, 2))
  })

  it('lifts object bodies from common aliases', () => {
    expect(firstFileBodyString({ body: { hello: 'world' } })).toBe(
      JSON.stringify({ hello: 'world' }, null, 2)
    )
  })
})
