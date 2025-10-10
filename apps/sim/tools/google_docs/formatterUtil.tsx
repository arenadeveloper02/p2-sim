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
  let currentIndex = startIndex ?? 1

  // Only add initial newline if starting at the beginning
  if (!startIndex || startIndex === 1) {
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: '\n',
      },
    })
    currentIndex += 1
  }

  const lines = markdown.split('\n')

  // Add centered title if provided
  if (title && title.trim().length > 0) {
    currentIndex = addCenteredTitle(requests, title, currentIndex)
  }

  let i = 0
  let listItems: Array<{ text: string; indentLevel: number; type: 'bullet' | 'numbered' }> = []
  let listStartIndex: number | null = null

  const flushListItems = () => {
    if (listItems.length > 0 && listStartIndex !== null) {
      currentIndex = addListBlockRequests(requests, listItems, listStartIndex)
      listItems = []
      listStartIndex = null
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmedLine = line.trim()

    // Check for markdown tables
    if (trimmedLine.startsWith('|') && i + 1 < lines.length) {
      const tableResult = processMarkdownTable(lines, i)
      if (tableResult) {
        flushListItems()
        currentIndex = addTableRequest(requests, tableResult, currentIndex)
        i = tableResult.endIndex + 1
        continue
      }
    }

    // Check for code blocks
    if (line.startsWith('```')) {
      flushListItems()
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
      flushListItems()
      const blockquoteText = line.substring(2)
      currentIndex = addBlockquoteRequest(requests, blockquoteText, currentIndex)
      i++
      continue
    }

    // Check for horizontal rules
    if (trimmedLine === '---' || trimmedLine === '***' || trimmedLine === '___') {
      flushListItems()
      currentIndex = addHorizontalRuleRequest(requests, currentIndex)
      i++
      continue
    }

    // Check for headings
    if (line.startsWith('#### ')) {
      flushListItems()
      currentIndex = addHeadingRequest(requests, line.substring(5), currentIndex, 'HEADING_4')
      i++
      continue
    }
    if (line.startsWith('### ')) {
      flushListItems()
      currentIndex = addHeadingRequest(requests, line.substring(4), currentIndex, 'HEADING_3')
      i++
      continue
    }
    if (line.startsWith('## ')) {
      flushListItems()
      currentIndex = addHeadingRequest(requests, line.substring(3), currentIndex, 'HEADING_2')
      i++
      continue
    }
    if (line.startsWith('# ')) {
      flushListItems()
      currentIndex = addHeadingRequest(requests, line.substring(2), currentIndex, 'HEADING_1')
      i++
      continue
    }

    // Check for task lists
    if (
      trimmedLine.startsWith('- [ ]') ||
      trimmedLine.startsWith('- [x]') ||
      trimmedLine.startsWith('- [X]')
    ) {
      flushListItems()
      const checked = trimmedLine.startsWith('- [x]') || trimmedLine.startsWith('- [X]')
      const taskText = trimmedLine.substring(5).trim()
      currentIndex = addTaskListRequest(requests, taskText, checked, currentIndex)
      i++
      continue
    }

    // Check for ordered lists (numbered)
    const numberedMatch = trimmedLine.match(/^(\d+)\.\s+(.*)/)
    if (numberedMatch) {
      const text = numberedMatch[2]
      const leadingSpaces = line.length - line.trimStart().length
      const indentLevel = Math.floor(leadingSpaces / 2)

      // Start new list block if this is a different type
      if (listItems.length > 0 && listItems[0].type !== 'numbered') {
        flushListItems()
      }

      if (listStartIndex === null) {
        listStartIndex = currentIndex
      }

      listItems.push({ text, indentLevel, type: 'numbered' })
      i++
      continue
    }

    // Check for bullet points (unordered lists)
    const bulletMatch = trimmedLine.match(/^[-*+]\s+(.*)/)
    if (bulletMatch) {
      const text = bulletMatch[1]
      const leadingSpaces = line.length - line.trimStart().length
      const indentLevel = Math.floor(leadingSpaces / 2)

      // Start new list block if this is a different type
      if (listItems.length > 0 && listItems[0].type !== 'bullet') {
        flushListItems()
      }

      if (listStartIndex === null) {
        listStartIndex = currentIndex
      }

      listItems.push({ text, indentLevel, type: 'bullet' })
      i++
      continue
    }

    // Empty line - breaks list blocks
    if (trimmedLine.length === 0) {
      flushListItems()
      currentIndex = addEmptyLineRequest(requests, currentIndex)
      i++
      continue
    }

    // Regular paragraph
    flushListItems()
    currentIndex = addParagraphWithFormattingRequest(requests, line, currentIndex)
    i++
  }

  // Flush any remaining list items
  flushListItems()
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

  if (startIndex + 1 >= lines.length) {
    return null
  }

  const separatorLine = lines[startIndex + 1].trim()
  if (!/^\|(?:\s*:?-+:?\s*\|)+$/.test(separatorLine)) {
    return null
  }

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

  const formattedTable = formatTableWithSpacing(tableLines)

  return {
    headers: [],
    rows: [[formattedTable]],
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
      if (col < row.length) {
        // Skip separator row (contains only dashes, colons, and spaces)
        if (!/^:?-+:?$/.test(row[col])) {
          maxWidth = Math.max(maxWidth, row[col].length)
        }
      }
    }
    colWidths.push(maxWidth)
  }

  // Calculate maximum line width (80 characters to prevent wrapping in Google Docs)
  const MAX_LINE_WIDTH = 80
  const PIPE_PADDING = 3 // ' | ' between columns
  const BORDER_CHARS = 4 // '| ' at start and ' |' at end
  const ROW_COL_WIDTH = 8 // Width for "Row" column in continuation segments (includes padding)

  // Determine column segments that fit within MAX_LINE_WIDTH
  const segments: number[][] = []
  let currentSegment: number[] = []
  let currentWidth = BORDER_CHARS // Start with '| ' and ' |'

  for (let col = 0; col < numCols; col++) {
    const colWidth = colWidths[col]
    const additionalWidth = colWidth + (currentSegment.length > 0 ? PIPE_PADDING : 0)

    // For non-first segments, account for the "Row" column
    const isFirstSegment = segments.length === 0 && currentSegment.length === 0
    const extraWidth = isFirstSegment ? 0 : ROW_COL_WIDTH + PIPE_PADDING

    // Check if adding this column exceeds the limit
    if (currentWidth + additionalWidth + extraWidth > MAX_LINE_WIDTH && currentSegment.length > 0) {
      // Save current segment and start new one
      segments.push([...currentSegment])
      currentSegment = [col]
      currentWidth = BORDER_CHARS + colWidth + ROW_COL_WIDTH + PIPE_PADDING // Include row column for new segment
    } else {
      currentSegment.push(col)
      currentWidth += additionalWidth
    }
  }

  // Add the last segment
  if (currentSegment.length > 0) {
    segments.push(currentSegment)
  }

  // Format each segment vertically
  const allFormattedLines: string[] = []

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const segment = segments[segIdx]

    // Add segment header if not the first segment
    if (segIdx > 0) {
      allFormattedLines.push('') // Empty line between segments
      allFormattedLines.push('') // Another empty line for spacing
      const colStart = segment[0] + 1
      const colEnd = segment[segment.length - 1] + 1
      allFormattedLines.push(`Columns ${colStart}-${colEnd}:`)
    }

    // For continuation segments, add a "Row" identifier column
    const needsRowColumn = segIdx > 0
    const rowColWidth = needsRowColumn ? 5 : 0 // Width for "Row" text

    // Format each row in this segment
    for (let rowIdx = 0; rowIdx < allRows.length; rowIdx++) {
      const row = allRows[rowIdx]
      const cells: string[] = []

      // Add row identifier for continuation segments
      if (needsRowColumn) {
        if (rowIdx === 0) {
          // Header row
          cells.push('Row'.padEnd(rowColWidth, ' '))
        } else if (rowIdx === 1) {
          // Separator row
          cells.push('-'.repeat(rowColWidth))
        } else {
          // Data rows - show row number
          cells.push(`${rowIdx - 1}`.padEnd(rowColWidth, ' '))
        }
      }

      for (const col of segment) {
        const cellContent = col < row.length ? row[col] : ''
        const width = colWidths[col]

        // Check if this is the separator row
        if (/^:?-+:?$/.test(cellContent)) {
          // Create separator with proper alignment indicators
          let separator = ''
          if (cellContent.startsWith(':') && cellContent.endsWith(':')) {
            // Center aligned
            separator = `:${'-'.repeat(Math.max(0, width - 2))}:`
          } else if (cellContent.endsWith(':')) {
            // Right aligned
            separator = `${'-'.repeat(Math.max(0, width - 1))}:`
          } else if (cellContent.startsWith(':')) {
            // Left aligned
            separator = `:${'-'.repeat(Math.max(0, width - 1))}`
          } else {
            // Default (left aligned)
            separator = '-'.repeat(width)
          }
          cells.push(separator)
        } else {
          // Regular cell - pad to column width
          cells.push(cellContent.padEnd(width, ' '))
        }
      }

      // Join cells with proper spacing
      allFormattedLines.push(`| ${cells.join(' | ')} |`)
    }
  }

  return allFormattedLines.join('\n')
}

