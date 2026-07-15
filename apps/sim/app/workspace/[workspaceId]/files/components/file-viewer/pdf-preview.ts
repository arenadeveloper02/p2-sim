/**
 * Builds the `file` prop for react-pdf's `<Document>`.
 *
 * pdf.js transfers ArrayBuffer / Uint8Array payloads to its worker and leaves them
 * detached. A memoized `{ data: Uint8Array }` therefore breaks on Strict Mode
 * remounts and any Document reload that reuses the same file object. Blob can be
 * re-read, so it survives remounts without another fetch.
 */
export function toPdfDocumentFile(
  source: { kind: 'url'; url: string } | { kind: 'buffer'; buffer: ArrayBuffer }
): string | Blob {
  if (source.kind === 'url') return source.url
  if (source.buffer.byteLength === 0) {
    throw new Error('The PDF file is empty, i.e. its size is zero bytes.')
  }
  // Copy so the caller's ArrayBuffer (React Query cache) stays usable. Pass a
  // Uint8Array view — some runtimes coerce bare ArrayBuffer Blob parts poorly.
  return new Blob([new Uint8Array(source.buffer.slice(0))], { type: 'application/pdf' })
}
