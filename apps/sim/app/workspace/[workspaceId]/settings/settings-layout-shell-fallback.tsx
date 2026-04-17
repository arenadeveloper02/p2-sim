import type { ReactNode } from 'react'

interface SettingsLayoutShellFallbackProps {
  children: ReactNode
}

/**
 * Static shell used while search params stream in (Suspense fallback for {@linkcode SettingsLayoutShell}).
 */
export function SettingsLayoutShellFallback({ children }: SettingsLayoutShellFallbackProps) {
  return (
    <div className='h-full overflow-y-auto [scrollbar-gutter:stable]'>
      <div className='mx-auto flex min-h-full max-w-[940px] flex-col px-[26px] pt-9 pb-[52px]'>
        {children}
      </div>
    </div>
  )
}
