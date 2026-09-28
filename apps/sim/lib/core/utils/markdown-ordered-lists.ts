/**
 * Renumbers top-level markdown ordered-list markers so split lists still read
 * 1, 2, 3… in the chat UI.
 *
 * Models (especially Gemini) often emit every item as `1.`. That is valid GFM
 * inside one `<ol>`, but a blank line between items starts a new list — and each
 * new `<ol>` restarts at 1 unless the renderer forwards `start`. Rewriting
 * markers and collapsing blank lines between consecutive top-level items keeps
 * one continuous list without changing nested / indented lists or fenced code.
 */
export function renumberMarkdownOrderedLists(markdown: string): string {
  if (!/^\d+\./m.test(markdown)) return markdown

  const lines = markdown.split('\n')
  const out: string[] = []
  let inFence = false
  let fenceChar: '`' | '~' | null = null
  let fenceLen = 0
  let nextNumber = 1
  let inOrderedList = false

  for (const line of lines) {
    const fenceOpen = line.match(/^(\s*)([`~]{3,})(.*)$/)
    if (!inFence && fenceOpen) {
      inFence = true
      fenceChar = fenceOpen[2][0] as '`' | '~'
      fenceLen = fenceOpen[2].length
      inOrderedList = false
      nextNumber = 1
      out.push(line)
      continue
    }
    if (inFence) {
      const fenceClose = line.match(/^(\s*)([`~]{3,})\s*$/)
      if (fenceClose && fenceClose[2][0] === fenceChar && fenceClose[2].length >= fenceLen) {
        inFence = false
        fenceChar = null
        fenceLen = 0
      }
      out.push(line)
      continue
    }

    const orderedItem = line.match(/^(\d+)\.(\s+.*)$/)
    if (orderedItem) {
      // Drop blank lines between consecutive top-level items so remark/GFM
      // keeps a single <ol> (blank lines otherwise restart numbering at 1).
      if (inOrderedList) {
        while (out.length > 0 && out[out.length - 1].trim() === '') {
          out.pop()
        }
      }
      out.push(`${nextNumber}.${orderedItem[2]}`)
      nextNumber += 1
      inOrderedList = true
      continue
    }

    if (line.trim() === '') {
      out.push(line)
      continue
    }

    if (inOrderedList && /^\s+/.test(line)) {
      out.push(line)
      continue
    }

    inOrderedList = false
    nextNumber = 1
    out.push(line)
  }

  return out.join('\n')
}
