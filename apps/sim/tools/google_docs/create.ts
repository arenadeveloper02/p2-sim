import { createLogger } from '@sim/logger'
import { generateShortId } from '@sim/utils/id'
import type { GoogleDocsCreateResponse, GoogleDocsToolParams } from '@/tools/google_docs/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('GoogleDocsCreateTool')

const DOC_MIME_TYPE = 'application/vnd.google-apps.document'

/**
 * Reduce unsupported markdown/HTML/GFM features before sending `text/markdown` to Drive
 * so imports are less likely to error or lose content unexpectedly.
 *
 * Conversion strategy:
 *  - Unsupported syntax is converted to the nearest Drive-supported markdown equivalent
 *    rather than being stripped, so content and intent are preserved.
 *  - HTML tags that Drive's importer handles natively (<u>, <br>) are left as-is.
 *  - Only tags Drive cannot handle (details, summary) are unwrapped to plain text.
 *
 * The following markdown/GFM features are NOT supported by Drive's text/markdown importer
 * and are handled as described:
 *
 *  NOT SUPPORTED — Converted to nearest equivalent:
 *  ─────────────────────────────────────────────────
 *  ==highlight==          → **bold**         (Drive has no highlight; bold is closest emphasis)
 *  [^1] footnotes         → *(1: text)*      (inlined as italic parenthetical at reference point)
 *  YAML frontmatter       → *key: value*     (each line italicised, followed by ---)
 *  ![alt](url) images     → [alt](url)       (Drive cannot embed images; URL preserved as link)
 *  <img src="...">        → [alt](url)       (same as above for HTML img tags)
 *  > [!NOTE/WARNING/TIP]  → > **NOTE:**      (GFM callout alerts → bold-label blockquote)
 *  <details>/<summary>    → inner text       (unwrapped to preserve content)
 *
 *  NOT SUPPORTED — No equivalent, silently broken if left in:
 *  ─────────────────────────────────────────────────────────
 *  ~~strikethrough~~                  (Drive may or may not render; behaviour inconsistent)
 *  Nested blockquotes (>>> level 3+)  (Drive flattens to a single blockquote level)
 *  Definition lists (term\n: def)     (not CommonMark; Drive ignores entirely)
 *  Task lists (- [ ] / - [x])         (rendered as plain list items, checkbox lost)
 *  Emoji shortcodes (:smile:)         (not converted; renders as raw :smile: text)
 *  Superscript/subscript (^x^, ~x~)  (not supported; renders as raw syntax)
 *  Inline math ($x^2$)               (not supported; renders as raw LaTeX)
 *  Block math ($$...$$)              (not supported; renders as raw LaTeX)
 *  Custom HTML attributes            (e.g. {.class #id} — ignored by Drive's parser)
 *  Multi-line table cells            (Drive only supports single-line cell content)
 *  Indented code blocks (4 spaces)   (Drive prefers fenced ``` blocks; indented may not render)
 *  HTML comments (<!-- -->)          (not stripped; may appear as visible text in the doc)
 *
 *  SUPPORTED NATIVELY — Left as-is:
 *  ─────────────────────────────────
 *  # Headings (h1–h6)
 *  **bold**, *italic*, ***bold italic***
 *  `inline code`, ``` fenced code blocks ```
 *  [links](url)
 *  > blockquotes (single level)
 *  - / * / + unordered lists
 *  1. ordered lists
 *  --- horizontal rules
 *  GFM tables (single-line cells)
 *  <u>underline</u>, <br> line breaks (Drive handles these HTML tags natively)
 */
