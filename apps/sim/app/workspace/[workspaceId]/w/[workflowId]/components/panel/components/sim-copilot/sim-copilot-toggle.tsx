'use client'

import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/core/utils/cn'
import { useSimCopilotStore } from '@/stores/sim-copilot/store'

export function SimCopilotToggle() {
  const isOpen = useSimCopilotStore((s) => s.isOpen)
  const togglePanel = useSimCopilotStore((s) => s.togglePanel)

  return (
    <button
      onClick={togglePanel}
      className={cn(
        'fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105',
        isOpen
          ? 'bg-violet-600 text-white shadow-violet-500/30'
          : 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-violet-500/40 hover:shadow-violet-500/60'
      )}
      title={isOpen ? 'Close Sim Copilot' : 'Open Sim Copilot'}
    >
      <Sparkles className='h-6 w-6' />
    </button>
  )
}
