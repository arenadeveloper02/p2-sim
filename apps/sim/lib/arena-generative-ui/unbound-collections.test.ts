/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { unboundCollections } from '@/lib/arena-generative-ui/unbound-collections'

describe('unboundCollections', () => {
  it('returns object arrays the spec did not bind', () => {
    const found = unboundCollections(
      { elements: { table: { props: { statePath: 'orders' } } } },
      {
        orders: [{ id: '1' }],
        notes: [{ title: 'A' }],
        selected: { id: '1' },
        content: 'prose',
      }
    )
    expect(found).toEqual([{ key: 'notes', items: [{ title: 'A' }] }])
  })
})
