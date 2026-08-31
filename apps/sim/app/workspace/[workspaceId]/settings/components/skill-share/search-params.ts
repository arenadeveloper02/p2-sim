import { parseAsStringLiteral } from 'nuqs/server'

/** Skill share settings tabs. */
export const SKILL_SHARE_TABS = ['share', 'services'] as const

export type SkillShareTab = (typeof SKILL_SHARE_TABS)[number]

/**
 * Co-located, typed URL query-param definitions for the Skill share view.
 *
 * `tab` is the active section (Share skills vs Skill services).
 */
export const skillShareParsers = {
  tab: parseAsStringLiteral(SKILL_SHARE_TABS).withDefault('share'),
} as const

/** Tab view-state: clean URLs, no back-stack churn. */
export const skillShareUrlKeys = {
  history: 'replace',
  clearOnDefault: true,
} as const
