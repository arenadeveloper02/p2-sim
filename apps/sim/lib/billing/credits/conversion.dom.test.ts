/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { CREDITS_PER_DOLLAR } from '@/lib/billing/constants'
import { CREDITS_PER_DOLLAR_ATTRIBUTE, getCreditsPerDollar } from '@/lib/billing/credits/conversion'

const RUNTIME_CREDITS_PER_DOLLAR_KEY = '__SIM_CREDITS_PER_DOLLAR__'

describe('getCreditsPerDollar', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(CREDITS_PER_DOLLAR_ATTRIBUTE)
    Reflect.deleteProperty(globalThis, RUNTIME_CREDITS_PER_DOLLAR_KEY)
  })

  it('reads the html attribute when the runtime global is unset', () => {
    document.documentElement.setAttribute(CREDITS_PER_DOLLAR_ATTRIBUTE, '80')

    expect(Reflect.get(globalThis, RUNTIME_CREDITS_PER_DOLLAR_KEY)).toBeUndefined()
    expect(getCreditsPerDollar()).toBe(80)
  })

  it('falls back to the compile-time rate when the attribute is missing', () => {
    expect(getCreditsPerDollar()).toBe(CREDITS_PER_DOLLAR)
  })
})
