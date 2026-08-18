/**
 * Wall-clock budget for generate/edit. Keep route `maxDuration` (seconds) in
 * `app/api/tools/arena_generative_ui/{generate,edit}/route.ts` in sync — Next.js
 * requires a static literal there.
 */
export const ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS = 25 * 60 * 1000
