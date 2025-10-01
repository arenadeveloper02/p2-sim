interface LinkRange {
  start: number
  end: number
  url: string
}

interface FormatRange {
  start: number
  end: number
  type: 'bold' | 'italic' | 'strikethrough' | 'code'
}

interface TableData {
  headers: string[]
  rows: string[][]
  endIndex: number
}

export function convertMarkdownToGoogleDocsRequests(
  markdown: string,
  title?: string,
  startIndex?: number
): Array<Record<string, any>> {
  const requests: Array<Record<string, any>> = []
  // If startIndex is provided, use it; otherwise default to 1 for new documents
  let currentIndex = startIndex ?? 1

  // Only add initial newline if starting at the beginning of the document
  if (!startIndex || startIndex === 1) {
    const insertNewline: Record<string, any> = {
      insertText: {
        location: { index: currentIndex },
        text: '\n',
      },
    }
    requests.push(insertNewline)
    currentIndex += 1
  }

  // Split content into lines
  const lines = markdown.split('\n')

  // Add centered title if provided
  if (title && title.trim().length > 0) {
    currentIndex = addCenteredTitle(requests, title, currentIndex)
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Check for markdown tables
    if (line.trim().startsWith('|') && i + 1 < lines.length) {
      const tableResult = processMarkdownTable(lines, i)
      if (tableResult) {
        currentIndex = addTableRequest(requests, tableResult, currentIndex)
        i = tableResult.endIndex + 1
        continue
      }
    }

    // Check for code blocks
    if (line.startsWith('```')) {
      const codeBlockResult = processCodeBlock(lines, i)
      currentIndex = addCodeBlockRequest(
        requests,
        codeBlockResult.code,
        codeBlockResult.language,
        currentIndex
      )
      i = codeBlockResult.endIndex + 1
      continue
    }

    // Check for blockquotes
    if (line.startsWith('> ')) {
      const blockquoteText = line.substring(2)
      currentIndex = addBlockquoteRequest(requests, blockquoteText, currentIndex)
    }
    // Check for horizontal rules
    else if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
      currentIndex = addHorizontalRuleRequest(requests, currentIndex)
    }
    // Check for ordered lists
    else if (/^\d+\.\s/.test(line)) {
      const listText = line.replace(/^\d+\.\s/, '')
      currentIndex = addNumberedListRequest(requests, listText, currentIndex)
    }
    // Check for headings
    else if (line.startsWith('#### ')) {
      const headingText = line.substring(5)
      currentIndex = addHeadingRequest(requests, headingText, currentIndex, 'HEADING_4')
    } else if (line.startsWith('### ')) {
      const headingText = line.substring(4)
      currentIndex = addHeadingRequest(requests, headingText, currentIndex, 'HEADING_3')
    } else if (line.startsWith('## ')) {
      const headingText = line.substring(3)
      currentIndex = addHeadingRequest(requests, headingText, currentIndex, 'HEADING_2')
    } else if (line.startsWith('# ')) {
      const headingText = line.substring(2)
      currentIndex = addHeadingRequest(requests, headingText, currentIndex, 'HEADING_1')
    }
    // Check for task lists (must come before bullet points)
    else if (line.startsWith('- [ ]') || line.startsWith('- [x]') || line.startsWith('- [X]')) {
      const checked = line.startsWith('- [x]') || line.startsWith('- [X]')
      const taskText = line.substring(5).trim()
      currentIndex = addTaskListRequest(requests, taskText, checked, currentIndex)
    }
    // Check for bullet points with '- ' or '* ' (but not '**' which is bold)
    else if (line.startsWith('- ') || (line.startsWith('* ') && !line.startsWith('** '))) {
      const bulletText = line.substring(2)
      currentIndex = addBulletPointRequest(requests, bulletText, currentIndex)
    }
    // Empty line
    else if (line.trim().length === 0) {
      currentIndex = addEmptyLineRequest(requests, currentIndex)
    }
    // Regular paragraph with inline formatting
    else {
      currentIndex = addParagraphWithFormattingRequest(requests, line, currentIndex)
    }

    i++
  }

  return requests
}

function processCodeBlock(
  lines: string[],
  startIndex: number
): { code: string; language: string; endIndex: number } {
  const firstLine = lines[startIndex]
  const language = firstLine.substring(3).trim() || 'plain'
  const codeLines: string[] = []
  let i = startIndex + 1

  while (i < lines.length && !lines[i].startsWith('```')) {
    codeLines.push(lines[i])
    i++
  }

  return {
    code: codeLines.join('\n'),
    language,
    endIndex: i,
  }
}

