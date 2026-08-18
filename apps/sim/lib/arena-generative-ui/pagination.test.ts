/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  applyPaginationToInput,
  clampPaginationLimit,
  collectAppendKeys,
  paginationActionValues,
  paginationStateFromData,
} from '@/lib/arena-generative-ui/pagination'
import type { ArenaGenerativePagination } from '@/lib/arena-generative-ui/types'

const cursor: ArenaGenerativePagination = {
  mode: 'cursor',
  items: 'articles',
}

const offset: ArenaGenerativePagination = {
  mode: 'offset',
  items: 'articles',
  limit: 20,
}

describe('clampPaginationLimit', () => {
  it('defaults and clamps to 1–100', () => {
    expect(clampPaginationLimit(undefined)).toBe(20)
    expect(clampPaginationLimit(0)).toBe(1)
    expect(clampPaginationLimit(250)).toBe(100)
    expect(clampPaginationLimit('12')).toBe(12)
  })
})

describe('applyPaginationToInput', () => {
  it('injects the default limit and drops an empty cursor', () => {
    expect(applyPaginationToInput(cursor, {})).toEqual({ limit: 20 })
  })

  it('copies nextCursor onto the request cursor param', () => {
    expect(applyPaginationToInput(cursor, { nextCursor: 'abc' })).toEqual({
      limit: 20,
      cursor: 'abc',
    })
  })

  it('normalizes offset and injects limit', () => {
    expect(applyPaginationToInput(offset, { offset: '40' })).toEqual({ limit: 20, offset: 40 })
    expect(applyPaginationToInput(offset, {})).toEqual({ limit: 20, offset: 0 })
  })
})

describe('paginationStateFromData', () => {
  it('sets hasMore from a next cursor and writes nextCursor for Load more', () => {
    expect(
      paginationStateFromData(
        cursor,
        { articles: [{ id: '1' }], nextCursor: 'page-2' },
        { limit: 20 }
      )
    ).toEqual({ hasMore: true, nextCursor: 'page-2' })
  })

  it('advances offset by the page length when more results remain', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({ id: index }))
    expect(paginationStateFromData(offset, { articles: items }, { limit: 20, offset: 0 })).toEqual({
      hasMore: true,
      offset: 20,
    })
  })
})

describe('collectAppendKeys', () => {
  it('appends items only on page 2+', () => {
    expect(collectAppendKeys(cursor, { limit: 20 })).toEqual([])
    expect(collectAppendKeys(cursor, { cursor: 'abc', limit: 20 })).toEqual(['articles'])
    expect(collectAppendKeys(offset, { offset: 20, limit: 20 })).toEqual(['articles'])
  })

  it('unions explicit action.append keys', () => {
    expect(collectAppendKeys(undefined, {}, ['articles', 'articles'])).toEqual(['articles'])
  })
})

describe('paginationActionValues', () => {
  it('copies only pagination keys from host state', () => {
    expect(
      paginationActionValues({
        articles: [{ id: '1' }],
        nextCursor: 'abc',
        hasMore: true,
        limit: 20,
      })
    ).toEqual({ nextCursor: 'abc', limit: 20 })
  })
})
