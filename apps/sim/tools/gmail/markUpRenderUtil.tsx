import { encode } from 'entities'
import { marked, type Token, type Tokens } from 'marked'
import sanitizeHtml from 'sanitize-html'

// Utility to escape HTML content
const escapeHtml = (text: string): string => encode(text)

// Utility to sanitize HTML content
const sanitizeHtmlContent = (html: string): string =>
  sanitizeHtml(html, {
    allowedTags: [
      'html',
      'head',
      'meta',
      'title',
      'style',
      'body',
      'header',
      'footer',
      'section',
      'p',
      'h1',
      'h2',
      'h3',
      'h4',
      'ul',
      'ol',
      'li',
      'pre',
      'code',
      'strong',
      'em',
      'blockquote',
      'hr',
      'a',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'img',
    ],
    allowedAttributes: {
      '*': ['style'],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
      table: ['border', 'cellpadding'],
    },
  })

// Extract content from Markdown code fences or return raw content
export function extractContentFromAgentResponse(response: string): string {
  const htmlMatch = response.match(/```html\n([\s\S]*?)\n```/)
  if (htmlMatch?.[1]) {
    return htmlMatch[1].trim()
  }
  return response
}

// Helper function to recursively process tokens with inline formatting
function processInlineTokens(tokens: Token[]): string {
  return tokens
    .map((token) => {
      if (token.type === 'strong') {
        return `<strong style="font-weight: 600; color: #111111;">${processInlineTokens((token as Tokens.Strong).tokens)}</strong>`
      }
      if (token.type === 'em') {
        return `<em style="font-style: italic; color: #333333;">${processInlineTokens((token as Tokens.Em).tokens)}</em>`
      }
      if (token.type === 'codespan') {
        return `<code style="font-family: monospace; font-size: 14px; background-color: #f4f4f4; padding: 2px 4px; border-radius: 3px; color: #333333;">${escapeHtml((token as Tokens.Codespan).text)}</code>`
      }
      if (token.type === 'link') {
        const linkToken = token as Tokens.Link
        return `<a href="${linkToken.href || '#'}" style="color: #1a73e8; text-decoration: underline; word-break: break-all;" target="_blank" rel="noopener noreferrer">${processInlineTokens(linkToken.tokens)}</a>`
      }
      if (token.type === 'text') {
        return (token as Tokens.Text).text
      }
      if (token.type === 'br') {
        return '<br />'
      }
      return token.raw || ''
    })
    .join('')
}