function processMarkdownTable(lines: string[], startIndex: number): TableData | null {
  const firstLine = lines[startIndex].trim()
  if (!firstLine.startsWith('|') || !firstLine.endsWith('|')) {
    return null
  }

  // Check if next line is separator
  if (startIndex + 1 >= lines.length) {
    return null
  }

  const separatorLine = lines[startIndex + 1].trim()
  if (!/^\|(?:\s*:?-+:?\s*\|)+$/.test(separatorLine)) {
    return null
  }

  // Collect all table lines (header + separator + data rows)
  const tableLines: string[] = [firstLine, separatorLine]
  let i = startIndex + 2

  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line.startsWith('|') || !line.endsWith('|')) {
      break
    }
    tableLines.push(line)
    i++
  }

  // Format the table with proper spacing
  const formattedTable = formatTableWithSpacing(tableLines)

  return {
    headers: [], // Not used in new approach
    rows: [[formattedTable]], // Store formatted table as single cell
    endIndex: i - 1,
  }
}

function formatTableWithSpacing(tableLines: string[]): string {
  // Parse all rows to find column widths
  const allRows = tableLines.map((line) =>
    line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
  )

  // Calculate max width for each column
  const numCols = allRows[0].length
  const colWidths: number[] = []

  for (let col = 0; col < numCols; col++) {
    let maxWidth = 0
    for (const row of allRows) {
      if (col < row.length && row[col] !== '') {
        // Check if it's the separator row (contains only dashes, colons, and spaces)
        if (!/^:?-+:?$/.test(row[col])) {
          maxWidth = Math.max(maxWidth, row[col].length)
        }
      }
    }
    colWidths.push(maxWidth)
  }

  // Format each row with proper spacing
  const formattedLines: string[] = []

  for (let rowIdx = 0; rowIdx < allRows.length; rowIdx++) {
    const row = allRows[rowIdx]
    const cells: string[] = []

    for (let col = 0; col < numCols; col++) {
      const cellContent = col < row.length ? row[col] : ''

      // Check if this is the separator row
      if (rowIdx === 1 && /^:?-+:?$/.test(cellContent)) {
        cells.push('-'.repeat(colWidths[col]))
      } else {
        cells.push(cellContent.padEnd(colWidths[col], ' '))
      }
    }

    formattedLines.push(`|·${cells.join('·|·')}·|`)
  }

  return formattedLines.join('\n')
}

function addCodeBlockRequest(
  requests: Array<Record<string, any>>,
  code: string,
  language: string,
  index: number
): number {
  const insertText: Record<string, any> = {
    insertText: {
      location: { index },
      text: `${code}\n`,
    },
  }
  requests.push(insertText)

  // Apply code block styling (monospace font and gray background)
  const codeStyle: Record<string, any> = {
    updateTextStyle: {
      range: {
        startIndex: index,
        endIndex: index + code.length,
      },
      textStyle: {
        weightedFontFamily: { fontFamily: 'Courier New' },
        fontSize: { magnitude: 10, unit: 'PT' },
        backgroundColor: { color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } } },
      },
      fields: 'weightedFontFamily,fontSize,backgroundColor',
    },
  }
  requests.push(codeStyle)

  return index + code.length + 1
}

function addBlockquoteRequest(
  requests: Array<Record<string, any>>,
  text: string,
  index: number
): number {
  const insertText: Record<string, any> = {
    insertText: {
      location: { index },
      text: `${text}\n`,
    },
  }
  requests.push(insertText)

  // Apply indentation and italic style for blockquote
  const blockquoteStyle: Record<string, any> = {
    updateParagraphStyle: {
      range: {
        startIndex: index,
        endIndex: index + text.length,
      },
      paragraphStyle: {
        indentStart: { magnitude: 36, unit: 'PT' },
        borderLeft: {
          color: { color: { rgbColor: { red: 0.8, green: 0.8, blue: 0.8 } } },
          width: { magnitude: 3, unit: 'PT' },
          dashStyle: 'SOLID',
        },
      },
      fields: 'indentStart,borderLeft',
    },
  }
  requests.push(blockquoteStyle)

  const italicStyle: Record<string, any> = {
    updateTextStyle: {
      range: {
        startIndex: index,
        endIndex: index + text.length,
      },
      textStyle: { italic: true },
      fields: 'italic',
    },
  }
  requests.push(italicStyle)

  return index + text.length + 1
}

