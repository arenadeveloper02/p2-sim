/**
 * Run with: bun test scripts/check-api-validation-contracts.test.ts
 * (Root scripts are bun-native and not part of the turbo/vitest workspaces.)
 */
import { describe, expect, test } from 'bun:test'
import {
  BASELINE,
  BOUNDARY_POLICY_BASELINE,
  boundaryPolicyFailures,
  routeBaselineFailures,
} from './check-api-validation-contracts.ts'

const baseline = { totalRoutes: 100, zodRoutes: 90, nonZodRoutes: 10 }

describe('BASELINE integrity', () => {
  test('total equals zod plus nonZod', () => {
    expect(BASELINE.zodRoutes + BASELINE.nonZodRoutes).toBe(BASELINE.totalRoutes)
  })

  test('the committed baseline cannot fail against itself', () => {
    expect(routeBaselineFailures(BASELINE, BASELINE)).toEqual([])
  })

  test('every boundary policy ceiling is a non-negative number', () => {
    for (const [key, value] of Object.entries(BOUNDARY_POLICY_BASELINE)) {
      expect(Number.isInteger(value), `${key} must be an integer`).toBe(true)
      expect(value, `${key} must not be negative`).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('routeBaselineFailures', () => {
  test('passes at the baseline', () => {
    expect(routeBaselineFailures(baseline, baseline)).toEqual([])
  })

  test('passes below the baseline', () => {
    expect(
      routeBaselineFailures({ totalRoutes: 99, zodRoutes: 90, nonZodRoutes: 9 }, baseline)
    ).toEqual([])
  })

  /**
   * The case that motivated raising the ceiling: a new route that validates through
   * a contract lands on the Zod side, so only the count ratchet trips. Raising
   * `totalRoutes` for it must not buy any extra tolerance for unvalidated routes.
   */
  test('a new contract-bound route trips the count ceiling only', () => {
    const failures = routeBaselineFailures(
      { totalRoutes: 101, zodRoutes: 91, nonZodRoutes: 10 },
      baseline
    )

    expect(failures).toEqual(['route count increased from 100 to 101'])
  })

  test('a new unvalidated route trips both ceilings', () => {
    const failures = routeBaselineFailures(
      { totalRoutes: 101, zodRoutes: 90, nonZodRoutes: 11 },
      baseline
    )

    expect(failures).toHaveLength(2)
    expect(failures[0]).toBe('route count increased from 100 to 101')
    expect(failures[1]).toBe('non-Zod routes increased from 10 to 11 (90 Zod-backed routes)')
  })

  /**
   * No new routes, but a contract was removed from an existing one. The count
   * ceiling cannot see this, so the non-Zod ceiling is the only thing that catches it.
   */
  test('dropping a contract from an existing route still fails', () => {
    const failures = routeBaselineFailures(
      { totalRoutes: 100, zodRoutes: 89, nonZodRoutes: 11 },
      baseline
    )

    expect(failures).toEqual(['non-Zod routes increased from 10 to 11 (89 Zod-backed routes)'])
  })

  test('reports the actual numbers so the fix is obvious', () => {
    const [failure] = routeBaselineFailures(
      { totalRoutes: 137, zodRoutes: 127, nonZodRoutes: 10 },
      baseline
    )

    expect(failure).toContain('100')
    expect(failure).toContain('137')
  })

  test('defaults to the committed baseline when none is passed', () => {
    expect(routeBaselineFailures(BASELINE)).toEqual([])
    expect(
      routeBaselineFailures({
        totalRoutes: BASELINE.totalRoutes + 1,
        zodRoutes: BASELINE.zodRoutes + 1,
        nonZodRoutes: BASELINE.nonZodRoutes,
      })
    ).toHaveLength(1)
  })
})

describe('boundaryPolicyFailures', () => {
  const policyBaseline = { ...BOUNDARY_POLICY_BASELINE, doubleCasts: 9, rawJsonReads: 5 }

  test('passes when every metric sits at its ceiling', () => {
    expect(
      boundaryPolicyFailures(
        [
          { key: 'doubleCasts', label: 'double casts', current: 9 },
          { key: 'rawJsonReads', label: 'raw json reads', current: 5 },
        ],
        policyBaseline
      )
    ).toEqual([])
  })

  test('passes when a metric drops below its ceiling', () => {
    expect(
      boundaryPolicyFailures(
        [{ key: 'doubleCasts', label: 'double casts', current: 0 }],
        policyBaseline
      )
    ).toEqual([])
  })

  test('fails on a single increase and names the metric', () => {
    expect(
      boundaryPolicyFailures(
        [{ key: 'doubleCasts', label: 'double casts', current: 10 }],
        policyBaseline
      )
    ).toEqual(['double casts increased from 9 to 10'])
  })

  test('reports every breached metric, not just the first', () => {
    const failures = boundaryPolicyFailures(
      [
        { key: 'doubleCasts', label: 'double casts', current: 10 },
        { key: 'rawJsonReads', label: 'raw json reads', current: 6 },
        { key: 'routeZodImports', label: 'route zod imports', current: 0 },
      ],
      policyBaseline
    )

    expect(failures).toEqual([
      'double casts increased from 9 to 10',
      'raw json reads increased from 5 to 6',
    ])
  })

  test('a zero-tolerance metric fails on its first occurrence', () => {
    expect(
      boundaryPolicyFailures(
        [{ key: 'routeZodImports', label: 'route zod imports', current: 1 }],
        policyBaseline
      )
    ).toEqual(['route zod imports increased from 0 to 1'])
  })
})
