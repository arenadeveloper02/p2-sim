'use client'

import { useSyncExternalStore } from 'react'
import {
  getLocalLiveStatus,
  subscribeLocalLiveStatus,
} from '@/local-copilot/lib/client/local-live-status'

/** React hook for the latest Local Copilot live status line (chat + preview). */
export function useLocalLiveStatus(): string | undefined {
  return useSyncExternalStore(subscribeLocalLiveStatus, getLocalLiveStatus, () => undefined)
}
