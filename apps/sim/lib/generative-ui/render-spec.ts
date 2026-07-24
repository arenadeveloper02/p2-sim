import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Spec } from '@json-render/core'
import { renderToHtml } from '@json-render/react-email/render'
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

function getWebpageTitle(spec: Spec): string {
  const elements = spec.elements as Record<string, FlatElement>
  const root = elements[spec.root]
  const title = root?.type === 'Page' ? asNullableString(root.props?.title) : undefined
  return title || 'Generated page'
}

function renderWebpageNode(spec: Spec, key: string): ReactNode {
  const elements = spec.elements as Record<string, FlatElement>
  const element = elements[key]
  if (!element) {
    return null
  }

  const props = element.props ?? {}
  const childNodes = (element.children ?? []).map((childKey) => renderWebpageNode(spec, childKey))

  switch (element.type) {
    case 'Page': {
      const backgroundColor = asNullableString(props.backgroundColor) ?? '#ffffff'
      return createElement(
        'div',
        {
          style: {
            minHeight: '100vh',
            backgroundColor,
            color: '#0f172a',
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
          } satisfies CSSProperties,
        },
        ...childNodes
      )
    }
    case 'Section': {
      const maxWidth = asNullableString(props.maxWidth) ?? '960px'
      return createElement(
        'section',
        {
          style: {
            padding: asNullableString(props.padding) ?? '32px 24px',
            backgroundColor: asNullableString(props.backgroundColor),
            maxWidth,
            margin: '0 auto',
            boxSizing: 'border-box',
          } satisfies CSSProperties,
        },
        ...childNodes
      )
    }
    case 'Stack': {
      const direction = props.direction === 'horizontal' ? 'row' : 'column'
      return createElement(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: direction,
            gap: asNullableString(props.gap) ?? '16px',
            alignItems:
              props.align === 'center'
                ? 'center'
                : props.align === 'end'
                  ? 'flex-end'
                  : props.align === 'stretch'
                    ? 'stretch'
                    : 'flex-start',
          } satisfies CSSProperties,
        },
        ...childNodes
      )
    }
    case 'Card': {
      return createElement(
        'div',
        {
          style: {
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: asNullableString(props.padding) ?? '20px',
            backgroundColor: asNullableString(props.backgroundColor) ?? '#ffffff',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
          } satisfies CSSProperties,
        },
        asNullableString(props.title)
          ? createElement(
              'h3',
              { style: { margin: '0 0 12px', fontSize: '18px', fontWeight: 600 } },
              asString(props.title)
            )
          : null,
        ...childNodes
      )
    }
    case 'Heading': {
      const level = (['h1', 'h2', 'h3', 'h4'].includes(asString(props.level))
        ? asString(props.level)
        : 'h2') as 'h1' | 'h2' | 'h3' | 'h4'
      const sizes = { h1: '36px', h2: '28px', h3: '22px', h4: '18px' } as const
      return createElement(
        level,
        {
          style: {
            margin: 0,
            fontSize: sizes[level],
            fontWeight: 700,
            color: asNullableString(props.color) ?? '#0f172a',
            lineHeight: 1.25,
          } satisfies CSSProperties,
        },
        asString(props.text)
      )
    }
    case 'Text': {
      return createElement(
        'p',
        {
          style: {
            margin: 0,
            fontSize: asNullableString(props.size) ?? '16px',
            color: asNullableString(props.color) ?? '#334155',
            lineHeight: 1.6,
          } satisfies CSSProperties,
        },
        asString(props.text)
      )
    }
    case 'Button': {
      const href = asNullableString(props.href)
      const style: CSSProperties = {
        display: 'inline-block',
        padding: '10px 16px',
        borderRadius: '8px',
        backgroundColor: asNullableString(props.backgroundColor) ?? '#0f172a',
        color: asNullableString(props.color) ?? '#ffffff',
        textDecoration: 'none',
        fontWeight: 600,
        fontSize: '14px',
        border: 'none',
      }
      if (href) {
        return createElement('a', { href, style }, asString(props.label))
      }
      return createElement('button', { type: 'button', style }, asString(props.label))
    }
    case 'Link': {
      return createElement(
        'a',
        {
          href: asString(props.href, '#'),
          style: {
            color: asNullableString(props.color) ?? '#2563eb',
            textDecoration: 'underline',
          } satisfies CSSProperties,
        },
        asString(props.label)
      )
    }
    case 'Image': {
      return createElement('img', {
        src: asString(props.src),
        alt: asString(props.alt, ''),
        width: asNullableString(props.width),
        height: asNullableString(props.height),
        style: { maxWidth: '100%', height: 'auto', display: 'block' } satisfies CSSProperties,
      })
    }
    case 'Divider': {
      return createElement('hr', {
        style: {
          border: 'none',
          borderTop: `1px solid ${asNullableString(props.color) ?? '#e2e8f0'}`,
          margin: '16px 0',
        } satisfies CSSProperties,
      })
    }
    case 'List': {
      const Tag = props.ordered === true ? 'ol' : 'ul'
      return createElement(
        Tag,
        { style: { margin: 0, paddingLeft: '20px' } satisfies CSSProperties },
        ...childNodes
      )
    }
    case 'ListItem': {
      return createElement(
        'li',
        { style: { marginBottom: '8px', color: '#334155' } satisfies CSSProperties },
        asString(props.text)
      )
    }
    default:
      return createElement('div', null, ...childNodes)
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
    return renderToHtml(spec, { includeStandard: true })
  }

  const body = renderToStaticMarkup(renderWebpageNode(spec, spec.root) as ReactElement)
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
