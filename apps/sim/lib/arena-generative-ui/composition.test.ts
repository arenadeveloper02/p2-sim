/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  applyCompositionToManifest,
  applyIaPreset,
  compositionSitemapIssues,
  inferCompositionFromBrief,
  isLaunchableGenerativeDraft,
  isPlannedOnlyManifest,
  parseArenaGenerativeComposition,
  parseStoredPlanStatus,
  patchComposition,
  plannedPlaceholderManifest,
  withStoredPlanStatus,
} from '@/lib/arena-generative-ui/composition'
import { twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'

describe('parseArenaGenerativeComposition', () => {
  it('parses closed enums and snake_case aliases', () => {
    expect(
      parseArenaGenerativeComposition({
        after_submit: 'replace',
        navigate_when: 'success',
        inspect: 'none',
        history: 'peer-tab',
        mutations: 'local',
      })
    ).toEqual({
      afterSubmit: 'replace',
      navigateWhen: 'success',
      inspect: 'none',
      history: 'peer-tab',
      mutations: 'local',
    })
  })
})

describe('inferCompositionFromBrief', () => {
  it('infers replace when a task and results page both exist', () => {
    expect(
      inferCompositionFromBrief({
        archetype: 'task',
        pages: [
          { path: 'home', archetype: 'task' },
          { path: 'results', archetype: 'results' },
        ],
      })
    ).toMatchObject({ afterSubmit: 'replace', inspect: 'none', history: 'none' })
  })

  it('infers alongside for Workspace regions', () => {
    expect(
      inferCompositionFromBrief({
        archetype: 'workspace',
        pages: [
          {
            path: 'home',
            archetype: 'workspace',
            regions: { navigator: {}, primary: {} },
          },
        ],
      })
    ).toMatchObject({ afterSubmit: 'alongside', inspect: 'same-page' })
  })
})

describe('compositionSitemapIssues', () => {
  it('requires a results page for replace', () => {
    expect(
      compositionSitemapIssues({
        composition: {
          afterSubmit: 'replace',
          inspect: 'none',
          history: 'none',
          mutations: 'local',
        },
        pages: [{ path: 'home', archetype: 'task' }],
      })
    ).toContain('replace requires a results page')
  })

  it('rejects stack with a Workspace page', () => {
    expect(
      compositionSitemapIssues({
        composition: {
          afterSubmit: 'stack',
          inspect: 'none',
          history: 'none',
          mutations: 'local',
        },
        pages: [{ path: 'home', archetype: 'workspace', regions: { primary: {} } }],
      })
    ).toContain('stack must not use a Workspace page')
  })

  it('requires History when peer-tab is locked', () => {
    expect(
      compositionSitemapIssues({
        composition: {
          afterSubmit: 'replace',
          inspect: 'none',
          history: 'peer-tab',
          mutations: 'local',
        },
        pages: [
          { path: 'home', archetype: 'task' },
          { path: 'results', archetype: 'results' },
        ],
      })
    ).toContain('History peer-tab requires a History collection page')
  })
})

describe('applyIaPreset and patchComposition', () => {
  const brief = {
    pages: [{ path: 'home', title: 'Home' }],
    composition: {
      afterSubmit: 'replace' as const,
      navigateWhen: 'immediate' as const,
      inspect: 'none' as const,
      history: 'none' as const,
      mutations: 'local' as const,
    },
  }

  it('fills knobs from an IA preset', () => {
    expect(applyIaPreset(brief, 'stay-on-page').composition).toEqual({
      afterSubmit: 'stack',
      inspect: 'none',
      history: 'none',
      mutations: 'local',
    })
  })

  it('patches a single knob without dropping the rest', () => {
    expect(patchComposition(brief, { history: 'peer-tab' }).composition).toMatchObject({
      afterSubmit: 'replace',
      history: 'peer-tab',
      mutations: 'local',
    })
  })
})

describe('applyCompositionToManifest', () => {
  it('stamps navigateWhen success on replace CTAs', () => {
    const stamped = applyCompositionToManifest(twoPageManifest, {
      afterSubmit: 'replace',
      navigateWhen: 'success',
      inspect: 'none',
      history: 'none',
      mutations: 'local',
    })
    expect(stamped.actions.submit_lead.onSuccess?.navigateWhen).toBe('success')
  })

  it('keeps streaming actions immediate', () => {
    const stamped = applyCompositionToManifest(
      twoPageManifest,
      {
        afterSubmit: 'replace',
        navigateWhen: 'success',
        inspect: 'none',
        history: 'none',
        mutations: 'local',
      },
      { streamingActionIds: new Set(['submit_lead']) }
    )
    expect(stamped.actions.submit_lead.onSuccess?.navigateWhen).toBeUndefined()
  })
})

describe('planStatus packing', () => {
  it('packs planned status and treats empty pages as a placeholder', () => {
    const packed = withStoredPlanStatus({ title: 'Lead' }, 'planned')
    expect(parseStoredPlanStatus(packed)).toBe('planned')
    expect(isPlannedOnlyManifest(plannedPlaceholderManifest('home'))).toBe(true)
    expect(isLaunchableGenerativeDraft(packed, plannedPlaceholderManifest())).toBe(false)
    expect(isLaunchableGenerativeDraft({ title: 'Lead' }, twoPageManifest)).toBe(true)
  })
})