function sanitizeMarkdownForDrive(content: string): string {
  // --- FOOTNOTES ---
  // Collect all footnote definitions (e.g. [^1]: some text) into a map
  // so we can inline them at their reference points below.
  // The definitions themselves are removed from the content.
  const footnotes: Record<string, string> = {}
  content = content.replace(/^\[\^([^\]]+)\]:\s*(.+)$/gm, (_, id, text) => {
    footnotes[id] = text.trim()
    return ''
  })

  // Replace each footnote reference (e.g. [^1]) with an inline italic parenthetical
  // e.g. [^1] → *(1: footnote text)* — readable in Google Docs without raw syntax
  content = content.replace(/\[\^([^\]]+)\]/g, (_, id) =>
    footnotes[id] ? ` *(${id}: ${footnotes[id]})*` : `*(${id})*`
  )

  return (
    content
      // --- HIGHLIGHT SYNTAX ---
      // ==text== is not in the CommonMark spec and Drive ignores it, leaving raw ==.
      // Convert to bold (**text**) as the closest supported visual emphasis.
      .replace(/==([^=]+)==/g, '**$1**')

      // --- YAML FRONTMATTER ---
      // Drive renders frontmatter as raw text. Convert each key: value line to italic
      // so metadata is visible and readable, followed by a horizontal rule separator.
      .replace(/^---\n([\s\S]*?)\n---\n/, (_, block) => {
        const lines = block
          .split('\n')
          .map((l: string) => `*${l}*`)
          .join('\n')
        return `${lines}\n\n---\n`
      })

      // --- MARKDOWN IMAGES ---
      // Drive does not embed images from markdown syntax.
      // Convert ![alt](url) to a plain link [alt](url) so the URL is not silently lost.
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[$1]($2)')

      // --- HTML IMAGES ---
      // Same as above for <img> tags — convert to a markdown link to preserve the URL.
      .replace(
        /<img[^>]+src="([^"]+)"[^>]*(?:alt="([^"]*)")?[^>]*\/?>/gi,
        (_, src, alt) => `[${alt || 'Image'}](${src})`
      )

      // --- UNSUPPORTED HTML TAGS ---
      // <details> and <summary> are not supported by Drive's importer.
      // Unwrap them to preserve the inner text rather than stripping it entirely.
      // Note: <u> and <br> are intentionally left alone — Drive handles them natively.
      .replace(/<(details|summary)[^>]*>([\s\S]*?)<\/\1>/gi, '$2')

      // --- GFM CALLOUT ALERTS ---
      // GitHub-flavoured > [!NOTE] / [!WARNING] etc. are not recognised by Drive.
      // Convert to a bold label inside a standard blockquote, which Drive renders cleanly.
      .replace(/> \[!(NOTE|WARNING|TIP|IMPORTANT)\]/gm, '> **$1:**')
  )
}

/**
 * Build a multipart/related body for Drive's files.create upload endpoint.
 * Used when converting Markdown to a Google Doc in a single round-trip.
 * See: https://developers.google.com/workspace/drive/api/guides/manage-uploads
 */
