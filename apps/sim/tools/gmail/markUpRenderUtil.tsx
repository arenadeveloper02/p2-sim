import type React from 'react'
import { encode } from 'entities'
import { marked } from 'marked'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Utility to escape HTML content for safe inclusion (used for Markdown code blocks and plain text)
const escapeHtml = (text: string): string => encode(text)

// Utility to sanitize HTML content (optional, for untrusted HTML)
// const sanitizeHtmlContent = (html: string): string =>
//   sanitizeHtml(html, {
//     allowedTags: [
//       'html',
//       'head',
//       'meta',
//       'title',
//       'style',
//       'body',
//       'header',
//       'footer',
//       'section',
//       'p',
//       'h1',
//       'h2',
//       'h3',
//       'h4',
//       'ul',
//       'ol',
//       'li',
//       'pre',
//       'code',
//       'strong',
//       'em',
//       'blockquote',
//       'hr',
//       'a',
//       'table',
//       'thead',
//       'tbody',
//       'tr',
//       'th',
//       'td',
//       'img',
//     ],
//     allowedAttributes: {
//       '*': ['style'],
//       a: ['href', 'target', 'rel'],
//       img: ['src', 'alt'],
//       table: ['border', 'cellpadding'],
//     },
//   })

// Extract content from Markdown code fences or return raw content
export function extractContentFromAgentResponse(response: string): string {
  const htmlMatch = response.match(/```html\n([\s\S]*?)\n```/)
  if (htmlMatch?.[1]) {
    return htmlMatch[1].trim()
  }
  return response
}