function addCodeBlockRequest(
  requests: Array<Record<string, any>>,
  code: string,
  language: string,
  index: number
): number {
  requests.push({
    insertText: {
      location: { index },
      text: `${code}\n`,
    },
  })

  requests.push({
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
  })

  return index + code.length + 1
}

function addBlockquoteRequest(
  requests: Array<Record<string, any>>,
  text: string,
  index: number
): number {
  requests.push({
    insertText: {
      location: { index },
      text: `${text}\n`,
    },
  })

  requests.push({
    updateParagraphStyle: {
      range: {
        startIndex: index,
        endIndex: index + text.length + 1,
      },
      paragraphStyle: {
        indentStart: { magnitude: 36, unit: 'PT' },
        borderLeft: {
          color: { color: { rgbColor: { red: 0.8, green: 0.8, blue: 0.8 } } },
          width: { magnitude: 3, unit: 'PT' },
          padding: { magnitude: 8, unit: 'PT' },
          dashStyle: 'SOLID',
        },
      },
      fields: 'indentStart,borderLeft',
    },
  })

  // Only apply italic style if there's actual text content
  if (text.length > 0) {
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: index,
          endIndex: index + text.length,
        },
        textStyle: { italic: true },
        fields: 'italic',
      },
    })
  }

  return index + text.length + 1
}

