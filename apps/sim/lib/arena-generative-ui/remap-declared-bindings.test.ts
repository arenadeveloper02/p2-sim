/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { BindingLayoutPlan } from '@/lib/arena-generative-ui/binding-layout-plan'
import {
  remapBindingLayout,
  remapDeclaredApiKey,
  remapManifestApiKeys,
} from '@/lib/arena-generative-ui/remap-declared-bindings'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

function articlesPlan(): BindingLayoutPlan {
  return {
    key: 'qualify_lead',
    kind: 'collection',
    hostKeys: ['articles', 'score'],
    aliasKeys: [],
    formFields: ['company'],
    hiddenInputFields: [],
    collections: [
      {
        hostKey: 'articles',
        schemaPaths: ['data.articles'],
        wrapperKeys: ['data'],
        itemFields: ['title'],
        numericItemFields: [],
        proseFields: [],
        samePageSelect: false,
      },
    ],
    metricPaths: ['score'],
    recordKeys: [],
    scalarPaths: [],
    prosePaths: [],
    stringFieldNames: [],
    stream: false,
  }
}

function tableManifest(statePath: string): ArenaGenerativeAppManifest {
  return {
    entryPath: 'home',
    pages: {
      home: {
        title: 'Home',
        path: 'home',
        spec: {
          root: 'page',
          elements: {
            page: { type: 'Page', props: {}, children: ['table'] },
            table: {
              type: 'Table',
              props: { columns: 'title', rows: null, statePath, emptyText: null },
              children: [],
            },
          },
        },
      },
    },
    actions: {
      submit_lead: { apiKey: 'qualify_lead' },
    },
  }
}

describe('remapDeclaredApiKey', () => {
  it('returns the declared key when the candidate already matches', () => {
    expect(remapDeclaredApiKey('load_order', ['load_order'])).toBe('load_order')
  })

  it('remaps get_order onto the only declared binding', () => {
    expect(remapDeclaredApiKey('get_order', ['load_order'])).toBe('load_order')
  })

  it('returns undefined when two declared keys are equally far', () => {
    expect(remapDeclaredApiKey('invented_key', ['qualify_lead', 'score_lead'])).toBeUndefined()
  })
})

describe('remapManifestApiKeys', () => {
  it('rewires invented keys onto the only declared binding', () => {
    const actions = { submit_lead: { apiKey: 'invented_key' } }
    const adopted = remapManifestApiKeys(actions, ['qualify_lead'])
    expect(actions.submit_lead?.apiKey).toBe('qualify_lead')
    expect(adopted).toEqual([
      expect.objectContaining({
        code: 'product-map',
        asked: expect.stringContaining('invented_key'),
        adopted: expect.stringContaining('qualify_lead'),
      }),
    ])
  })

  it('leaves a tied invented key in place', () => {
    const actions = { submit_lead: { apiKey: 'invented_key' } }
    expect(remapManifestApiKeys(actions, ['qualify_lead', 'score_lead'])).toEqual([])
    expect(actions.submit_lead?.apiKey).toBe('invented_key')
  })
})

describe('remapBindingLayout', () => {
  it('strips envelope prefixes when the remainder is a host key', () => {
    const manifest = tableManifest('output.articles')
    const adopted = remapBindingLayout(manifest, [articlesPlan()])
    expect(
      (manifest.pages.home?.spec.elements as Record<string, { props?: { statePath?: string } }>)
        .table?.props?.statePath
    ).toBe('articles')
    expect(adopted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'product-map',
          asked: expect.stringContaining('output.articles'),
          adopted: expect.stringContaining('articles'),
        }),
      ])
    )
  })

  it('lifts a collection wrapper onto the collection hostKey', () => {
    const manifest = tableManifest('data')
    remapBindingLayout(manifest, [articlesPlan()])
    expect(
      (manifest.pages.home?.spec.elements as Record<string, { props?: { statePath?: string } }>)
        .table?.props?.statePath
    ).toBe('articles')
  })

  it('renames a misspelled form field onto the declared inputSchema name', () => {
    const manifest: ArenaGenerativeAppManifest = {
      entryPath: 'home',
      pages: {
        home: {
          title: 'Home',
          path: 'home',
          spec: {
            root: 'page',
            elements: {
              page: { type: 'Page', props: {}, children: ['form'] },
              form: { type: 'Form', props: { actionId: 'submit_lead' }, children: ['company'] },
              company: {
                type: 'TextInput',
                props: { name: 'compny', label: 'Company', required: true, placeholder: '' },
                children: [],
              },
            },
          },
        },
      },
      actions: {
        submit_lead: { apiKey: 'qualify_lead' },
      },
    }
    const adopted = remapBindingLayout(manifest, [articlesPlan()])
    expect(
      (manifest.pages.home?.spec.elements as Record<string, { props?: { name?: string } }>).company
        ?.props?.name
    ).toBe('company')
    expect(adopted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'product-map',
          asked: expect.stringContaining('compny'),
          adopted: expect.stringContaining('company'),
        }),
      ])
    )
  })

  it('does not guess an extra form field onto the only schema name', () => {
    const manifest: ArenaGenerativeAppManifest = {
      entryPath: 'home',
      pages: {
        home: {
          title: 'Home',
          path: 'home',
          spec: {
            root: 'page',
            elements: {
              page: { type: 'Page', props: {}, children: ['form'] },
              form: {
                type: 'Form',
                props: { actionId: 'submit_lead' },
                children: ['company', 'notes'],
              },
              company: {
                type: 'TextInput',
                props: { name: 'company', label: 'Company', required: true, placeholder: '' },
                children: [],
              },
              notes: {
                type: 'TextInput',
                props: { name: 'notes', label: 'Notes', required: false, placeholder: '' },
                children: [],
              },
            },
          },
        },
      },
      actions: {
        submit_lead: { apiKey: 'qualify_lead' },
      },
    }
    remapBindingLayout(manifest, [articlesPlan()])
    expect(
      (manifest.pages.home?.spec.elements as Record<string, { props?: { name?: string } }>).notes
        ?.props?.name
    ).toBe('notes')
  })
})