function addHorizontalRuleRequest(requests: Array<Record<string, any>>, index: number): number {
  // Insert a horizontal rule as a series of dashes with bottom border
  const ruleText = '_______________________________________________'
  const insertText: Record<string, any> = {
    insertText: {
      location: { index },
      text: `${ruleText}\n`,
    },
  }
  requests.push(insertText)

  const ruleStyle: Record<string, any> = {
    updateParagraphStyle: {
      range: {
        startIndex: index,
        endIndex: index + ruleText.length,
      },
      paragraphStyle: {
        borderBottom: {
          color: { color: { rgbColor: { red: 0.7, green: 0.7, blue: 0.7 } } },
          width: { magnitude: 1, unit: 'PT' },
          dashStyle: 'SOLID',
        },
      },
      fields: 'borderBottom',
    },
  }
  requests.push(ruleStyle)

  return index + ruleText.length + 1
}

function addNumberedListRequest(
  requests: Array<Record<string, any>>,
  text: string,
  index: number
): number {
  const cleanTextBuilder: string[] = []
  const formatRanges: FormatRange[] = []
  const linkRanges: LinkRange[] = []

  parseInlineFormatting(text, cleanTextBuilder, formatRanges, linkRanges)
  const cleanText = cleanTextBuilder.join('')

  const insertText: Record<string, any> = {
    insertText: {
      location: { index },
      text: `${cleanText}\n`,
    },
  }
  requests.push(insertText)

  applyInlineFormatting(requests, formatRanges, linkRanges, index)

  const numberedListRequest: Record<string, any> = {
    createParagraphBullets: {
      range: {
        startIndex: index,
        endIndex: index + cleanText.length + 1,
      },
      bulletPreset: 'NUMBERED_DECIMAL_ALPHA_ROMAN',
    },
  }
  requests.push(numberedListRequest)

  return index + cleanText.length + 1
}

function addTaskListRequest(
  requests: Array<Record<string, any>>,
  text: string,
  checked: boolean,
  index: number
): number {
  const prefix = checked ? '☑ ' : '☐ '
  const fullText = prefix + text

  const insertText: Record<string, any> = {
    insertText: {
      location: { index },
      text: `${fullText}\n`,
    },
  }
  requests.push(insertText)

  if (checked) {
    const strikeStyle: Record<string, any> = {
      updateTextStyle: {
        range: {
          startIndex: index + prefix.length,
          endIndex: index + fullText.length,
        },
        textStyle: { strikethrough: true },
        fields: 'strikethrough',
      },
    }
    requests.push(strikeStyle)
  }

  return index + fullText.length + 1
}

function addCenteredTitle(
  requests: Array<Record<string, any>>,
  title: string,
  index: number
): number {
  const insertText: Record<string, any> = {
    insertText: {
      location: { index },
      text: `${title}\n\n`,
    },
  }
  requests.push(insertText)

  const titleStyle: Record<string, any> = {
    updateParagraphStyle: {
      range: {
        startIndex: index + 1,
        endIndex: index + 1 + title.length,
      },
      paragraphStyle: {
        namedStyleType: 'TITLE',
        alignment: 'CENTER',
      },
      fields: 'namedStyleType,alignment',
    },
  }
  requests.push(titleStyle)

  return index + title.length + 3
}

function addHeadingRequest(
  requests: Array<Record<string, any>>,
  text: string,
  index: number,
  headingType: string
): number {
  const insertText: Record<string, any> = {
    insertText: {
      location: { index },
      text: `${text}\n`,
    },
  }
  requests.push(insertText)

  const paragraphStyle: Record<string, any> = {
    updateParagraphStyle: {
      range: {
        startIndex: index,
        endIndex: index + text.length,
      },
      paragraphStyle: {
        namedStyleType: headingType,
      },
      fields: 'namedStyleType',
    },
  }
  requests.push(paragraphStyle)

  return index + text.length + 1
}

