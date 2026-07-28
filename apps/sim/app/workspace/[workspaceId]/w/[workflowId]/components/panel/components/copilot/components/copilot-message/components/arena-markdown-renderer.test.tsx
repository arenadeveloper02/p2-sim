/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/emcn', () => ({
  Code: {
    Viewer: ({ code }: { code: string }) => <pre data-testid='code-viewer'>{code}</pre>,
  },
  Tooltip: {
    Provider: ({ children }: { children: ReactNode }) => <>{children}</>,
    Root: ({ children }: { children: ReactNode }) => <>{children}</>,
    Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    Content: ({ children }: { children: ReactNode }) => <>{children}</>,
  },
}))

import ArenaCopilotMarkdownRenderer from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/copilot/components/copilot-message/components/arena-markdown-renderer'

let container: HTMLDivElement
let root: Root

function mount(ui: ReactNode) {
  act(() => {
    root.render(ui)
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('ArenaCopilotMarkdownRenderer', () => {
  it('uses renderImage for markdown images when provided', () => {
    mount(
      <ArenaCopilotMarkdownRenderer
        content='![alt text](https://example.com/image.png)'
        renderImage={({ src, alt }) => (
          <div data-testid='custom-image' data-src={src} data-alt={alt ?? ''} />
        )}
      />
    )

    const customImage = container.querySelector('[data-testid="custom-image"]')
    expect(customImage).not.toBeNull()
    expect(customImage?.getAttribute('data-src')).toBe('https://example.com/image.png')
    expect(customImage?.getAttribute('data-alt')).toBe('alt text')
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders a default img element when renderImage is not provided', () => {
    mount(<ArenaCopilotMarkdownRenderer content='![](https://example.com/plain.png)' />)

    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://example.com/plain.png')
  })
})
