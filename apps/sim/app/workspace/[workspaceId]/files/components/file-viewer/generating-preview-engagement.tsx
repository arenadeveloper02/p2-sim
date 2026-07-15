'use client'

import { useEffect, useState } from 'react'
import { Loader } from '@/components/emcn'
import { useLocalLiveStatus } from '@/local-copilot/hooks/use-local-live-status'
import {
  getGeneratingPreviewMessages,
  nextGeneratingMessageIndex,
  type GeneratingPreviewKind,
} from '@/app/workspace/[workspaceId]/files/components/file-viewer/generating-preview-messages'

const MESSAGE_ROTATION_MS = 3500

interface GeneratingPreviewEngagementProps {
  kind: GeneratingPreviewKind
  fileName?: string
}

/**
 * Local Copilot preview-panel engagement while office/HTML files are still
 * generating. Prefers the same server live status as chat when present;
 * otherwise rotates quiet fixed copy.
 */
export function GeneratingPreviewEngagement({ kind, fileName }: GeneratingPreviewEngagementProps) {
  const liveStatus = useLocalLiveStatus()
  const messages = getGeneratingPreviewMessages(kind, fileName)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
  }, [kind, fileName])

  useEffect(() => {
    if (liveStatus?.trim() || messages.length <= 1) return
    const timer = setInterval(() => {
      setIndex((current) => nextGeneratingMessageIndex(current, messages.length))
    }, MESSAGE_ROTATION_MS)
    return () => clearInterval(timer)
  }, [messages.length, kind, fileName, liveStatus])

  const fallback = messages[Math.min(index, messages.length - 1)] ?? messages[0]
  const message = liveStatus?.trim() || fallback

  return (
    <div className='flex flex-1 flex-col items-center justify-center gap-[12px] bg-[var(--surface-1)] px-6'>
      <Loader className='size-[18px] text-[var(--text-secondary)]' animate />
      <p className='text-center font-medium text-[14px] text-[var(--text-primary)]'>{message}</p>
      <p className='text-center text-[13px] text-[var(--text-muted)]'>
        Larger files can take a minute — preview will appear when ready.
      </p>
    </div>
  )
}
