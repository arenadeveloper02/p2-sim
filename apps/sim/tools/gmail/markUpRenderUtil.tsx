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
      'del',
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
      if (token.type === 'del') {
        return `<del style="text-decoration: line-through; color: #666666;">${processInlineTokens((token as Tokens.Del).tokens)}</del>`
      }
      if (token.type === 'codespan') {
        return `<code style="font-family: monospace; font-size: 14px; background-color: #f4f4f4; padding: 2px 4px; border-radius: 3px; color: #333333;">${escapeHtml((token as Tokens.Codespan).text)}</code>`
      }
      if (token.type === 'link') {
        const linkToken = token as Tokens.Link
        return `<a href="${linkToken.href || '#'}" style="color: #1a73e8; text-decoration: underline; word-break: break-all;" target="_blank" rel="noopener noreferrer">${processInlineTokens(linkToken.tokens)}</a>`
      }
      if (token.type === 'text') {
        return escapeHtml((token as Tokens.Text).text)
      }
      if (token.type === 'br') {
        return '<br />'
      }
      if (token.type === 'space') {
        return ' '
      }
      // Handle block-level tokens that might appear in lists
      if (token.type === 'list') {
        return renderList(token as Tokens.List)
      }
      if (token.type === 'paragraph') {
        return processInlineTokens((token as Tokens.Paragraph).tokens)
      }
      return token.raw || ''
    })
    .join('')
}

// Helper function to render lists (for nested list support)
function renderList(listToken: Tokens.List): string {
  const items = listToken.items
    .map((item) => {
      let content = ''

      if (item.tokens && item.tokens.length > 0) {
        // Process each token in the list item
        content = item.tokens
          .map((token) => {
            // For paragraphs in list items, extract and process inline tokens
            if (token.type === 'paragraph') {
              const paraToken = token as Tokens.Paragraph
              return processInlineTokens(paraToken.tokens)
            }
            // For text tokens with possible inline formatting
            if (token.type === 'text') {
              const textToken = token as Tokens.Text
              // If text token has nested tokens (formatted text), process them
              if ('tokens' in textToken && Array.isArray(textToken.tokens)) {
                return processInlineTokens(textToken.tokens)
              }
              return escapeHtml(textToken.text)
            }
            // For nested lists, render them properly
            if (token.type === 'list') {
              return renderList(token as Tokens.List)
            }
            // For inline elements that might appear at list item level
            if (
              token.type === 'strong' ||
              token.type === 'em' ||
              token.type === 'del' ||
              token.type === 'codespan' ||
              token.type === 'link'
            ) {
              return processInlineTokens([token])
            }
            // For other block elements, process normally
            return processTokens([token])
          })
          .join('')
      } else if (item.text) {
        content = escapeHtml(item.text)
      }

      return `<li style="font-family: Arial, sans-serif; font-size: 16px; color: #333333; margin-bottom: 8px; line-height: 1.5;">${content}</li>`
    })
    .join('')

  return listToken.ordered
    ? `<ol style="font-family: Arial, sans-serif; font-size: 16px; color: #333333; list-style-type: decimal; padding-left: 20px; margin: 8px 0 16px 0;">${items}</ol>`
    : `<ul style="font-family: Arial, sans-serif; font-size: 16px; color: #333333; list-style-type: disc; padding-left: 20px; margin: 8px 0 16px 0;">${items}</ul>`
}

// Process any token type (block or inline)
const processTokens = (tokens: Token[]): string => {
  return tokens
    .map((token) => {
      if (token.type === 'paragraph') {
        const text = processInlineTokens((token as Tokens.Paragraph).tokens)
        return `<p style="font-family: Arial, sans-serif; font-size: 16px; color: #333333; line-height: 1.5; margin: 0 0 16px 0;">${text}</p>`
      }
      if (token.type === 'list') {
        return renderList(token as Tokens.List)
      }
      if (token.type === 'heading') {
        const heading = token as Tokens.Heading
        const text = processInlineTokens(heading.tokens)
        const sizes = { 1: '24px', 2: '20px', 3: '18px', 4: '16px' }
        return `<h${heading.depth} style="font-family: Arial, sans-serif; font-size: ${
          sizes[heading.depth as keyof typeof sizes] || '16px'
        }; font-weight: 600; color: #111111; margin: ${
          heading.depth === 1 ? '16px' : heading.depth === 2 ? '12px' : '10px'
        } 0;">${text}</h${heading.depth}>`
      }
      if (token.type === 'code') {
        const code = token as Tokens.Code
        return `<pre style="font-family: monospace; font-size: 14px; background-color: #f4f4f4; padding: 12px; border-radius: 4px; overflow-x: auto; color: #333333; margin: 0 0 16px 0;"><code style="font-family: monospace; font-size: 14px; color: #333333;">${
          code.escaped ? code.text : escapeHtml(code.text)
        }</code></pre>`
      }
      if (token.type === 'blockquote') {
        const quote = processTokens((token as Tokens.Blockquote).tokens)
        return `<blockquote style="font-family: Arial, sans-serif; font-size: 16px; color: #555555; border-left: 4px solid #cccccc; padding-left: 12px; margin: 0 0 16px 0; font-style: italic;">${quote}</blockquote>`
      }
      if (token.type === 'hr') {
        return `<hr style="border: 1px solid #e5e7eb; margin: 16px 0;" />`
      }
      if (token.type === 'table') {
        const table = token as Tokens.Table
        const headerContent = table.header
          .map((cell) => {
            const text = cell.tokens ? processInlineTokens(cell.tokens) : ''
            const style = `border: 1px solid #e5e7eb; padding: 8px; color: #333333; font-weight: 500; ${
              cell.align ? `text-align: ${cell.align};` : ''
            }`
            return `<th style="${style}">${text}</th>`
          })
          .join('')

        const bodyContent = table.rows
          .map((row) => {
            const rowContent = row
              .map((cell) => {
                const text = cell.tokens ? processInlineTokens(cell.tokens) : ''
                const style = `border: 1px solid #e5e7eb; padding: 8px; color: #333333; word-break: break-word; ${
                  cell.align ? `text-align: ${cell.align};` : ''
                }`
                return `<td style="${style}">${text}</td>`
              })
              .join('')
            return `<tr style="border-bottom: 1px solid #e5e7eb;">${rowContent}</tr>`
          })
          .join('')

        return `<table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; margin: 16px 0; font-family: Arial, sans-serif; font-size: 14px;"><thead style="background-color: #f4f4f4; text-align: left;"><tr>${headerContent}</tr></thead><tbody style="border-top: 1px solid #e5e7eb;">${bodyContent}</tbody></table>`
      }
      if (token.type === 'space') {
        return ''
      }
      // Fallback for inline tokens
      return processInlineTokens([token])
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

  // Parse markdown to tokens
  const tokens = marked.lexer(extractedContent)

  // Process tokens to HTML
  const markdownHtml = processTokens(tokens)

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
