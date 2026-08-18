/**
 * React 19 warns when a `<script>` host is rendered as a component. next-themes
 * and FOUC scripts still need that tag during SSR; the warning is a false
 * positive and Next's overlay attributes it to RootLayout.
 */
export function isReact19ScriptTagWarning(args: unknown[]): boolean {
  return args.some(
    (arg) =>
      typeof arg === 'string' &&
      arg.includes('Encountered a script tag while rendering React component')
  )
}

if (typeof window !== 'undefined') {
  const originalError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    if (isReact19ScriptTagWarning(args)) return
    originalError(...args)
  }
}