function addBulletPointRequest(
  requests: Array<Record<string, any>>,
  text: string,
  index: number,
  indentLevel = 0
): number {
  const cleanTextBuilder: string[] = []
  const formatRanges: FormatRange[] = []
  const linkRanges: LinkRange[] = []

  parseInlineFormatting(text, cleanTextBuilder, formatRanges, linkRanges)
  const cleanText = cleanTextBuilder.join('')

  const insertText: Record<string, any> = {
    insertText: {
      location: { index },
      text: `${cleanText}\n`,
    },
  }
  requests.push(insertText)

  applyInlineFormatting(requests, formatRanges, linkRanges, index)

  const bulletRequest: Record<string, any> = {
    createParagraphBullets: {
      range: {
        startIndex: index,
        endIndex: index + cleanText.length + 1,
      },
      bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
    },
  }
  requests.push(bulletRequest)

  // Apply indentation if nested
  if (indentLevel > 0) {
    const indentRequest: Record<string, any> = {
      updateParagraphStyle: {
        range: {
          startIndex: index,
          endIndex: index + cleanText.length + 1,
        },
        paragraphStyle: {
          indentStart: { magnitude: 36 * indentLevel, unit: 'PT' },
        },
        fields: 'indentStart',
      },
    }
    requests.push(indentRequest)
  }

  return index + cleanText.length + 1
}

function addParagraphWithFormattingRequest(
  requests: Array<Record<string, any>>,
  line: string,
  startIndex: number
): number {
  const cleanTextBuilder: string[] = []
  const formatRanges: FormatRange[] = []
  const linkRanges: LinkRange[] = []

  parseInlineFormatting(line, cleanTextBuilder, formatRanges, linkRanges)
  const cleanText = cleanTextBuilder.join('')

  const insertText: Record<string, any> = {
    insertText: {
      location: { index: startIndex },
      text: `${cleanText}\n`,
    },
  }
  requests.push(insertText)

  applyInlineFormatting(requests, formatRanges, linkRanges, startIndex)

  return startIndex + cleanText.length + 1
}

function addEmptyLineRequest(requests: Array<Record<string, any>>, index: number): number {
  const insertText: Record<string, any> = {
    insertText: {
      location: { index },
      text: '\n',
    },
  }
  requests.push(insertText)
  return index + 1
}

function addTableRequest(
  requests: Array<Record<string, any>>,
  tableData: TableData,
  index: number
): number {
  // The formatted table is stored in rows[0][0]
  const formattedTable = tableData.rows[0][0]

  // Insert the formatted table as a code block
  requests.push({
    insertText: {
      location: { index },
      text: `${formattedTable}\n`,
    },
  })

  // Apply code block styling (monospace font and gray background)
  requests.push({
    updateTextStyle: {
      range: {
        startIndex: index,
        endIndex: index + formattedTable.length,
      },
      textStyle: {
        weightedFontFamily: { fontFamily: 'Courier New' },
        fontSize: { magnitude: 10, unit: 'PT' },
        backgroundColor: { color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } } },
      },
      fields: 'weightedFontFamily,fontSize,backgroundColor',
    },
  })

  return index + formattedTable.length + 1
}