function addHorizontalRuleRequest(requests: Array<Record<string, any>>, index: number): number {
  // Insert a newline for the border to apply to
  requests.push({
    insertText: {
      location: { index },
      text: '\n',
    },
  })

  // Apply paragraph border with dashed style
  requests.push({
    updateParagraphStyle: {
      range: {
        startIndex: index,
        endIndex: index + 1,
      },
      paragraphStyle: {
        borderBottom: {
          color: {
            color: {
              rgbColor: {
                red: 0.5,
                green: 0.5,
                blue: 0.5,
              },
            },
          },
          width: {
            magnitude: 1,
            unit: 'PT',
          },
          padding: {
            magnitude: 0,
            unit: 'PT',
          },
          dashStyle: 'DASH',
        },
      },
      fields: 'borderBottom',
    },
  })

  return index + 1
}

function addListBlockRequests(
  requests: Array<Record<string, any>>,
  listItems: Array<{ text: string; indentLevel: number; type: 'bullet' | 'numbered' }>,
  startIndex: number
): number {
  if (listItems.length === 0) return startIndex

  const listType = listItems[0].type
  let currentIndex = startIndex
  let totalTabs = 0
  const allFormatRequests: Array<{ range: FormatRange; index: number }> = []
  const allLinkRequests: Array<{ range: LinkRange; index: number }> = []

  // First, insert all the text for all list items
  for (const item of listItems) {
    const cleanTextBuilder: string[] = []
    const formatRanges: FormatRange[] = []
    const linkRanges: LinkRange[] = []

    parseInlineFormatting(item.text, cleanTextBuilder, formatRanges, linkRanges)
    const cleanText = cleanTextBuilder.join('')

    // Add tab characters for nesting level
    const tabs = '\t'.repeat(item.indentLevel)
    const textWithTabs = tabs + cleanText
    totalTabs += item.indentLevel

    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: `${textWithTabs}\n`,
      },
    })

    // Collect formatting requests with adjusted positions
    for (const range of formatRanges) {
      allFormatRequests.push({
        range: {
          ...range,
          start: range.start + item.indentLevel,
          end: range.end + item.indentLevel,
        },
        index: currentIndex,
      })
    }

    for (const range of linkRanges) {
      allLinkRequests.push({
        range: {
          ...range,
          start: range.start + item.indentLevel,
          end: range.end + item.indentLevel,
        },
        index: currentIndex,
      })
    }

    currentIndex += textWithTabs.length + 1
  }

  // Apply all formatting
  for (const { range, index } of allFormatRequests) {
    const formatStart = index + range.start
    const formatEnd = index + range.end

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

  for (const { range, index } of allLinkRequests) {
    const formatStart = index + range.start
    const formatEnd = index + range.end
    requests.push({
      updateTextStyle: {
        range: { startIndex: formatStart, endIndex: formatEnd },
        textStyle: { link: { url: range.url } },
        fields: 'link',
      },
    })
  }

  // Apply bullets to the entire range once
  const bulletPreset =
    listType === 'bullet' ? 'BULLET_DISC_CIRCLE_SQUARE' : 'NUMBERED_DECIMAL_ALPHA_ROMAN'

  requests.push({
    createParagraphBullets: {
      range: {
        startIndex: startIndex,
        endIndex: currentIndex,
      },
      bulletPreset,
    },
  })

  // After createParagraphBullets, tabs are consumed and the document is shorter
  // Return the adjusted index (subtract the number of tab characters)
  return currentIndex - totalTabs
}

