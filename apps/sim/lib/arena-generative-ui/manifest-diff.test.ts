/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { summarizeManifestDiff } from '@/lib/arena-generative-ui/manifest-diff'
import { twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'

describe('summarizeManifestDiff', () => {
  it('returns null for revision 1 or a missing previous snapshot', () => {
    expect(summarizeManifestDiff(undefined, twoPageManifest, 0, 1)).toBeNull()
    expect(summarizeManifestDiff(twoPageManifest, twoPageManifest, 1, 1)).toBeNull()
  })

  it('summarizes added, removed, and changed pages plus theme', () => {
    const next = {
      ...twoPageManifest,
      theme: { brandColor: '#112233' as const },
      pages: {
        home: { ...twoPageManifest.pages.home, title: 'Updated form' },
        report: {
          title: 'Report',
          path: 'report',
          spec: twoPageManifest.pages.results.spec,
        },
      },
      actions: {
        ...twoPageManifest.actions,
        load_report: { apiKey: 'qualify_lead' },
      },
    }
    const diff = summarizeManifestDiff(twoPageManifest, next, 1, 2)
    expect(diff).toMatchObject({
      fromRevision: 1,
      toRevision: 2,
      pagesAdded: ['report'],
      pagesRemoved: ['results'],
      pagesChanged: ['home'],
      actionsAdded: ['load_report'],
      themeChanged: true,
    })
    expect(diff?.summary).toContain('r1 → r2')
    expect(diff?.summary).toContain('added page report')
    expect(diff?.summary).toContain('updated theme')
  })
})
