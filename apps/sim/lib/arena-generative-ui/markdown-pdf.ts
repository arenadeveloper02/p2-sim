const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 54
const BODY_SIZE = 11
const HEADING_SIZE = 16
const LINE_GAP = 4
const CHAR_WIDTH = 0.5

interface PdfLine {
  text: string
  size: number
}

/**
 * Builds a printable PDF (Helvetica, letter) from markdown source.
 * Headings stay larger; emphasis markers are stripped. Non-Latin-1
 * characters become `?` so the built-in font can show the rest.
 */
export function markdownToPdfBytes(markdown: string): Uint8Array {
  const lines = wrapPdfLines(markdownToPlainLines(markdown))
  const pages: PdfLine[][] = []
  let current: PdfLine[] = []
  let y = PAGE_HEIGHT - MARGIN
  const flush = () => {
    pages.push(current)
    current = []
    y = PAGE_HEIGHT - MARGIN
  }
  if (lines.length === 0) {
    pages.push([{ text: ' ', size: BODY_SIZE }])
  } else {
    for (const line of lines) {
      const height = line.size + LINE_GAP
      if (y - height < MARGIN) flush()
      current.push(line)
      y -= height
    }
    if (current.length > 0) flush()
  }

  const pageObjectIds = pages.map((_, index) => 4 + index * 2)
  const contentObjectIds = pages.map((_, index) => 5 + index * 2)
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  for (let index = 0; index < pages.length; index += 1) {
    const stream = pageContentStream(pages[index])
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentObjectIds[index]} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`
    )
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }

  return assemblePdf(objects)
}

function markdownToPlainLines(markdown: string): PdfLine[] {
  const lines: PdfLine[] = []
  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = raw.trimEnd()
    if (!trimmed.trim()) {
      lines.push({ text: ' ', size: BODY_SIZE })
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      lines.push({
        text: stripMarkdownInline(heading[2] ?? ''),
        size: heading[1].length <= 2 ? HEADING_SIZE : 13,
      })
      continue
    }
    const list = /^[-*+]\s+(.*)$/.exec(trimmed) ?? /^\d+\.\s+(.*)$/.exec(trimmed)
    if (list) {
      lines.push({ text: `• ${stripMarkdownInline(list[1] ?? '')}`, size: BODY_SIZE })
      continue
    }
    lines.push({ text: stripMarkdownInline(trimmed), size: BODY_SIZE })
  }
  return lines
}

function stripMarkdownInline(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

function wrapPdfLines(lines: PdfLine[]): PdfLine[] {
  const maxChars = Math.max(24, Math.floor((PAGE_WIDTH - MARGIN * 2) / (BODY_SIZE * CHAR_WIDTH)))
  const wrapped: PdfLine[] = []
  for (const line of lines) {
    const text = line.text
    if (text.length <= maxChars) {
      wrapped.push(line)
      continue
    }
    const words = text.split(/\s+/)
    let current = ''
    for (const word of words) {
      const next = current ? `${current} ${word}` : word
      if (next.length > maxChars && current) {
        wrapped.push({ text: current, size: line.size })
        current = word
      } else {
        current = next
      }
    }
    if (current) wrapped.push({ text: current, size: line.size })
  }
  return wrapped
}

function pageContentStream(lines: PdfLine[]): string {
  const chunks: string[] = ['BT', '/F1 11 Tf']
  let positioned = false
  for (const line of lines) {
    if (!positioned) {
      chunks.push(
        `/F1 ${line.size} Tf`,
        `1 0 0 1 ${MARGIN} ${PAGE_HEIGHT - MARGIN} Tm`,
        `(${escapePdfText(line.text)}) Tj`
      )
      positioned = true
    } else {
      chunks.push(
        `/F1 ${line.size} Tf`,
        `0 ${-(line.size + LINE_GAP)} Td`,
        `(${escapePdfText(line.text)}) Tj`
      )
    }
  }
  chunks.push('ET')
  return chunks.join('\n')
}

function escapePdfText(value: string): string {
  let result = ''
  for (const char of latin1(value)) {
    if (char === '\\' || char === '(' || char === ')') {
      result += `\\${char}`
    } else {
      result += char
    }
  }
  return result
}

function latin1(value: string): string {
  return [...value].map((char) => (char.charCodeAt(0) <= 255 ? char : '?')).join('')
}

function assemblePdf(objects: string[]): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n')]
  const offsets = [0]
  let length = chunks[0].length
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(length)
    const body = encoder.encode(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`)
    chunks.push(body)
    length += body.length
  }
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n']
  for (let index = 1; index <= objects.length; index += 1) {
    xref.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`)
  }
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`)
  chunks.push(encoder.encode(xref.join('')))
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}
