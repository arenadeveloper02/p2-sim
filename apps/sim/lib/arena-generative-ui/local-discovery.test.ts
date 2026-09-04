/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  collectKnownActionIds,
  collectLocalDiscoveryQuery,
  filterCollectionItems,
  filterCollectionItemsBySelection,
  filterStaticTableRows,
  filterStaticTableRowsBySelection,
  applySelectedRowDelete,
  applySelectedRowFields,
  collectionIdentitiesOverlap,
  dummyCollectionKeysFromManifest,
  dummyCollectionKeysFromSpec,
  dummyCollectionSeedFromSpec,
  ensureCollectionItemIds,
  fillMissingHostCollections,
  implicitDummyTableStatePath,
  stampSelectionForeignKeys,
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

describe('filterCollectionItemsBySelection', () => {
  const projects = [
    { id: 'p1', name: 'Alpha' },
    { id: 'p2', name: 'Beta' },
  ]
  const tasks = [
    { id: 't1', name: 'Ship', projectId: 'p1' },
    { id: 't2', name: 'Plan', projectId: 'p2' },
    { id: 't3', name: 'Review', projectId: 'p1' },
  ]

  it('leaves the source collection intact', () => {
    expect(filterCollectionItemsBySelection(projects, 'p1')).toEqual(projects)
  })

  it('narrows a sibling collection by foreign key', () => {
    expect(filterCollectionItemsBySelection(tasks, 'p1')).toEqual([
      { id: 't1', name: 'Ship', projectId: 'p1' },
      { id: 't3', name: 'Review', projectId: 'p1' },
    ])
  })

  it('leaves a collection without foreign keys intact', () => {
    const notes = [{ id: 'n1', body: 'Hello' }]
    expect(filterCollectionItemsBySelection(notes, 'p1')).toEqual(notes)
  })

  it('is a no-op without a selected id', () => {
    expect(filterCollectionItemsBySelection(tasks, '')).toEqual(tasks)
    expect(filterCollectionItemsBySelection(tasks, undefined)).toEqual(tasks)
  })

  it('keeps the parent filter when the selected row is a child', () => {
    expect(filterCollectionItemsBySelection(tasks, 't1')).toEqual([
      { id: 't1', name: 'Ship', projectId: 'p1' },
      { id: 't3', name: 'Review', projectId: 'p1' },
    ])
  })

  it('narrows dummy Table.rows by Project Id', () => {
    const headers = ['Id', 'Name', 'Project Id']
    const rows = [
      ['t1', 'Ship', 'p1'],
      ['t2', 'Plan', 'p2'],
      ['t3', 'Review', 'p1'],
    ]
    expect(filterStaticTableRowsBySelection(headers, rows, 'p1')).toEqual([
      ['t1', 'Ship', 'p1'],
      ['t3', 'Review', 'p1'],
    ])
  })

  it('matches a sibling collection to the selected row parent key', () => {
    const notes = [
      { id: 'n1', body: 'Alpha note', projectId: 'p1' },
      { id: 'n2', body: 'Beta note', projectId: 'p2' },
    ]
    expect(
      filterCollectionItemsBySelection(notes, 't1', { id: 't1', name: 'Ship', projectId: 'p1' })
    ).toEqual([{ id: 'n1', body: 'Alpha note', projectId: 'p1' }])
  })
})