function addNumberedListRequest(
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

  // Add tab characters for nesting level
  const tabs = '\t'.repeat(indentLevel)
  const textWithTabs = tabs + cleanText

  requests.push({
    insertText: {
      location: { index },
      text: `${textWithTabs}\n`,
    },
  })

  // Adjust format ranges to account for the tabs
  const adjustedFormatRanges = formatRanges.map((range) => ({
    ...range,
    start: range.start + indentLevel,
    end: range.end + indentLevel,
  }))

  const adjustedLinkRanges = linkRanges.map((range) => ({
    ...range,
    start: range.start + indentLevel,
    end: range.end + indentLevel,
  }))

  applyInlineFormatting(requests, adjustedFormatRanges, adjustedLinkRanges, index)

  requests.push({
    createParagraphBullets: {
      range: {
        startIndex: index,
        endIndex: index + textWithTabs.length + 1,
      },
      bulletPreset: 'NUMBERED_DECIMAL_ALPHA_ROMAN',
    },
  })

  return index + textWithTabs.length + 1
}

function addTaskListRequest(
  requests: Array<Record<string, any>>,
  text: string,
  checked: boolean,
  index: number
): number {
  const prefix = checked ? '☑ ' : '☐ '
  const fullText = prefix + text

  requests.push({
    insertText: {
      location: { index },
      text: `${fullText}\n`,
    },
  })

  if (checked) {
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: index + prefix.length,
          endIndex: index + fullText.length,
        },
        textStyle: { strikethrough: true },
        fields: 'strikethrough',
      },
    })
  }

  return index + fullText.length + 1
}

function addCenteredTitle(
  requests: Array<Record<string, any>>,
  title: string,
  index: number
): number {
  requests.push({
    insertText: {
      location: { index },
      text: `${title}\n\n`,
    },
  })

  requests.push({
    updateParagraphStyle: {
      range: {
        startIndex: index,
        endIndex: index + title.length + 1,
      },
      paragraphStyle: {
        namedStyleType: 'TITLE',
        alignment: 'CENTER',
      },
      fields: 'namedStyleType,alignment',
    },
  })

  return index + title.length + 2
}

function addHeadingRequest(
  requests: Array<Record<string, any>>,
  text: string,
  index: number,
  headingType: string
): number {
  requests.push({
    insertText: {
      location: { index },
      text: `${text}\n`,
    },
  })

  requests.push({
    updateParagraphStyle: {
      range: {
        startIndex: index,
        endIndex: index + text.length + 1,
      },
      paragraphStyle: {
        namedStyleType: headingType,
      },
      fields: 'namedStyleType',
    },
  })

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

  // Add tab characters for nesting level
  const tabs = '\t'.repeat(indentLevel)
  const textWithTabs = tabs + cleanText

  requests.push({
    insertText: {
      location: { index },
      text: `${textWithTabs}\n`,
    },
  })

  // Adjust format ranges to account for the tabs
  const adjustedFormatRanges = formatRanges.map((range) => ({
    ...range,
    start: range.start + indentLevel,
    end: range.end + indentLevel,
  }))

  const adjustedLinkRanges = linkRanges.map((range) => ({
    ...range,
    start: range.start + indentLevel,
    end: range.end + indentLevel,
  }))

  applyInlineFormatting(requests, adjustedFormatRanges, adjustedLinkRanges, index)

  requests.push({
    createParagraphBullets: {
      range: {
        startIndex: index,
        endIndex: index + textWithTabs.length + 1,
      },
      bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
    },
  })

  return index + textWithTabs.length + 1
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

  requests.push({
    insertText: {
      location: { index: startIndex },
      text: `${cleanText}\n`,
    },
  })

  applyInlineFormatting(requests, formatRanges, linkRanges, startIndex)

  return startIndex + cleanText.length + 1
}

function addEmptyLineRequest(requests: Array<Record<string, any>>, index: number): number {
  requests.push({
    insertText: {
      location: { index },
      text: '\n',
    },
  })

  // Apply default paragraph style to prevent UNIT_UNSPECIFIED errors
  requests.push({
    updateParagraphStyle: {
      range: {
        startIndex: index,
        endIndex: index + 1,
      },
      paragraphStyle: {
        namedStyleType: 'NORMAL_TEXT',
      },
      fields: 'namedStyleType',
    },
  })

  return index + 1
}

function addTableRequest(
  requests: Array<Record<string, any>>,
  tableData: TableData,
  index: number
): number {
  const formattedTable = tableData.rows[0][0]

  requests.push({
    insertText: {
      location: { index },
      text: `${formattedTable}\n`,
    },
  })

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
        i++
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
