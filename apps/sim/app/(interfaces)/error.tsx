'use client'

import { useEffect } from 'react'
import { Chip } from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { StatusPageContent } from '@/components/status-page'

interface InterfacesErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Catches runtime errors under `/chat` and `/resume` so they stay inside the
 * interfaces Arena chrome instead of bubbling to `global-error`.
 */
export default function InterfacesError({ error, reset }: InterfacesErrorProps) {
  useEffect(() => {
    createLogger('InterfacesError').error('Interfaces error:', {
      error: error.message,
      digest: error.digest,
    })
  }, [error.message, error.digest])

  return (
    <div className='flex flex-1 items-center justify-center px-4 py-16'>
      <StatusPageContent
        title='Something went wrong'
        description='An unexpected error occurred. Please try again.'
      >
        <Chip variant='primary' onClick={reset}>
          Try again
        </Chip>
      </StatusPageContent>
    </div>
  )
}