describe('applySelectedRowDelete', () => {
  it('removes the selected collection item and clears selection', () => {
    const next: Record<string, unknown> = {
      todos: [
        { id: 'a', title: 'Milk' },
        { id: 'b', title: 'Bread' },
      ],
      selectedId: 'a',
      selected: { id: 'a', title: 'Milk' },
      content: 'Milk',
      deleted: true,
    }
    expect(applySelectedRowDelete(next, next, { deleted: true })).toBe(true)
    expect(next).toEqual({
      todos: [{ id: 'b', title: 'Bread' }],
    })
  })

  it('removes a Table.rows item keyed by Id', () => {
    const next: Record<string, unknown> = {
      tasks: [
        { Id: 't1', Name: 'Ship' },
        { Id: 't2', Name: 'Plan' },
      ],
    }
    expect(applySelectedRowDelete(next, next, { deleted: true, Id: 't1' })).toBe(true)
    expect(next.tasks).toEqual([{ Id: 't2', Name: 'Plan' }])
  })

  it('removes a Repeat row by patch id and keeps a selected parent', () => {
    const next: Record<string, unknown> = {
      projects: [{ id: 'p1', name: 'Alpha' }],
      tasks: [
        { id: 't1', name: 'Ship', projectId: 'p1' },
        { id: 't2', name: 'Plan', projectId: 'p2' },
      ],
      selectedId: 'p1',
      selected: { id: 'p1', name: 'Alpha' },
    }
    expect(applySelectedRowDelete(next, next, { deleted: true, id: 't1' })).toBe(true)
    expect(next.tasks).toEqual([{ id: 't2', name: 'Plan', projectId: 'p2' }])
    expect(next.selectedId).toBe('p1')
    expect(next.selected).toEqual({ id: 'p1', name: 'Alpha' })
  })

  it('is a no-op without the deleted sentinel', () => {
    const next: Record<string, unknown> = {
      todos: [{ id: 'a', title: 'Milk' }],
      selectedId: 'a',
    }
    expect(applySelectedRowDelete(next, next, { done: true })).toBe(false)
    expect(next.todos).toEqual([{ id: 'a', title: 'Milk' }])
    expect(next.selectedId).toBe('a')
  })
})

describe('applySelectedRowFields', () => {
  it('writes scalar patch fields onto selected and the matching collection item', () => {
    const next: Record<string, unknown> = {
      todos: [
        { id: 'a', title: 'Milk', done: false },
        { id: 'b', title: 'Bread', done: false },
      ],
      selectedId: 'a',
      selected: { id: 'a', title: 'Milk', done: false },
    }
    applySelectedRowFields(next, next, { done: true, title: 'Milk' })
    expect(next.selected).toEqual({ id: 'a', title: 'Milk', done: true })
    expect(next.todos).toEqual([
      { id: 'a', title: 'Milk', done: true },
      { id: 'b', title: 'Bread', done: false },
    ])
  })

  it('does not rewrite a collection the patch already replaced', () => {
    const current = {
      tasks: [{ id: 't1', name: 'Ship', done: false }],
      selectedId: 't1',
      selected: { id: 't1', name: 'Ship', done: false },
    }
    const next: Record<string, unknown> = {
      ...current,
      tasks: [{ id: 't1', name: 'Ship', done: false }, { id: 't2', name: 'Review' }],
    }
    applySelectedRowFields(next, current, {
      tasks: next.tasks,
      done: true,
    })
    expect(next.tasks).toEqual([
      { id: 't1', name: 'Ship', done: false },
      { id: 't2', name: 'Review' },
    ])
    expect(next.selected).toEqual({ id: 't1', name: 'Ship', done: false })
  })

  it('does not copy create form fields onto the selected parent', () => {
    const next: Record<string, unknown> = {
      projects: [{ id: 'p1', name: 'Alpha' }],
      tasks: [{ id: 't1', name: 'Ship', projectId: 'p1' }],
      selectedId: 'p1',
      selected: { id: 'p1', name: 'Alpha' },
    }
    applySelectedRowFields(next, next, {
      tasks: [{ id: 't3', name: 'Review' }],
      name: 'Review',
      creating: false,
    })
    expect(next.selected).toEqual({ id: 'p1', name: 'Alpha' })
    expect(next.projects).toEqual([{ id: 'p1', name: 'Alpha' }])
  })

  it('is a no-op without selectedId or a row id in the patch', () => {
    const next: Record<string, unknown> = {
      todos: [{ id: 'a', done: false }],
    }
    applySelectedRowFields(next, next, { done: true })
    expect(next.todos).toEqual([{ id: 'a', done: false }])
  })

  it('uses the Repeat row id from the patch when selectedId is a parent', () => {
    const next: Record<string, unknown> = {
      projects: [{ id: 'p1', name: 'Alpha' }],
      tasks: [
        { id: 't1', name: 'Ship', projectId: 'p1', done: false },
        { id: 't2', name: 'Plan', projectId: 'p2', done: false },
      ],
      selectedId: 'p1',
      selected: { id: 'p1', name: 'Alpha' },
    }
    applySelectedRowFields(next, next, { id: 't1', name: 'Ship', done: true, index: 0 })
    expect(next.selected).toEqual({ id: 'p1', name: 'Alpha' })
    expect(next.projects).toEqual([{ id: 'p1', name: 'Alpha' }])
    expect(next.tasks).toEqual([
      { id: 't1', name: 'Ship', projectId: 'p1', done: true },
      { id: 't2', name: 'Plan', projectId: 'p2', done: false },
    ])
  })

  it('matches Table.rows identity headers like Id', () => {
    const next: Record<string, unknown> = {
      tasks: [
        { Id: 't1', Name: 'Ship', done: false },
        { Id: 't2', Name: 'Plan', done: false },
      ],
    }
    applySelectedRowFields(next, next, { Id: 't1', Name: 'Ship', done: true })
    expect(next.tasks).toEqual([
      { Id: 't1', Name: 'Ship', done: true },
      { Id: 't2', Name: 'Plan', done: false },
    ])
  })

  it('updates the collection from a row id when nothing is selected', () => {
    const next: Record<string, unknown> = {
      todos: [{ id: 'a', title: 'Milk', done: false }],
    }
    applySelectedRowFields(next, next, { id: 'a', title: 'Milk', done: true })
    expect(next.todos).toEqual([{ id: 'a', title: 'Milk', done: true }])
  })

  it('does not copy create form fields onto the selected parent when there is no collection array', () => {
    const next: Record<string, unknown> = {
      projects: [{ id: 'p1', name: 'Alpha' }],
      tasks: [{ id: 't1', name: 'Ship', projectId: 'p1' }],
      selectedId: 'p1',
      selected: { id: 'p1', name: 'Alpha' },
    }
    applySelectedRowFields(next, next, { name: 'Review', creating: false })
    expect(next.selected).toEqual({ id: 'p1', name: 'Alpha' })
    expect(next.projects).toEqual([{ id: 'p1', name: 'Alpha' }])
    expect(next.tasks).toEqual([{ id: 't1', name: 'Ship', projectId: 'p1' }])
  })
})

