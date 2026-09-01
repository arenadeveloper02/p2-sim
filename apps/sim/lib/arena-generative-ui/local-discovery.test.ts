/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  collectKnownActionIds,
  collectLocalDiscoveryQuery,
  filterCollectionItems,
  filterStaticTableRows,
  isLocalDiscoveryPassthrough,
  itemMatchesLocalDiscovery,
  LOCAL_COLLECTION_PAGE_SIZE,
  paginateCollection,
} from '@/lib/arena-generative-ui/local-discovery'

const headers = ['TASK', 'CATEGORY', 'PRIORITY', 'STATUS']

const rows = [
  ['Prepare Q3 budget report', 'Work', 'High', 'Active'],
  ['Review pull requests', 'Work', 'Medium', 'Active'],
  ['Schedule team standup', 'Work', 'Low', 'Completed'],
]

const elements = {
  page: { type: 'Page', children: ['search', 'filters', 'table'] },
  search: { type: 'SearchField', props: { name: 'query', placeholder: 'Search tasks...' } },
  filters: { type: 'Filter', children: ['status', 'category'] },
  status: {
    type: 'Select',
    props: { name: 'status', label: 'Status', options: 'All,Active,Completed' },
  },
  category: {
    type: 'Select',
    props: { name: 'category', label: 'Category', options: 'All Categories,Work,Personal' },
  },
  table: { type: 'Table', props: { columns: 'TASK, CATEGORY, PRIORITY, STATUS' } },
}

describe('isLocalDiscoveryPassthrough', () => {
  it('treats empty and All-style options as unconstrained', () => {
    expect(isLocalDiscoveryPassthrough('')).toBe(true)
    expect(isLocalDiscoveryPassthrough('All')).toBe(true)
    expect(isLocalDiscoveryPassthrough('All Categories')).toBe(true)
    expect(isLocalDiscoveryPassthrough('All Priorities')).toBe(true)
    expect(isLocalDiscoveryPassthrough('Select')).toBe(true)
    expect(isLocalDiscoveryPassthrough('Active')).toBe(false)
    expect(isLocalDiscoveryPassthrough(['Work'])).toBe(false)
  })
})

describe('collectLocalDiscoveryQuery', () => {
  it('reads SearchField and Filter Selects that have no known action', () => {
    const query = collectLocalDiscoveryQuery({
      formValues: { query: 'budget', status: 'Active', category: 'All Categories' },
      elements,
    })
    expect(query.search).toBe('budget')
    expect(query.filters).toEqual({ status: 'Active' })
  })

  it('skips a SearchField whose actionId the host can run', () => {
    const query = collectLocalDiscoveryQuery({
      formValues: { query: 'budget', status: 'Active' },
      elements: {
        ...elements,
        search: {
          type: 'SearchField',
          props: { name: 'query', actionId: 'search_tasks' },
        },
      },
      knownActionIds: new Set(['search_tasks']),
    })
    expect(query.search).toBe('')
    expect(query.filters).toEqual({ status: 'Active' })
  })

  it('treats a Filter TextInput named query as extra search text', () => {
    const query = collectLocalDiscoveryQuery({
      formValues: { q: 'standup' },
      elements: {
        filters: { type: 'Filter', children: ['q'] },
        q: { type: 'TextInput', props: { name: 'q' } },
      },
    })
    expect(query.search).toBe('standup')
    expect(query.filters).toEqual({})
  })
})

describe('itemMatchesLocalDiscovery', () => {
  it('matches search across fields and equality filters on column names', () => {
    const task = { task: 'Prepare Q3 budget report', category: 'Work', status: 'Active' }
    expect(
      itemMatchesLocalDiscovery(task, { search: 'budget', filters: { status: 'Active' } })
    ).toBe(true)
    expect(itemMatchesLocalDiscovery(task, { search: 'standup', filters: {} })).toBe(false)
    expect(itemMatchesLocalDiscovery(task, { search: '', filters: { status: 'Completed' } })).toBe(
      false
    )
  })

  it('aligns filter names to headers with different case and spacing', () => {
    expect(
      itemMatchesLocalDiscovery({ STATUS: 'Active' }, { search: '', filters: { status: 'Active' } })
    ).toBe(true)
  })

  it('ignores a filter whose key is not on the item', () => {
    expect(
      itemMatchesLocalDiscovery({ name: 'Ada' }, { search: '', filters: { status: 'Active' } })
    ).toBe(true)
  })
})

describe('filterStaticTableRows / filterCollectionItems', () => {
  it('narrows dummy table rows by search and status', () => {
    const filtered = filterStaticTableRows(headers, rows, {
      search: 'pull',
      filters: { STATUS: 'Active' },
    })
    expect(filtered).toEqual([['Review pull requests', 'Work', 'Medium', 'Active']])
  })

  it('returns the original rows when the query is empty', () => {
    expect(filterStaticTableRows(headers, rows, { search: '', filters: {} })).toEqual(rows)
  })

  it('filters a bound collection the same way', () => {
    const items = [
      { title: 'First', status: 'Active' },
      { title: 'Second', status: 'Completed' },
    ]
    expect(filterCollectionItems(items, { search: '', filters: { status: 'Completed' } })).toEqual([
      { title: 'Second', status: 'Completed' },
    ])
  })
})

describe('paginateCollection', () => {
  const items = Array.from({ length: 25 }, (_, index) => index + 1)

  it('returns the first page and clamps out-of-range pages', () => {
    expect(paginateCollection(items, 1)).toEqual({
      items: items.slice(0, LOCAL_COLLECTION_PAGE_SIZE),
      page: 1,
      pageCount: 2,
      total: 25,
      from: 1,
      to: 20,
    })
    expect(paginateCollection(items, 2).items).toEqual([21, 22, 23, 24, 25])
    expect(paginateCollection(items, 2).from).toBe(21)
    expect(paginateCollection(items, 2).to).toBe(25)
    expect(paginateCollection(items, 99).page).toBe(2)
    expect(paginateCollection(items, 0).page).toBe(1)
  })

  it('returns an empty page for an empty list', () => {
    expect(paginateCollection([], 1)).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      total: 0,
      from: 0,
      to: 0,
    })
  })

  it('honors an explicit page size', () => {
    expect(paginateCollection(items, 3, 10).items).toEqual([21, 22, 23, 24, 25])
    expect(paginateCollection(items, 3, 10).pageCount).toBe(3)
  })
})

describe('collectKnownActionIds', () => {
  it('unions keys from host action maps', () => {
    expect(collectKnownActionIds({ search_tasks: [] }, { load_tasks: true })).toEqual(
      new Set(['search_tasks', 'load_tasks'])
    )
  })
})
