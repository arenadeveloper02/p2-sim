/**
 * Rotating engagement copy for Local Copilot while a file preview is still
 * generating (empty shell / compiling). Pure helpers — UI lives in the component.
 */

export type GeneratingPreviewKind = 'pdf' | 'presentation' | 'document' | 'html' | 'file'

export function resolveGeneratingPreviewKind(fileName: string): GeneratingPreviewKind {
  const ext = fileName.includes('.') ? (fileName.split('.').pop()?.toLowerCase() ?? '') : ''
  if (ext === 'pdf') return 'pdf'
  if (ext === 'pptx') return 'presentation'
  if (ext === 'docx' || ext === 'xlsx') return 'document'
  if (ext === 'html' || ext === 'htm') return 'html'
  return 'file'
}

/**
 * Returns phase-style messages for the given kind. Filename is interpolated when
 * present so the panel feels tied to the active tab.
 */
export function getGeneratingPreviewMessages(
  kind: GeneratingPreviewKind,
  fileName?: string
): string[] {
  const name = fileName?.trim()
  const named = name ? `“${name}”` : null

  switch (kind) {
    case 'pdf':
      return [
        named ? `Writing ${named}…` : 'Writing your PDF…',
        'Laying out pages…',
        'Compiling the document…',
        named ? `Almost ready — finishing ${named}…` : 'Almost ready — finishing your PDF…',
      ]
    case 'presentation':
      return [
        named ? `Building ${named}…` : 'Building your presentation…',
        'Adding slides…',
        'Polishing layout…',
        named ? `Compiling ${named}…` : 'Compiling the deck…',
      ]
    case 'document':
      return [
        named ? `Writing ${named}…` : 'Writing your document…',
        'Formatting content…',
        'Compiling the file…',
        'Putting the finishing touches…',
      ]
    case 'html':
      return [
        named ? `Generating ${named}…` : 'Generating your page…',
        'Structuring the markup…',
        'Applying styles…',
        'Almost ready to preview…',
      ]
    default:
      return [
        named ? `Working on ${named}…` : 'Working on your file…',
        'This may take a moment…',
        'Still generating…',
        'Hang tight — finishing up…',
      ]
  }
}

/** Advances a message index; used by the engagement panel and unit-tested. */
export function nextGeneratingMessageIndex(current: number, messageCount: number): number {
  if (messageCount <= 0) return 0
  return (current + 1) % messageCount
}