// Component for UI rendering (server or client)
export function renderAgentResponse({ content }: { content: string }) {
  // Extract content if wrapped in Markdown code fences
  const extractedContent = extractContentFromAgentResponse(content)

  // If content is HTML, render it directly (optionally sanitized)
  if (
    extractedContent.trim().startsWith('<!DOCTYPE html>') ||
    extractedContent.trim().startsWith('<html')
  ) {
    const htmlContent = extractedContent
    return <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
  }

  // Manual typing for code component props
  interface CodeComponentProps {
    inline?: boolean
    children?: React.ReactNode
    [key: string]: any // For other HTML attributes
  }

  const emailComponents: Components = {
    p: ({ children }) => (
      <p
        style={{
          fontFamily: 'Arial, sans-serif',
          fontSize: '16px',
          color: '#333333',
          lineHeight: '1.5',
          margin: '0 0 16px 0',
        }}
      >
        {children}
      </p>
    ),
    h1: ({ children }) => (
      <h1
        style={{
          fontFamily: 'Arial, sans-serif',
          fontSize: '24px',
          fontWeight: '600',
          color: '#111111',
          margin: '16px 0',
        }}
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2
        style={{
          fontFamily: 'Arial, sans-serif',
          fontSize: '20px',
          fontWeight: '600',
          color: '#111111',
          margin: '12px 0',
        }}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3
        style={{
          fontFamily: 'Arial, sans-serif',
          fontSize: '18px',
          fontWeight: '600',
          color: '#111111',
          margin: '10px 0',
        }}
      >
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4
        style={{
          fontFamily: 'Arial, sans-serif',
          fontSize: '16px',
          fontWeight: '600',
          color: '#111111',
          margin: '8px 0',
        }}
      >
        {children}
      </h4>
    ),
    ul: ({ children }) => (
      <ul
        style={{
          fontFamily: 'Arial, sans-serif',
          fontSize: '16px',
          color: '#333333',
          listStyleType: 'disc',
          paddingLeft: '20px',
          margin: '0 0 16px 0',
        }}
      >
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol
        style={{
          fontFamily: 'Arial, sans-serif',
          fontSize: '16px',
          color: '#333333',
          listStyleType: 'decimal',
          paddingLeft: '20px',
          margin: '0 0 16px 0',
        }}
      >
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li
        style={{
          fontFamily: 'Arial, sans-serif',
          fontSize: '16px',
          color: '#333333',
          marginBottom: '8px',
        }}
      >
        {children}
      </li>
    ),
    pre: ({ children }) => (
      <pre
        style={{
          fontFamily: 'monospace',
          fontSize: '14px',
          backgroundColor: '#f4f4f4',
          padding: '12px',
          borderRadius: '4px',
          overflowX: 'auto',
          color: '#333333',
          margin: '0 0 16px 0',
        }}
      >
        {children}
      </pre>
    ),
    code: ({ inline, children, ...props }: CodeComponentProps) =>
      inline ? (
        <code
          style={{
            fontFamily: 'monospace',
            fontSize: '14px',
            backgroundColor: '#f4f4f4',
            padding: '2px 4px',
            borderRadius: '3px',
            color: '#333333',
          }}
          {...props}
        >
          {children}
        </code>
      ) : (
        <code style={{ fontFamily: 'monospace', fontSize: '14px', color: '#333333' }} {...props}>
          {children}
        </code>
      ),
    strong: ({ children }) => (
      <strong style={{ fontWeight: '600', color: '#111111' }}>{children}</strong>
    ),
    em: ({ children }) => <em style={{ fontStyle: 'italic', color: '#333333' }}>{children}</em>,
    blockquote: ({ children }) => (
      <blockquote
        style={{
          fontFamily: 'Arial, sans-serif',
          fontSize: '16px',
          color: '#555555',
          borderLeft: '4px solid #cccccc',
          paddingLeft: '12px',
          margin: '0 0 16px 0',
          fontStyle: 'italic',
        }}
      >
        {children}
      </blockquote>
    ),
    hr: () => <hr style={{ border: '1px solid #e5e7eb', margin: '16px 0' }} />,
    a: ({ href, children }) => (
      <a
        href={href || '#'}
        style={{ color: '#1a73e8', textDecoration: 'underline', wordBreak: 'break-all' }}
        target='_blank'
        rel='noopener noreferrer'
      >
        {children}
      </a>
    ),
    table: ({ children }) => (
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #e5e7eb',
          margin: '16px 0',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
        }}
      >
        {children}
      </table>
    ),
    thead: ({ children }) => (
      <thead style={{ backgroundColor: '#f4f4f4', textAlign: 'left' }}>{children}</thead>
    ),
    tbody: ({ children }) => <tbody style={{ borderTop: '1px solid #e5e7eb' }}>{children}</tbody>,
    tr: ({ children }) => <tr style={{ borderBottom: '1px solid #e5e7eb' }}>{children}</tr>,
    th: ({ children }) => (
      <th
        style={{ border: '1px solid #e5e7eb', padding: '8px', fontWeight: '500', color: '#333333' }}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td
        style={{
          border: '1px solid #e5e7eb',
          padding: '8px',
          color: '#333333',
          wordBreak: 'break-word',
        }}
      >
        {children}
      </td>
    ),
    img: ({ src, alt }) => (
      <img
        src={src || ''}
        alt={alt || 'Image'}
        style={{ maxWidth: '100%', height: 'auto', margin: '12px 0', borderRadius: '4px' }}
      />
    ),
  }

  return (
    <div
      style={{
        fontFamily: 'Arial, sans-serif',
        //maxWidth: '600px',
        margin: '0 auto',
        padding: '20px',
        backgroundColor: '#ffffff',
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={emailComponents}>
        {extractedContent}
      </ReactMarkdown>
    </div>
  )
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
    return extractedContent
  }

  // Configure marked with custom renderer for styling
  const renderer = new marked.Renderer()
  renderer.paragraph = (text) =>
    `<p style="font-family: Arial, sans-serif; font-size: 16px; color: #333333; line-height: 1.5; margin: 0 0 16px 0;">${text}</p>`
  renderer.heading = (text, level) => {
    const sizes = { 1: '24px', 2: '20px', 3: '18px', 4: '16px' }
    return `<h${level} style="font-family: Arial, sans-serif; font-size: ${
      sizes[level as keyof typeof sizes] || '16px'
    }; font-weight: 600; color: #111111; margin: ${
      level === 1 ? '16px' : level === 2 ? '12px' : '10px'
    } 0;">${text}</h${level}>`
  }
  renderer.list = (body, ordered) =>
    ordered
      ? `<ol style="font-family: Arial, sans-serif; font-size: 16px; color: #333333; list-style-type: decimal; padding-left: 20px; margin: 0 0 16px 0;">${body}</ol>`
      : `<ul style="font-family: Arial, sans-serif; font-size: 16px; color: #333333; list-style-type: disc; padding-left: 20px; margin: 0 0 16px 0;">${body}</ul>`
  renderer.listitem = (text) =>
    `<li style="font-family: Arial, sans-serif; font-size: 16px; color: #333333; margin-bottom: 8px;">${text}</li>`
  renderer.code = (code) =>
    `<pre style="font-family: monospace; font-size: 14px; background-color: #f4f4f4; padding: 12px; border-radius: 4px; overflow-x: auto; color: #333333; margin: 0 0 16px 0;"><code style="font-family: monospace; font-size: 14px; color: #333333;">${escapeHtml(
      code
    )}</code></pre>`
  renderer.codespan = (code) =>
    `<code style="font-family: monospace; font-size: 14px; background-color: #f4f4f4; padding: 2px 4px; border-radius: 3px; color: #333333;">${escapeHtml(
      code
    )}</code>`
  renderer.strong = (text) => `<strong style="font-weight: 600; color: #111111;">${text}</strong>`
  renderer.em = (text) => `<em style="font-style: italic; color: #333333;">${text}</em>`
  renderer.blockquote = (quote) =>
    `<blockquote style="font-family: Arial, sans-serif; font-size: 16px; color: #555555; border-left: 4px solid #cccccc; padding-left: 12px; margin: 0 0 16px 0; font-style: italic;">${quote}</blockquote>`
  renderer.hr = () => `<hr style="border: 1px solid #e5e7eb; margin: 16px 0;" />`
  renderer.link = (href, title, text) =>
    `<a href="${href || '#'}" style="color: #1a73e8; text-decoration: underline; word-break: break-all;" target="_blank" rel="noopener noreferrer">${text}</a>`
  renderer.table = (header, body) =>
    `<table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; margin: 16px 0; font-family: Arial, sans-serif; font-size: 14px;"><thead style="background-color: #f4f4f4; text-align: left;">${header}</thead><tbody style="border-top: 1px solid #e5e7eb;">${body}</tbody></table>`
  renderer.tablerow = (content) => `<tr style="border-bottom: 1px solid #e5e7eb;">${content}</tr>`
  renderer.tablecell = (content, flags) =>
    flags.header
      ? `<th style="border: 1px solid #e5e7eb; padding: 8px; font-weight: 500; color: #333333;">${content}</th>`
      : `<td style="border: 1px solid #e5e7eb; padding: 8px; color: #333333; word-break: break-word;">${content}</td>`
  renderer.image = (href, title, text) =>
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