function buildMarkdownMultipartBody(
  metadata: Record<string, unknown>,
  markdownContent: string,
  boundary: string
): string {
  return (
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/markdown\r\n\r\n` +
    `${sanitizeMarkdownForDrive(markdownContent)}\r\n` +
    `--${boundary}--`
  )
}

function shouldUseMarkdownUpload(params: GoogleDocsToolParams): boolean {
  // Always use the Drive markdown upload path when content is present.
  // This is a single round-trip and handles plain text transparently
  // (no markdown syntax → same output as plain text insertion).
  return Boolean(params.content)
}

export const createTool: ToolConfig<GoogleDocsToolParams, GoogleDocsCreateResponse> = {
  id: 'google_docs_create',
  name: 'Create Google Docs Document',
  description:
    'Create a new Google Docs document. Supports GitHub Flavored Markdown (GFM) in content — pass markdown directly and Google Drive converts it to formatted doc text (headings, bold, tables, lists, code blocks, horizontal rules). Use this to store or import markdown files. When content comes from read(), pass the GFM verbatim without rewriting.',
  version: '1.0',

  oauth: {
    required: true,
    provider: 'google-docs',
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'The access token for the Google Docs API',
    },
    title: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'The title of the document to create',
    },
    content: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Document body as GitHub Flavored Markdown (GFM). Supported: # headings, **bold**, *italic*, | tables |, --- rules, - lists, > blockquotes, ``` code blocks ```, links, and emoji. Pass markdown directly to store or import it — Drive converts GFM to Google Doc formatting. When importing from read(), paste the exact GFM output unchanged.',
    },
    folderId: {
      type: 'string',
      required: false,
      visibility: 'hidden',
      description: 'Drive folder ID (optional). Omit to create at My Drive root.',
    },
  },

  request: {
    url: (params) => {
      return shouldUseMarkdownUpload(params)
        ? 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true'
        : 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true'
    },
    method: 'POST',
    headers: (params) => {
      if (!params.accessToken) {
        throw new Error('Access token is required')
      }

      if (shouldUseMarkdownUpload(params)) {
        const boundary = `sim_gdocs_md_${generateShortId(24)}`
        // Stash on params so body() uses the matching boundary string
        ;(params as GoogleDocsToolParams & { _boundary?: string })._boundary = boundary
        return {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        }
      }

      return {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      }
    },
    body: (params) => {
      if (!params.title) {
        throw new Error('Title is required')
      }

      const folderId = params.folderId
      const metadata: Record<string, unknown> = {
        name: params.title,
        mimeType: DOC_MIME_TYPE,
      }
      if (folderId) {
        metadata.parents = [folderId]
      }

      if (shouldUseMarkdownUpload(params)) {
        const boundary = (params as GoogleDocsToolParams & { _boundary?: string })._boundary
        if (!boundary) {
          // headers() runs before body() in formatRequestParams and stashes the boundary
          // on the same params reference. Missing _boundary means that contract was broken,
          // which would silently produce a Content-Type / body boundary mismatch (HTTP 400).
          // Throw loudly instead of fabricating a mismatched boundary.
          throw new Error(
            'Multipart boundary missing on params — headers() must run before body() for markdown upload'
          )
        }
        return buildMarkdownMultipartBody(metadata, params.content ?? '', boundary)
      }

      return metadata
    },
  },

  postProcess: async (result, params, executeTool) => {
    if (!result.success) {
      return result
    }

    const documentId = result.output.metadata.documentId

    // When the markdown upload path ran, content was already inserted via Drive's
    // text/markdown import conversion during files.create — no follow-up write needed.
    if (shouldUseMarkdownUpload(params)) {
      return result
    }

    if (params.content && documentId) {
      try {
        const writeParams = {
          accessToken: params.accessToken,
          documentId: documentId,
          content: params.content,
        }

        const writeResult = await executeTool('google_docs_write', writeParams)

        if (!writeResult.success) {
          logger.warn(
            'Failed to add content to document, but document was created:',
            writeResult.error
          )
        }
      } catch (error) {
        logger.warn('Error adding content to document:', { error })
        // Don't fail the overall operation if adding content fails
      }
    }

    return result
  },

  transformResponse: async (response: Response) => {
    try {
      // Get the response data
      const responseText = await response.text()
      const data = JSON.parse(responseText)

      const documentId = data.id
      const title = data.name

      const metadata = {
        documentId,
        title: title || 'Untitled Document',
        mimeType: DOC_MIME_TYPE,
        url: `https://docs.google.com/document/d/${documentId}/edit`,
      }

      return {
        success: true,
        output: {
          metadata,
        },
      }
    } catch (error) {
      logger.error('Google Docs create - Error processing response:', {
        error,
      })
      throw error
    }
  },

  outputs: {
    metadata: {
      type: 'json',
      description: 'Created document metadata including ID, title, and URL',
      properties: {
        documentId: { type: 'string', description: 'Google Docs document ID' },
        title: { type: 'string', description: 'Document title' },
        mimeType: { type: 'string', description: 'Document MIME type' },
        url: { type: 'string', description: 'Document URL' },
      },
    },
  },
}
