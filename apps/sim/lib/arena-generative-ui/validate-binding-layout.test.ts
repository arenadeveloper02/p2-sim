/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { BindingLayoutPlan } from '@/lib/arena-generative-ui/binding-layout-plan'
import { validateManifestBindingLayout } from '@/lib/arena-generative-ui/validate-binding-layout'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

function collectionPlan(itemFields: string[], proseFields: string[] = []): BindingLayoutPlan {
  return {
    key: 'load',
    kind: 'collection',
    hostKeys: ['items'],
    aliasKeys: [],
    formFields: [],
    hiddenInputFields: [],
    collections: [
      {
        hostKey: 'items',
        schemaPaths: ['items'],
        wrapperKeys: [],
        itemFields,
        numericItemFields: itemFields.filter((field) => field === 'amount'),
        proseFields,
        samePageSelect: false,
      },
    ],
    metricPaths: [],
    recordKeys: [],
    scalarPaths: [],
    prosePaths: [],
    stringFieldNames: [],
    stream: false,
  }
}

function tableManifest(columns: string): ArenaGenerativeAppManifest {
  return {
    entryPath: 'home',
    pages: {
      home: {
        path: 'home',
        title: 'Items',
        spec: {
          root: 'page',
          elements: {
            page: { type: 'Page', props: { title: 'Items' }, children: ['table'] },
            table: {
              type: 'Table',
              props: { columns, statePath: 'items', emptyText: 'None' },
              children: [],
            },
          },
        },
      },
    },
    actions: {},
  }
}

describe('validateManifestBindingLayout table columns', () => {
  it('allows # and amount|sum when those tokens are closed host reshape', () => {
    expect(
      validateManifestBindingLayout(tableManifest('#,amount|sum,date|relative'), [
        collectionPlan(['amount', 'date']),
      ])
    ).toBeUndefined()
  })

  it('rejects invented API fields such as sentiment', () => {
    expect(
      validateManifestBindingLayout(tableManifest('title,sentiment'), [
        collectionPlan(['title', 'amount']),
      ])
    ).toContain('sentiment')
  })

  it('still rejects prose fields as Table columns', () => {
    expect(
      validateManifestBindingLayout(tableManifest('title,body'), [
        collectionPlan(['title', 'body'], ['body']),
      ])
    ).toContain('prose')
  })
})