// Function to render content to HTML string (server or client)
export function renderAgentResponseToString(content: string): string {
  // Extract content if wrapped in Markdown code fences
  const extractedContent = extractContentFromAgentResponse(content)

  // If content is HTML, return it directly (optionally sanitized)
  if (
    extractedContent.trim().startsWith('<!DOCTYPE html>') ||
    extractedContent.trim().startsWith('<html')
  ) {
    return typeof sanitizeHtml === 'function'
      ? sanitizeHtmlContent(extractedContent)
      : extractedContent
  }

  // Configure marked with custom renderer for styling
  const renderer = new marked.Renderer()
  renderer.paragraph = ({ tokens }: Tokens.Paragraph): string => {
    const text = processInlineTokens(tokens)
    return `<p style="font-family: Arial, sans-serif; font-size: 16px; color: #333333; line-height: 1.5; margin: 0 0 16px 0;">${text}</p>`
  }
  renderer.heading = ({ tokens, depth }: Tokens.Heading): string => {
    const level = depth
    const text = processInlineTokens(tokens)
    const sizes = { 1: '24px', 2: '20px', 3: '18px', 4: '16px' }
    return `<h${level} style="font-family: Arial, sans-serif; font-size: ${
      sizes[level as keyof typeof sizes] || '16px'
    }; font-weight: 600; color: #111111; margin: ${
      level === 1 ? '16px' : level === 2 ? '12px' : '10px'
    } 0;">${text}</h${level}>`
  }
  renderer.list = ({ items, ordered, start }: Tokens.List): string => {
    const body = items.map((item) => renderer.listitem(item)).join('')
    return ordered
      ? `<ol style="font-family: Arial, sans-serif; font-size: 16px; color: #333333; list-style-type: decimal; padding-left: 20px; margin: 0 0 16px 0;">${body}</ol>`
      : `<ul style="font-family: Arial, sans-serif; font-size: 16px; color: #333333; list-style-type: disc; padding-left: 20px; margin: 0 0 16px 0;">${body}</ul>`
  }
  renderer.listitem = ({ tokens }: Tokens.ListItem): string => {
    const content = processInlineTokens(tokens)
    return `<li style="font-family: Arial, sans-serif; font-size: 16px; color: #333333; margin-bottom: 8px;">${content}</li>`
  }
  renderer.code = ({ text, lang, escaped }: Tokens.Code): string =>
    `<pre style="font-family: monospace; font-size: 14px; background-color: #f4f4f4; padding: 12px; border-radius: 4px; overflow-x: auto; color: #333333; margin: 0 0 16px 0;"><code style="font-family: monospace; font-size: 14px; color: #333333;">${
      escaped ? text : escapeHtml(text)
    }</code></pre>`
  renderer.codespan = ({ text }: Tokens.Codespan): string =>
    `<code style="font-family: monospace; font-size: 14px; background-color: #f4f4f4; padding: 2px 4px; border-radius: 3px; color: #333333;">${escapeHtml(
      text
    )}</code>`
  renderer.strong = ({ tokens }: Tokens.Strong): string => {
    const text = processInlineTokens(tokens)
    return `<strong style="font-weight: 600; color: #111111;">${text}</strong>`
  }
  renderer.em = ({ tokens }: Tokens.Em): string => {
    const text = processInlineTokens(tokens)
    return `<em style="font-style: italic; color: #333333;">${text}</em>`
  }
  renderer.blockquote = ({ tokens }: Tokens.Blockquote): string => {
    const quote = processInlineTokens(tokens)
    return `<blockquote style="font-family: Arial, sans-serif; font-size: 16px; color: #555555; border-left: 4px solid #cccccc; padding-left: 12px; margin: 0 0 16px 0; font-style: italic;">${quote}</blockquote>`
  }
  renderer.hr = (): string => `<hr style="border: 1px solid #e5e7eb; margin: 16px 0;" />`
  renderer.link = ({ href, title, tokens }: Tokens.Link): string => {
    const text = processInlineTokens(tokens)
    return `<a href="${href || '#'}" style="color: #1a73e8; text-decoration: underline; word-break: break-all;" target="_blank" rel="noopener noreferrer">${text}</a>`
  }
  renderer.table = ({ header, rows }: Tokens.Table): string => {
    const headerContent = header.map((cell) => renderer.tablecell(cell)).join('')
    const bodyContent = rows
      .map((row) =>
        renderer.tablerow({ text: row.map((cell) => renderer.tablecell(cell)).join('') })
      )
      .join('')
    return `<table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; margin: 16px 0; font-family: Arial, sans-serif; font-size: 14px;"><thead style="background-color: #f4f4f4; text-align: left;">${headerContent}</thead><tbody style="border-top: 1px solid #e5e7eb;">${bodyContent}</tbody></table>`
  }
  renderer.tablerow = ({ text }: Tokens.TableRow<string>): string =>
    `<tr style="border-bottom: 1px solid #e5e7eb;">${text}</tr>`
  renderer.tablecell = ({ tokens, header, align }: Tokens.TableCell): string => {
    const text = tokens ? processInlineTokens(tokens) : ''
    const style = `border: 1px solid #e5e7eb; padding: 8px; color: #333333; ${
      align ? `text-align: ${align};` : ''
    } ${header ? 'font-weight: 500;' : 'word-break: break-word;'}`
    return header ? `<th style="${style}">${text}</th>` : `<td style="${style}">${text}</td>`
  }
  renderer.image = ({ href, title, text }: Tokens.Image): string =>
    `<img src="${href || ''}" alt="${text || 'Image'}" style="max-width: 100%; height: auto; margin: 12px 0; border-radius: 4px;" />`

  marked.use({ renderer, gfm: true })

  const markdownHtml = marked(extractedContent)

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      ${markdownHtml}
    </body>
    </html>
  `
}