describe('dummyCollectionSeedFromSpec', () => {
  it('lifts Table.rows onto a simple statePath', () => {
    expect(
      dummyCollectionSeedFromSpec({
        elements: {
          table: {
            type: 'Table',
            props: {
              statePath: 'tasks',
              columns: 'Id, Name, Project Id',
              rows: 't1 | Ship | p1\nt2 | Plan | p2',
            },
          },
        },
      })
    ).toEqual({
      tasks: [
        { Id: 't1', Name: 'Ship', 'Project Id': 'p1' },
        { Id: 't2', Name: 'Plan', 'Project Id': 'p2' },
      ],
    })
  })

  it('seeds a sole Table with rows and no statePath onto rows', () => {
    expect(
      dummyCollectionSeedFromSpec({
        elements: {
          table: {
            type: 'Table',
            props: { columns: 'Name', rows: 'Ada' },
          },
        },
      })
    ).toEqual({ rows: [{ Name: 'Ada' }] })
  })

  it('seeds the unpathed Table onto rows even when a Repeat already has a path', () => {
    expect(
      dummyCollectionSeedFromSpec({
        elements: {
          list: { type: 'Repeat', props: { statePath: 'projects' } },
          table: {
            type: 'Table',
            props: { columns: 'Name', rows: 'Ada' },
          },
        },
      })
    ).toEqual({ rows: [{ Name: 'Ada' }] })
  })
})

