'use client'

import { LoadingAgentP2 } from '@/components/ui/loading-agent-arena'

/**
 * Full-page loading state while deployed chat config is fetched.
 */
export function ChatLoadingState() {
  return (
    <div className='light fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)]'>
      <LoadingAgentP2 size='lg' />
    </div>
  )
}
