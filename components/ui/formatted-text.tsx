'use client'

import { ReactNode } from 'react'

/**
 * Formats text by highlighting block references (<...>) and environment variables ({...})
 * Used in code editor, long inputs, and short inputs for consistent syntax highlighting
 */
export function formatDisplayText(text: string | null): ReactNode {
  if (!text) return null

  // Split the text by both tag patterns <something.something> and {ENV_VAR}
  const parts = text.split(/(<[^>]+>|\{[^}]+\})/g)

  return parts.map((part, index) => {
    // Check if the part matches connection tag pattern
    if (part.match(/^<[^>]+>$/)) {
      return (
        <span key={index} className="text-blue-500">
          {part}
        </span>
      )
    }
    // Check if the part matches environment variable pattern
    if (part.match(/^\{[^}]+\}$/)) {
      return (
        <span key={index} className="text-blue-500">
          {part}
        </span>
      )
    }
    return <span key={index}>{part}</span>
  })
} 