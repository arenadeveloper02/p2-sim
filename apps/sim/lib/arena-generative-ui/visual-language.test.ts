/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { stampThemeFromIntent } from '@/lib/arena-generative-ui/design-intent'
import {
  resolvePageLanguage,
  visualLanguageFromIntent,
} from '@/lib/arena-generative-ui/visual-language'

describe('visual language', () => {
  it('stamps four looks and leaves unknown briefs operational', () => {
    expect(visualLanguageFromIntent({ productType: 'analytics' })).toBe('dense')
    expect(visualLanguageFromIntent({ visualPriority: 'content' })).toBe('editorial')
    expect(visualLanguageFromIntent({ visualPriority: 'task' })).toBe('task')
    expect(visualLanguageFromIntent({ productType: 'crm' })).toBe('operational')
    expect(stampThemeFromIntent(undefined, { productType: 'finance' }).language).toBe('dense')
  })

  it('keeps a working list operational and a form task', () => {
    expect(
      resolvePageLanguage({
        elements: { table: { type: 'Table' }, page: { type: 'Page' } },
      })
    ).toBe('operational')
    expect(
      resolvePageLanguage({
        elements: { form: { type: 'Form' }, article: { type: 'DataText' } },
      })
    ).toBe('task')
    expect(
      resolvePageLanguage(
        { elements: { article: { type: 'DataText' } } },
        'task'
      )
    ).toBe('task')
    expect(
      resolvePageLanguage({ elements: { article: { type: 'Markdown' } } }, 'operational')
    ).toBe('editorial')
  })
})