function parseInlineFormatting(
  text: string,
  cleanTextBuilder: string[],
  formatRanges: FormatRange[],
  linkRanges: LinkRange[]
): void {
  let i = 0

  while (i < text.length) {
    // Check for links [text](url)
    const linkMatch = text.substring(i).match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      const linkText = linkMatch[1]
      const linkUrl = linkMatch[2]
      const linkStart = cleanTextBuilder.join('').length
      cleanTextBuilder.push(linkText)
      const linkEnd = cleanTextBuilder.join('').length
      linkRanges.push({ start: linkStart, end: linkEnd, url: linkUrl })
      i += linkMatch[0].length
      continue
    }

    // Check for inline code `code`
    if (text[i] === '`') {
      const codeStart = cleanTextBuilder.join('').length
      i++
      const codeChars: string[] = []
      while (i < text.length && text[i] !== '`') {
        codeChars.push(text[i])
        i++
      }
      if (i < text.length) {
        cleanTextBuilder.push(codeChars.join(''))
        const codeEnd = cleanTextBuilder.join('').length
        formatRanges.push({ start: codeStart, end: codeEnd, type: 'code' })
        i++ // skip closing `
      } else {
        cleanTextBuilder.push('`', ...codeChars)
      }
      continue
    }

    // Check for bold+italic ***text***
    if (text.substring(i).startsWith('***')) {
      const formatStart = cleanTextBuilder.join('').length
      i += 3
      const formatChars: string[] = []
      while (i + 2 < text.length && !text.substring(i).startsWith('***')) {
        formatChars.push(text[i])
        i++
      }
      if (text.substring(i).startsWith('***')) {
        cleanTextBuilder.push(formatChars.join(''))
        const formatEnd = cleanTextBuilder.join('').length
        formatRanges.push({ start: formatStart, end: formatEnd, type: 'bold' })
        formatRanges.push({ start: formatStart, end: formatEnd, type: 'italic' })
        i += 3
      } else {
        cleanTextBuilder.push('***', ...formatChars)
      }
      continue
    }

    // Check for bold **text**
    if (text.substring(i).startsWith('**')) {
      const formatStart = cleanTextBuilder.join('').length
      i += 2
      const formatChars: string[] = []
      while (i + 1 < text.length && !text.substring(i).startsWith('**')) {
        formatChars.push(text[i])
        i++
      }
      if (text.substring(i).startsWith('**')) {
        cleanTextBuilder.push(formatChars.join(''))
        const formatEnd = cleanTextBuilder.join('').length
        formatRanges.push({ start: formatStart, end: formatEnd, type: 'bold' })
        i += 2
      } else {
        cleanTextBuilder.push('**', ...formatChars)
      }
      continue
    }

    // Check for strikethrough ~~text~~
    if (text.substring(i).startsWith('~~')) {
      const formatStart = cleanTextBuilder.join('').length
      i += 2
      const formatChars: string[] = []
      while (i + 1 < text.length && !text.substring(i).startsWith('~~')) {
        formatChars.push(text[i])
        i++
      }
      if (text.substring(i).startsWith('~~')) {
        cleanTextBuilder.push(formatChars.join(''))
        const formatEnd = cleanTextBuilder.join('').length
        formatRanges.push({ start: formatStart, end: formatEnd, type: 'strikethrough' })
        i += 2
      } else {
        cleanTextBuilder.push('~~', ...formatChars)
      }
      continue
    }

    // Check for italic *text* or _text_
    if (text[i] === '*' || text[i] === '_') {
      const marker = text[i]
      const formatStart = cleanTextBuilder.join('').length
      i++
      const formatChars: string[] = []
      while (i < text.length && text[i] !== marker) {
        formatChars.push(text[i])
        i++
      }
      if (i < text.length && text[i] === marker) {
        cleanTextBuilder.push(formatChars.join(''))
        const formatEnd = cleanTextBuilder.join('').length
        formatRanges.push({ start: formatStart, end: formatEnd, type: 'italic' })
        i++
      } else {
        cleanTextBuilder.push(marker, ...formatChars)
      }
      continue
    }

    // Regular character
    cleanTextBuilder.push(text[i])
    i++
  }
}

function applyInlineFormatting(
  requests: Array<Record<string, any>>,
  formatRanges: FormatRange[],
  linkRanges: LinkRange[],
  startIndex: number
): void {
  // Apply format ranges
  for (const range of formatRanges) {
    const formatStart = startIndex + range.start
    const formatEnd = startIndex + range.end

    if (range.type === 'bold') {
      requests.push({
        updateTextStyle: {
          range: { startIndex: formatStart, endIndex: formatEnd },
          textStyle: { bold: true },
          fields: 'bold',
        },
      })
    } else if (range.type === 'italic') {
      requests.push({
        updateTextStyle: {
          range: { startIndex: formatStart, endIndex: formatEnd },
          textStyle: { italic: true },
          fields: 'italic',
        },
      })
    } else if (range.type === 'strikethrough') {
      requests.push({
        updateTextStyle: {
          range: { startIndex: formatStart, endIndex: formatEnd },
          textStyle: { strikethrough: true },
          fields: 'strikethrough',
        },
      })
    } else if (range.type === 'code') {
      requests.push({
        updateTextStyle: {
          range: { startIndex: formatStart, endIndex: formatEnd },
          textStyle: {
            weightedFontFamily: { fontFamily: 'Courier New' },
            backgroundColor: { color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } } },
          },
          fields: 'weightedFontFamily,backgroundColor',
        },
      })
    }
  }

  // Apply link ranges
  for (const linkRange of linkRanges) {
    const formatStart = startIndex + linkRange.start
    const formatEnd = startIndex + linkRange.end
    requests.push({
      updateTextStyle: {
        range: { startIndex: formatStart, endIndex: formatEnd },
        textStyle: { link: { url: linkRange.url } },
        fields: 'link',
      },
    })
  }
}
