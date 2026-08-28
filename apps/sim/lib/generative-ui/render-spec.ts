import type { Spec } from '@json-render/core'
import type { GenerativeUiMode } from '@/lib/generative-ui/types'

interface FlatElement {
  type: string
  props?: Record<string, unknown>
  children?: string[]
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;')
}

function styleAttr(styles: Record<string, string | undefined>): string {
  const css = Object.entries(styles)
    .filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0
    )
    .map(([key, value]) => {
      const cssKey = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
      return `${cssKey}:${value}`
    })
    .join(';')
  return css.length > 0 ? ` style="${escapeAttr(css)}"` : ''
}

function getWebpageTitle(spec: Spec): string {
  const elements = spec.elements as Record<string, FlatElement>
  const root = elements[spec.root]
  const title = root?.type === 'Page' ? asNullableString(root.props?.title) : undefined
  return title || 'Generated page'
}

/**
 * Renders a webpage-mode Spec node to an HTML string without React DOM.
 * Avoids `react-dom/server`, which Turbopack rejects in App Router graphs.
 */
function renderWebpageNode(spec: Spec, key: string): string {
  const elements = spec.elements as Record<string, FlatElement>
  const element = elements[key]
  if (!element) {
    return ''
  }

  const props = element.props ?? {}
  const childrenHtml = (element.children ?? [])
    .map((childKey) => renderWebpageNode(spec, childKey))
    .join('')

  switch (element.type) {
    case 'Page': {
      const backgroundColor = asNullableString(props.backgroundColor) ?? '#ffffff'
      return `<div${styleAttr({
        minHeight: '100vh',
        backgroundColor,
        color: '#0f172a',
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
      })}>${childrenHtml}</div>`
    }
    case 'Section': {
      const maxWidth = asNullableString(props.maxWidth) ?? '960px'
      return `<section${styleAttr({
        padding: asNullableString(props.padding) ?? '32px 24px',
        backgroundColor: asNullableString(props.backgroundColor),
        maxWidth,
        margin: '0 auto',
        boxSizing: 'border-box',
      })}>${childrenHtml}</section>`
    }
    case 'Stack': {
      const direction = props.direction === 'horizontal' ? 'row' : 'column'
      const alignItems =
        props.align === 'center'
          ? 'center'
          : props.align === 'end'
            ? 'flex-end'
            : props.align === 'stretch'
              ? 'stretch'
              : 'flex-start'
      return `<div${styleAttr({
        display: 'flex',
        flexDirection: direction,
        gap: asNullableString(props.gap) ?? '16px',
        alignItems,
      })}>${childrenHtml}</div>`
    }
    case 'Card': {
      const title = asNullableString(props.title)
      const titleHtml = title
        ? `<h3${styleAttr({ margin: '0 0 12px', fontSize: '18px', fontWeight: '600' })}>${escapeHtml(title)}</h3>`
        : ''
      return `<div${styleAttr({
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: asNullableString(props.padding) ?? '20px',
        backgroundColor: asNullableString(props.backgroundColor) ?? '#ffffff',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
      })}>${titleHtml}${childrenHtml}</div>`
    }
    case 'Heading': {
      const level = (
        ['h1', 'h2', 'h3', 'h4'].includes(asString(props.level)) ? asString(props.level) : 'h2'
      ) as 'h1' | 'h2' | 'h3' | 'h4'
      const sizes = { h1: '36px', h2: '28px', h3: '22px', h4: '18px' } as const
      return `<${level}${styleAttr({
        margin: '0',
        fontSize: sizes[level],
        fontWeight: '700',
        color: asNullableString(props.color) ?? '#0f172a',
        lineHeight: '1.25',
      })}>${escapeHtml(asString(props.text))}</${level}>`
    }
    case 'Text': {
      return `<p${styleAttr({
        margin: '0',
        fontSize: asNullableString(props.size) ?? '16px',
        color: asNullableString(props.color) ?? '#334155',
        lineHeight: '1.6',
      })}>${escapeHtml(asString(props.text))}</p>`
    }
    case 'Button': {
      const href = asNullableString(props.href)
      const label = escapeHtml(asString(props.label))
      const buttonStyle = styleAttr({
        display: 'inline-block',
        padding: '10px 16px',
        borderRadius: '8px',
        backgroundColor: asNullableString(props.backgroundColor) ?? '#0f172a',
        color: asNullableString(props.color) ?? '#ffffff',
        textDecoration: 'none',
        fontWeight: '600',
        fontSize: '14px',
        border: 'none',
      })
      if (href) {
        return `<a href="${escapeAttr(href)}"${buttonStyle}>${label}</a>`
      }
      return `<button type="button"${buttonStyle}>${label}</button>`
    }
    case 'Link': {
      return `<a href="${escapeAttr(asString(props.href, '#'))}"${styleAttr({
        color: asNullableString(props.color) ?? '#2563eb',
        textDecoration: 'underline',
      })}>${escapeHtml(asString(props.label))}</a>`
    }
    case 'Image': {
      const width = asNullableString(props.width)
      const height = asNullableString(props.height)
      const sizeAttrs = `${width ? ` width="${escapeAttr(width)}"` : ''}${height ? ` height="${escapeAttr(height)}"` : ''}`
      return `<img src="${escapeAttr(asString(props.src))}" alt="${escapeAttr(asString(props.alt, ''))}"${sizeAttrs}${styleAttr(
        {
          maxWidth: '100%',
          height: 'auto',
          display: 'block',
        }
      )} />`
    }
    case 'Divider': {
      return `<hr${styleAttr({
        border: 'none',
        borderTop: `1px solid ${asNullableString(props.color) ?? '#e2e8f0'}`,
        margin: '16px 0',
      })} />`
    }
    case 'List': {
      const tag = props.ordered === true ? 'ol' : 'ul'
      return `<${tag}${styleAttr({ margin: '0', paddingLeft: '20px' })}>${childrenHtml}</${tag}>`
    }
    case 'ListItem': {
      return `<li${styleAttr({ marginBottom: '8px', color: '#334155' })}>${escapeHtml(asString(props.text))}</li>`
    }
    default:
      return `<div>${childrenHtml}</div>`
  }
}

/**
 * Renders a validated json-render Spec to an HTML string for the given mode.
 */
export async function renderGenerativeUiSpecToHtml(
  mode: GenerativeUiMode,
  spec: Spec
): Promise<string> {
  if (mode === 'email') {
    // Dynamic import keeps @json-render/react-email (and its react-dom/server use)
    // out of static App Router analysis; the package is also marked external.
    const { renderToHtml } = await import('@json-render/react-email/render')
    return renderToHtml(spec, { includeStandard: true })
  }

  const body = renderWebpageNode(spec, spec.root)
  const title = getWebpageTitle(spec)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;">
${body}
</body>
</html>`
}
