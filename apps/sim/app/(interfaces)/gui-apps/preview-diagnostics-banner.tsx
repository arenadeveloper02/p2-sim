'use client'

import { useState } from 'react'

interface PreviewDiagnosticsBannerProps {
  instructions: string
}

/**
 * Preview-only surface: copy runtime render problems as Requested Changes.
 */
export function PreviewDiagnosticsBanner({ instructions }: PreviewDiagnosticsBannerProps) {
  const [copied, setCopied] = useState(false)
  if (!instructions.trim()) return null

  return (
    <div
      role='status'
      data-testid='preview-diagnostics-banner'
      className='flex w-full items-start gap-3 border-[var(--gui-border,#e2e3e5)] border-b bg-[var(--gui-surface,#fff)] px-6 py-3 text-[var(--gui-text)] text-sm'
    >
      <pre className='flex-1 whitespace-pre-wrap break-words font-sans text-sm'>{instructions}</pre>
      <button
        type='button'
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(instructions)
            setCopied(true)
          } catch {
            setCopied(false)
          }
        }}
        className='shrink-0 rounded px-2 py-1 text-[var(--gui-brand,#1a73e8)] text-xs hover:underline'
      >
        {copied ? 'Copied' : 'Copy as edit instructions'}
      </button>
    </div>
  )
}
