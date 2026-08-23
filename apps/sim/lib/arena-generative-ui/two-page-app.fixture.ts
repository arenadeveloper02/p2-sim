import type { Spec } from '@json-render/core'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeAppManifest,
} from '@/lib/arena-generative-ui/types'

export const twoPageHomeSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Lead qualifier', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { padding: null, backgroundColor: null, maxWidth: null },
      children: ['heading', 'nav', 'form'],
    },
    heading: {
      type: 'Heading',
      props: { text: 'Qualify a lead', level: 'h1', color: null },
      children: [],
    },
    nav: {
      type: 'NavLink',
      props: { label: 'Results', to: 'results' },
      children: [],
    },
    form: {
      type: 'Form',
      props: { actionId: 'submit_lead' },
      children: ['name', 'submit'],
    },
    name: {
      type: 'TextInput',
      props: { name: 'name', label: 'Name', required: true, placeholder: 'Ada' },
      children: [],
    },
    submit: {
      type: 'SubmitButton',
      props: { label: 'Submit', actionId: null },
      children: [],
    },
  },
}

export const twoPageResultsSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Results', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { padding: null, backgroundColor: null, maxWidth: null },
      children: ['heading', 'name_chip', 'score', 'back'],
    },
    heading: {
      type: 'Heading',
      props: { text: 'Score', level: 'h2', color: null },
      children: [],
    },
    name_chip: {
      type: 'Chip',
      props: {
        text: 'Name: {name}',
        tone: 'muted',
        actionId: null,
        navigateTo: null,
        setValue: null,
      },
      children: [],
    },
    score: {
      type: 'DataText',
      props: { statePath: 'score', fallback: '—', color: null, size: null },
      children: [],
    },
    back: {
      type: 'Button',
      props: {
        label: 'Back',
        href: null,
        navigateTo: 'home',
        actionId: null,
        backgroundColor: null,
        color: null,
      },
      children: [],
    },
  },
}

export const twoPageApiBindings: ArenaGenerativeApiBinding[] = [
  {
    key: 'qualify_lead',
    label: 'Qualify',
    kind: 'workflow',
    workflowId: 'wf-bound',
  },
]

export const twoPageManifest: ArenaGenerativeAppManifest = {
  entryPath: 'home',
  pages: {
    home: { title: 'Form', path: 'home', spec: twoPageHomeSpec },
    results: { title: 'Score', path: 'results', spec: twoPageResultsSpec },
  },
  actions: {
    submit_lead: {
      apiKey: 'qualify_lead',
      inputMapping: { name: 'name' },
      onSuccess: { navigate: 'results' },
    },
  },
}

export const twoPageDraft = {
  id: 'draft-1',
  title: 'Lead qualifier',
  entryPath: 'home',
  revision: 1,
  workflowId: 'wf-1',
  latestRevisionId: 'rev-1',
  pages: [
    { path: 'home', title: 'Form' },
    { path: 'results', title: 'Score' },
  ],
  apiBindings: twoPageApiBindings,
  manifest: twoPageManifest,
}
