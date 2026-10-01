import { fileURLToPath } from 'node:url'

/**
 * Resolved to an absolute path from this file's own URL. Turbopack loads the
 * PostCSS config in a worker and resolves plugin ids from a generated chunk
 * directory, so a project-relative specifier is not found there.
 *
 * Must be CommonJS (`.cjs`): Next's webpack PostCSS loader `require()`s plugin
 * paths. Requiring an ESM `.mjs` returns a module namespace object, and
 * `postcss()` then throws `TypeError: Cannot convert object to primitive value`
 * inside `next/font` (and any other CSS pipeline that loads this config).
 */
const hairlineBorderWidth = fileURLToPath(
  new URL('./lib/postcss/hairline-border-width.cjs', import.meta.url)
)

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
    // Must run after Tailwind: it rewrites Tailwind's own border-width output.
    [hairlineBorderWidth]: {},
  },
}

export default config
