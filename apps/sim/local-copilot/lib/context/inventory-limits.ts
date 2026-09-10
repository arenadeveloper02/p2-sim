/**
 * Row caps for Arena Copilot fallback inventory (when the mothership snapshot
 * is unavailable). Metadata only — not file bytes or skill bodies.
 */
export const COPILOT_INVENTORY_LIMITS = {
  workflows: 250,
  files: 250,
  knowledgeBases: 250,
  tables: 250,
  skills: 100,
} as const

/** Skill instruction bodies inlined on each turn (rest stay load_user_skill). */
export const COPILOT_INLINED_SKILL_BODY_LIMIT = 16

/** Concurrent skill-body reads. Bounded so a large catalog cannot fan out. */
export const COPILOT_SKILL_BODY_LOAD_CONCURRENCY = 8
