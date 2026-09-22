import { ARENA_BRANCH_GUIDELINES } from '@/lib/development/arena/branch-guidelines'
import { ARENA_DESIGN_GUIDELINES } from '@/lib/development/arena/design-guidelines'

/**
 * Arena-mode mandates for generated/edited apps (iframe emailId + theme gate + Sim UI).
 */
export const ARENA_DEVELOPMENT_MANDATES = `## Arena Development mandates (non-negotiable)
- This app is embedded in a cross-origin iframe. Keep \`Content-Security-Policy: frame-ancestors *\` (set in middleware) and never add \`X-Frame-Options: DENY\` / \`SAMEORIGIN\`.
- Visitors arrive with \`?emailId=...\` (required) and optional \`?theme=light|white|dark\` on the iframe URL.
- Middleware reads \`emailId\` from the query string (or the \`arena_email_id\` cookie on later navigations).
- If \`emailId\` is missing or empty, middleware rewrites to \`/access-denied\` — keep \`app/access-denied/page.tsx\` as polished **Sim UI** that shows "Do not have access" (never plain text).
- Persist a valid \`emailId\` in the \`arena_email_id\` cookie with \`Path=/\`, \`Secure\`, \`SameSite=None\`.
- Middleware also reads \`theme\` from the query (or \`arena_theme\` cookie). Normalize: \`white\`/\`light\` → light, \`dark\` → dark, missing/invalid → **light** (white). Persist \`arena_theme\` the same way as email. Theme never gates access.
- Root \`app/layout.tsx\` must set \`<html className={theme}>\` from \`getArenaTheme()\`, wrap children with \`ArenaEmailProvider\` (\`getArenaEmailId()\`) and \`ArenaThemeProvider theme={theme}\` (prop name is \`theme\`, NOT \`initialTheme\`), and keep \`app/sim-tokens.css\` imported.
- Import Arena helpers ONLY from these modules (once each, never duplicate):
  - \`import { getArenaEmailId, getArenaTheme } from '@/lib/arena-email'\`
  - \`import { ArenaEmailProvider } from '@/components/arena-email-provider'\` — prop is \`emailId={...}\`, NOT \`value={...}\`
  - \`import { ArenaThemeProvider } from '@/components/arena-theme-provider'\` — prop is \`theme={...}\`, NOT \`initialTheme={...}\`
- NEVER invent \`components/ArenaProviders.tsx\` or re-export those symbols from \`lib/arena.ts\` — that causes TS2300 Duplicate identifier when the scaffold re-wires layout.
- Prefer \`getArenaEmailId()\` / \`useArenaEmailId()\` for identity and \`getArenaTheme()\` / \`useArenaTheme()\` for theme — do not invent parallel systems.
- Never remove or bypass the email gate, theme cookie/class wiring, access-denied page, providers, Sim tokens, or iframe headers.`

/**
 * Appends Arena mandates, Sim design guidelines, and branch guidelines when arena mode is enabled.
 */
export function appendArenaSystemPrompt(systemPrompt: string, arenaMode?: boolean): string {
  if (!arenaMode) {
    return systemPrompt
  }

  return `${systemPrompt}\n\n${ARENA_DEVELOPMENT_MANDATES}\n\n${ARENA_DESIGN_GUIDELINES}\n\n${ARENA_BRANCH_GUIDELINES}`
}
