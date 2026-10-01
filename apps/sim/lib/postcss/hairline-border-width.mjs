/**
 * ESM entry that re-exports the CommonJS plugin. Prefer importing
 * `./hairline-border-width.cjs` from PostCSS config (Next webpack `require`s
 * that path). Tests may import either form.
 */
import plugin from './hairline-border-width.cjs'

export default plugin
