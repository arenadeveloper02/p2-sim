/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { parseNeonProjectIdFromRepoSummary } from '@/lib/development/apply-generated-app-database'

describe('parseNeonProjectIdFromRepoSummary', () => {
  it('parses Neon project id from infrastructure section', () => {
    const content = `## Infrastructure

- **Neon project ID:** \`young-sound-12345678\` — managed by Sim Development
- **DATABASE_URL:** set on Vercel
`
    expect(parseNeonProjectIdFromRepoSummary(content)).toBe('young-sound-12345678')
  })

  it('returns undefined when no neon project id is recorded', () => {
    expect(parseNeonProjectIdFromRepoSummary('## Database\n\nPrisma only')).toBeUndefined()
  })
})
