import type { Spec } from '@json-render/core'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeAppManifest,
} from '@/lib/arena-generative-ui/types'

const TABS = 'Home|home\nResults|results\nDashboard|dashboard\nSettings|settings'

type SpecElement = Spec['elements'][string]

function pageSpec(title: string, body: SpecElement): Spec {
  return {
    root: 'page',
    elements: {
      page: {
        type: 'Page',
        props: { title, backgroundColor: null },
        children: ['tabs', 'section'],
      },
      tabs: {
        type: 'Tabs',
        props: { items: TABS, activePath: null },
        children: [],
      },
      section: {
        type: 'Section',
        props: { padding: null, backgroundColor: null, maxWidth: null },
        children: ['body'],
      },
      body,
    },
  }
}

export const multiPageHomeSpec = pageSpec('Leads', {
  type: 'Heading',
  props: { text: 'Qualify a lead', level: 'h1', color: null },
  children: [],
})

export const multiPageResultsSpec = pageSpec('Score', {
  type: 'DataText',
  props: { statePath: 'score', fallback: '—', color: null, size: null },
  children: [],
})

export const multiPageDashboardSpec = pageSpec('Operations', {
  type: 'Table',
  props: { columns: 'name, score', rows: null, statePath: 'leads', emptyText: null },
  children: [],
})

export const multiPageSettingsSpec = pageSpec('Settings', {
  type: 'KeyValue',
  props: { items: 'Region: EU', statePath: null, emptyText: null },
  children: [],
})

export const multiPageApiBindings: ArenaGenerativeApiBinding[] = [
  { key: 'qualify_lead', label: 'Qualify', kind: 'workflow', workflowId: 'wf-bound' },
  { key: 'load_leads', label: 'Leads', kind: 'workflow', workflowId: 'wf-leads' },
]

/**
 * Four reachable pages, above `MIN_PAGES_FOR_SCOPED_EDIT`, so scoped-edit paths
 * can be exercised. Every page carries the same `Tabs`, which is what makes the
 * whole set reachable from `entryPath`.
 */
export const multiPageManifest: ArenaGenerativeAppManifest = {
  entryPath: 'home',
  pages: {
    home: { title: 'Leads', path: 'home', spec: multiPageHomeSpec },
    results: { title: 'Score', path: 'results', spec: multiPageResultsSpec },
    dashboard: {
      title: 'Operations',
      path: 'dashboard',
      spec: multiPageDashboardSpec,
      onLoad: ['load_dashboard'],
    },
    settings: { title: 'Settings', path: 'settings', spec: multiPageSettingsSpec },
  },
  actions: {
    submit_lead: {
      apiKey: 'qualify_lead',
      inputMapping: { name: 'name' },
      onSuccess: { navigate: 'results' },
    },
    load_dashboard: { apiKey: 'load_leads' },
  },
}
