import { ARENA_BRANCH_GUIDELINES } from '@/lib/development/arena/branch-guidelines'
import { ARENA_DESIGN_GUIDELINES } from '@/lib/development/arena/design-guidelines'

/**
 * Arena-mode mandates for generated/edited apps (iframe emailId gate + scaffold).
 */
export const ARENA_DEVELOPMENT_MANDATES = `## Arena Development mandates (non-negotiable)
- This app is embedded in a cross-origin iframe. Keep \`Content-Security-Policy: frame-ancestors *\` (set in middleware) and never add \`X-Frame-Options: DENY\` / \`SAMEORIGIN\`.
- Visitors always arrive with \`?emailId=...\` on the iframe URL. Middleware reads \`emailId\` from the query string (or the \`arena_email_id\` cookie on later navigations).
- If \`emailId\` is missing or empty, middleware rewrites to \`/access-denied\` — keep \`app/access-denied/page.tsx\` as a polished Arena DS UI that shows the message "Do not have access" (never replace it with plain text).
- Persist a valid \`emailId\` in the \`arena_email_id\` cookie with \`Path=/\`, \`Secure\`, \`SameSite=None\` so cross-origin iframes keep access across client navigations.
- Keep \`lib/arena-email-constants.ts\`, \`lib/arena-email.ts\`, \`components/arena-email-provider.tsx\`, \`app/access-denied/page.tsx\`, and root middleware. Root \`app/layout.tsx\` must wrap children with \`ArenaEmailProvider\` using \`getArenaEmailId()\`.
- Prefer \`getArenaEmailId()\` / \`requireArenaEmailId()\` on the server and \`useArenaEmailId()\` on the client for any user-scoped data — do not invent a parallel identity system.
- Never remove or bypass the Arena email gate, access-denied page, provider, or iframe headers.`

/**
 * Appends Arena mandates, design guidelines, and branch guidelines when arena mode is enabled.
 */
export function appendArenaSystemPrompt(systemPrompt: string, arenaMode?: boolean): string {
  if (!arenaMode) {
    return systemPrompt
  }

  return `${systemPrompt}\n\n${ARENA_DEVELOPMENT_MANDATES}\n\n${ARENA_DESIGN_GUIDELINES}\n\n${ARENA_BRANCH_GUIDELINES}`
}
