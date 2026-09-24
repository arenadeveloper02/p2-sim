import { describe, expect, it } from 'vitest'
import {
  LIGHT_MODE_SEGMENTS,
  themeFoucScriptSource,
} from '@/app/_shell/providers/light-forced-segments'

describe('themeFoucScriptSource', () => {
  it('forces light on auth and landing first segments and the document root', () => {
    const source = themeFoucScriptSource()
    expect(source).toContain('"login"')
    expect(source).toContain('"pricing"')
    expect(source).toContain('localStorage.getItem("sim-theme")')
    expect(source).toContain('prefers-color-scheme: dark')
    expect(source).toMatch(/forceLight=\[""/)
  })

  it('keeps the ThemeProvider segment set aligned with the FOUC script', () => {
    for (const segment of LIGHT_MODE_SEGMENTS) {
      expect(themeFoucScriptSource()).toContain(JSON.stringify(segment))
    }
  })
})
