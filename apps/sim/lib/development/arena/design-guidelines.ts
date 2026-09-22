/**
 * Sim UI standards for Arena Development generated apps (not Arena DS).
 */
export const ARENA_DESIGN_GUIDELINES = `## Sim UI Design Guidelines (follow exactly)

Source: Sim platform tokens. Prefer CSS vars from \`app/sim-tokens.css\` (\`--bg\`, \`--surface-*\`, \`--text-*\`, \`--border\`, \`--brand-*\`). Bind UI to these semantic tokens — never invent hex outside this system. Do **not** use Arena \`--ds-*\` tokens or Poppins-as-brand.

### Theme (URL-driven)
- Parent iframe passes \`?theme=light\`, \`?theme=white\`, or \`?theme=dark\` (alongside \`emailId\`).
- Middleware resolves theme and sets the \`arena_theme\` cookie; root \`<html>\` gets \`className="light"\` or \`className="dark"\`.
- Missing / invalid \`theme\` → **light** (white surfaces). Never block access for a missing theme.
- Style with \`var(--bg)\`, \`var(--surface-2)\`, \`var(--text-body)\`, \`var(--text-primary)\`, \`var(--border)\`, \`var(--brand-500)\`, etc. so light/dark swap automatically.

### Color roles (Sim)
- Surfaces: page=\`--bg\`, panels=\`--surface-1\`, cards/modals=\`--surface-2\`, inputs=\`--surface-5\`, hover=\`--surface-hover\`
- Text: primary=\`--text-primary\`, body=\`--text-body\`, secondary=\`--text-secondary\`, muted=\`--text-muted\`, icon=\`--text-icon\`, error=\`--text-error\`
- Border: \`--border\` / \`--border-1\`
- Brand / accent: \`--brand-500\` (primary blue), \`--brand-secondary\`, \`--brand-accent\` (green), \`--primary-hover\`

### Typography & chrome
- System / Inter-like UI font (no Poppins requirement). Normal weight for body; medium for labels; semibold for headings.
- Default icon size ~14px. Prefer Tailwind + CSS vars (\`bg-[var(--surface-2)]\`, \`text-[var(--text-body)]\`).
- Cards: light border + \`--surface-2\` fill; avoid heavy multi-shadow / purple-indigo AI themes.
- Buttons: brand fill for primary; \`--surface-4\` / \`--surface-5\` for secondary; destructive uses \`--text-error\`.

### Hard rules
- Import \`app/sim-tokens.css\` from \`app/globals.css\`; do not delete or empty it.
- Keep \`className\` on \`<html>\` as \`light\` or \`dark\` from \`getArenaTheme()\` — never hard-code only one theme.
- No Arena Design System (\`--ds-*\`, Poppins brand font, Arena blue-grey DS chrome).
- No generic purple-indigo gradients, glow stacks, or random hex palettes.`
