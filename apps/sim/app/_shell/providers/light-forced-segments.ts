import { LANDING_ROUTES } from '@/lib/landing/routes'

/**
 * First path segments outside the `(landing)` group whose pages pin the light
 * token layer in their own shell — `(auth)`, the chat interfaces, the public
 * file view, the pages reached from an email, and the `AuthShell` handoffs for
 * the CLI and credential groups. Segments, not prefixes: they are matched by
 * set membership, so `f` covers `/f/<token>` and needs no trailing slash.
 *
 * Landing paths live in {@link LANDING_ROUTES}. ThemeProvider and the root
 * layout FOUC script union both lists.
 */
export const NON_LANDING_LIGHT_SEGMENTS = [
  'login',
  'signup',
  'reset-password',
  'sso',
  'invite',
  'verify',
  'chat',
  'resume',
  'oauth',
  'oauth-error',
  'f',
  'unsubscribe',
  'cli',
  'credential-groups',
] as const

/**
 * Path segments rendered light regardless of the visitor's theme, including
 * the marketing site. The document root (`/`) is forced light separately via
 * an empty first segment.
 */
export const LIGHT_MODE_SEGMENTS: ReadonlySet<string> = new Set([
  ...LANDING_ROUTES,
  ...NON_LANDING_LIGHT_SEGMENTS,
])

export const SIM_THEME_STORAGE_KEY = 'sim-theme'

/**
 * Blocking script that applies the stored (or forced-light) theme class before
 * paint. Lives in the root layout so the client ThemeProvider never has to
 * emit a `<script>` into the React tree.
 */
export function themeFoucScriptSource(): string {
  const forceLight = ['', ...LANDING_ROUTES, ...NON_LANDING_LIGHT_SEGMENTS]
  return `(function(){try{var forceLight=${JSON.stringify(forceLight)};var first=(location.pathname.split("/")[1]||"");var theme="light";if(forceLight.indexOf(first)===-1){var stored=localStorage.getItem(${JSON.stringify(SIM_THEME_STORAGE_KEY)});if(stored==="dark"||stored==="light")theme=stored;else if(stored==="system")theme=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}var el=document.documentElement;el.classList.remove("light","dark");el.classList.add(theme);el.style.colorScheme=theme}catch(e){}})();`
}