describe('implicitDummyTableStatePath', () => {
  it('binds the sole unpathed Table to rows', () => {
    const spec = {
      elements: {
        table: { type: 'Table', props: { columns: 'Name', rows: 'Ada' } },
      },
    }
    expect(implicitDummyTableStatePath(spec, 'table')).toBe('rows')
    expect(implicitDummyTableStatePath(spec, 'other')).toBe('')
  })

  it('still binds the unpathed Table when a Repeat already has a path', () => {
    expect(
      implicitDummyTableStatePath(
        {
          elements: {
            list: { type: 'Repeat', props: { statePath: 'projects' } },
            table: { type: 'Table', props: { columns: 'Name', rows: 'Ada' } },
          },
        },
        'table'
      )
    ).toBe('rows')
  })
})

describe('dummyCollectionKeysFromSpec', () => {
  it('includes Repeat paths and implicit Table seeds', () => {
    expect(
      dummyCollectionKeysFromSpec({
        elements: {
          list: { type: 'Repeat', props: { statePath: 'todos' } },
        },
      })
    ).toEqual(['todos'])
    expect(
      dummyCollectionKeysFromManifest({
        pages: {
          home: {
            spec: {
              elements: {
                table: { type: 'Table', props: { columns: 'Name', rows: 'Ada' } },
              },
            },
          },
        },
      })
    ).toEqual(['rows'])
  })
})

describe('collectionIdentitiesOverlap', () => {
  it('detects when incoming rows already exist', () => {
    expect(
      collectionIdentitiesOverlap([{ id: '1' }, { id: '2' }], [{ id: '2' }, { id: '3' }])
    ).toBe(true)
    expect(collectionIdentitiesOverlap([{ id: '1' }], [{ id: '3' }])).toBe(false)
  })
})

describe('fillMissingHostCollections', () => {
  it('fills only keys the host has not written', () => {
    expect(
      fillMissingHostCollections({ tasks: [{ id: 'kept' }] }, { tasks: [{ id: 'seed' }], notes: [] })
    ).toBeNull()
    expect(fillMissingHostCollections({}, { tasks: [{ id: 'seed' }] })).toEqual({
      tasks: [{ id: 'seed' }],
    })
  })
})

describe('ensureCollectionItemIds', () => {
  it('assigns id when the new row has none', () => {
    const [row] = ensureCollectionItemIds([{ name: 'Review' }]) as Array<Record<string, unknown>>
    expect(row.name).toBe('Review')
    expect(typeof row.id).toBe('string')
    expect(String(row.id).length).toBeGreaterThan(8)
  })

  it('reuses an Id header from Table.rows instead of adding id', () => {
    const [row] = ensureCollectionItemIds([
      { Id: 't1', Name: 'Ship' },
      { Name: 'Review' },
    ]) as Array<Record<string, unknown>>
    expect(row).toEqual({ Id: 't1', Name: 'Ship' })
    const created = ensureCollectionItemIds([
      { Id: 't1', Name: 'Ship' },
      { Name: 'Review' },
    ])[1] as Record<string, unknown>
    expect(created.Name).toBe('Review')
    expect(created.Id).toEqual(expect.any(String))
    expect(created.id).toBeUndefined()
  })
})

describe('stampSelectionForeignKeys', () => {
  const tasks = [
    { id: 't1', name: 'Ship', projectId: 'p1' },
    { id: 't2', name: 'Plan', projectId: 'p2' },
  ]

  it('stamps projectId onto a new child row', () => {
    expect(
      stampSelectionForeignKeys([{ id: 't3', name: 'Review' }], tasks, 'p1', {
        id: 'p1',
        name: 'Alpha',
      })
    ).toEqual([{ id: 't3', name: 'Review', projectId: 'p1' }])
  })

  it('leaves an existing foreign key intact', () => {
    expect(
      stampSelectionForeignKeys([{ id: 't3', name: 'Review', projectId: 'p2' }], tasks, 'p1')
    ).toEqual([{ id: 't3', name: 'Review', projectId: 'p2' }])
  })

  it('does not stamp the root project list', () => {
    const projects = [
      { id: 'p1', name: 'Alpha' },
      { id: 'p2', name: 'Beta' },
    ]
    expect(
      stampSelectionForeignKeys([{ id: 'p3', name: 'Gamma' }], projects, 'p1', {
        id: 'p1',
        name: 'Alpha',
      })
    ).toEqual([{ id: 'p3', name: 'Gamma' }])
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
