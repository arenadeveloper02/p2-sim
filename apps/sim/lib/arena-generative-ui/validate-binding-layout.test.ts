/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { BindingLayoutPlan } from '@/lib/arena-generative-ui/binding-layout-plan'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'
import { validateManifestBindingLayout } from '@/lib/arena-generative-ui/validate-binding-layout'

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

describe('validateManifestBindingLayout required host keys', () => {
  function weatherPlan(): BindingLayoutPlan {
    return {
      key: 'forecast',
      kind: 'collection',
      hostKeys: [
        'hourly',
        'daily',
        'latitude',
        'longitude',
        'generationtime_ms',
        'utc_offset_seconds',
        'elevation',
        'timezone',
      ],
      aliasKeys: [],
      formFields: [],
      hiddenInputFields: [],
      collections: [
        {
          hostKey: 'hourly',
          schemaPaths: ['hourly'],
          wrapperKeys: [],
          itemFields: ['time', 'temperature_2m'],
          numericItemFields: ['temperature_2m'],
          proseFields: [],
          samePageSelect: false,
        },
        {
          hostKey: 'daily',
          schemaPaths: ['daily'],
          wrapperKeys: [],
          itemFields: ['time', 'temperature_2m_min'],
          numericItemFields: ['temperature_2m_min'],
          proseFields: [],
          samePageSelect: false,
        },
      ],
      metricPaths: [
        'latitude',
        'longitude',
        'generationtime_ms',
        'utc_offset_seconds',
        'elevation',
      ],
      recordKeys: [],
      scalarPaths: [],
      prosePaths: [],
      stringFieldNames: ['timezone'],
      stream: false,
    }
  }

  function forecastManifest(bound: 'none' | 'collections'): ArenaGenerativeAppManifest {
    const collectionElements =
      bound === 'collections'
        ? {
            hourly: {
              type: 'Table',
              props: { columns: 'time,temperature_2m', statePath: 'hourly', emptyText: 'None' },
              children: [],
            },
            daily: {
              type: 'Chart',
              props: {
                chartType: 'line',
                statePath: 'daily',
                categoryField: 'time',
                series: 'temperature_2m_min',
              },
              children: [],
            },
          }
        : {}
    return {
      entryPath: 'home',
      pages: {
        home: {
          path: 'home',
          title: 'Forecast',
          spec: {
            root: 'page',
            elements: {
              page: {
                type: 'Page',
                props: { title: 'Forecast' },
                children: bound === 'collections' ? ['hourly', 'daily'] : ['title'],
              },
              title: { type: 'Heading', props: { text: 'Forecast', level: 'h1' }, children: [] },
              ...collectionElements,
            },
          },
          onLoad: ['load_forecast'],
        },
      },
      actions: {
        load_forecast: { apiKey: 'forecast' },
      },
    }
  }

  it('does not require every Open-Meteo metadata field once hourly and daily are bound', () => {
    expect(
      validateManifestBindingLayout(forecastManifest('collections'), [weatherPlan()])
    ).toBeUndefined()
  })

  it('still requires the forecast collections themselves', () => {
    expect(validateManifestBindingLayout(forecastManifest('none'), [weatherPlan()])).toContain(
      'hourly'
    )
  })
})

describe('validateManifestBindingLayout prose next to collections', () => {
  it('rejects KeyValue on a summary string when collections exist', () => {
    const plan: BindingLayoutPlan = {
      ...collectionPlan(['title']),
      stringFieldNames: ['summary'],
      prosePaths: ['summary'],
      hostKeys: ['items', 'summary'],
    }
    const manifest: ArenaGenerativeAppManifest = {
      entryPath: 'home',
      pages: {
        home: {
          path: 'home',
          title: 'Briefing',
          spec: {
            root: 'page',
            elements: {
              page: { type: 'Page', props: { title: 'Briefing' }, children: ['dump', 'list'] },
              dump: {
                type: 'KeyValue',
                props: { statePath: 'summary', emptyText: 'None' },
                children: [],
              },
              list: {
                type: 'Table',
                props: { columns: 'title', statePath: 'items', emptyText: 'None' },
                children: [],
              },
            },
          },
          onLoad: ['load'],
        },
      },
      actions: { load: { apiKey: 'load' } },
    }
    expect(validateManifestBindingLayout(manifest, [plan])).toContain('DataText')
  })

  it('requires DataText when a bound collection shares a summary host key', () => {
    const plan: BindingLayoutPlan = {
      ...collectionPlan(['title']),
      stringFieldNames: ['summary'],
      prosePaths: ['summary'],
      hostKeys: ['items', 'summary'],
    }
    const manifest: ArenaGenerativeAppManifest = {
      entryPath: 'home',
      pages: {
        home: {
          path: 'home',
          title: 'Briefing',
          spec: {
            root: 'page',
            elements: {
              page: { type: 'Page', props: { title: 'Briefing' }, children: ['list'] },
              list: {
                type: 'Table',
                props: { columns: 'title', statePath: 'items', emptyText: 'None' },
                children: [],
              },
            },
          },
          onLoad: ['load'],
        },
      },
      actions: { load: { apiKey: 'load' } },
    }
    expect(validateManifestBindingLayout(manifest, [plan])).toContain('DataText')
  })
})
