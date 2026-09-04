/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  formatGenerateFailureForUser,
  suggestionForGenerateFailure,
} from '@/lib/arena-generative-ui/format-generate-failure'
import { GENERATOR_OMITTED_PAGES_ERROR } from '@/lib/arena-generative-ui/validate-manifest'

describe('suggestionForGenerateFailure', () => {
  it('maps omitted pages to pinning a sitemap', () => {
    expect(suggestionForGenerateFailure(GENERATOR_OMITTED_PAGES_ERROR)).toContain(
      'Pin a JSON sitemap'
    )
  })

  it('maps invented API keys to Add an API or User Input', () => {
    expect(
      suggestionForGenerateFailure('Action "qualify" references unknown API key "invented_key"')
    ).toContain('Add an API')
  })

  it('maps dummy Repeat boards to seeding rows on arrival', () => {
    expect(
      suggestionForGenerateFailure(
        'Page "home" Repeat/Table statePath "items" has no dummy rows. Seed 4–8 rows with page onLoad setState of that key, or Table.rows plus that Table\'s statePath. The host does not invent Repeat items.'
      )
    ).toContain('sample rows on arrival')
  })

  it('maps unreachable pages to naming navigation', () => {
    expect(
      suggestionForGenerateFailure('Unreachable pages from entryPath "home": results')
    ).toContain('how you move between them')
  })

  it('maps kebab-case path errors to Pages', () => {
    expect(
      suggestionForGenerateFailure(
        'Invalid page path "Home". Use kebab-case segments like home or results.'
      )
    ).toContain('kebab-case')
  })

  it('maps dead controls to saying what they do', () => {
    expect(
      suggestionForGenerateFailure(
        'Page "home" has a Button (go) with no actionId, navigateTo, href, selectItem, clearItem, or setValue, so it would do nothing. Give it a verb.'
      )
    ).toContain('what each control does')
  })

  it('maps host-critic defects to simplifying the page', () => {
    expect(
      suggestionForGenerateFailure(
        'Page "home" Card "inner" is nested inside another Card. Do not wrap a Card in a Card.'
      )
    ).toContain('one primary action')
  })

  it('maps a required host key error to pasting a business sample', () => {
    expect(
      suggestionForGenerateFailure('Binding "run_history" never binds required host key: data.')
    ).toContain('Sample response')
    expect(
      suggestionForGenerateFailure('Binding "run_history" never binds required host keys: history.')
    ).toContain('Add an API')
  })

  it('maps chat protocol errors to adding Chat or form fields', () => {
    expect(
      suggestionForGenerateFailure(
        'Binding "ask" has chat protocol input and no form fields. Add a Chat with an action that uses that binding.'
      )
    ).toContain('Chat')
  })

  it('falls back to tightening the brief', () => {
    expect(suggestionForGenerateFailure('Manifest must be an object')).toContain(
      'Tighten User Input'
    )
  })
})

describe('formatGenerateFailureForUser', () => {
  it('lists remaining issues and a user action', () => {
    const text = formatGenerateFailureForUser({
      issues: [
        'Action "qualify" references unknown API key "invented_key"',
        'Page "results" is an onSuccess.navigate target with no NavLink, Button.navigateTo, clearItem, or Tabs path back. Add a Back control.',
      ],
      repairAttempts: 3,
    })
    expect(text).toContain('Could not generate a valid app after 3 repair attempts.')
    expect(text).toContain('What still needs to be fixed:')
    expect(text).toContain('invented_key')
    expect(text).toContain('onSuccess.navigate target')
    expect(text).toContain('What you can do:')
    expect(text).toContain('Add an API')
    expect(text).toContain('one primary action')
  })

  it('uses a fallback issue when the list is empty', () => {
    const text = formatGenerateFailureForUser({ issues: [], repairAttempts: 3 })
    expect(text).toContain('Generated manifest failed validation')
    expect(text).toContain('Tighten User Input')
  })
})
