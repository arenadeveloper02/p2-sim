'use client'

import { useState } from 'react'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { useRouter } from 'next/navigation'
import {
  ARENA_GENERATIVE_APP_PREVIEW_BASE_PATH,
  isJsonRenderSpec,
} from '@/lib/arena-generative-ui/types'
import { SpecRenderer } from '@/app/(interfaces)/gui-apps/[identifier]/spec-renderer'
import {
  useGenerativeAppDraft,
  useRunGenerativeAppDraftAction,
} from '@/hooks/queries/arena-generative-apps'

const logger = createLogger('GenerativeAppPreviewHost')

interface GenerativeAppPreviewHostProps {
  draftId: string
  pagePath: string
}

export function GenerativeAppPreviewHost({ draftId, pagePath }: GenerativeAppPreviewHostProps) {
  const router = useRouter()
  const draftQuery = useGenerativeAppDraft(draftId)
  const runAction = useRunGenerativeAppDraftAction(draftId)
  const [state, setState] = useState<Record<string, unknown>>({})

  const navigate = (path: string) => {
    router.push(`${ARENA_GENERATIVE_APP_PREVIEW_BASE_PATH}/${draftId}/${path}`)
  }

  if (draftQuery.isLoading) {
    return <p className='p-8 text-[var(--color-ds-grey-500,#8a8d99)] text-sm'>Loading…</p>
  }

  if (draftQuery.isError || !draftQuery.data) {
    return (
      <div className='p-8 text-center text-[var(--text-error)]'>
        {toError(draftQuery.error).message || 'Unable to load this draft'}
      </div>
    )
  }

  const page = draftQuery.data.manifest.pages[pagePath]
  if (!page || !isJsonRenderSpec(page.spec)) {
    return <div className='p-8 text-center'>Page not found</div>
  }

  return (
    <div className='min-h-screen'>
      <div className='border-[var(--border)] border-b bg-[var(--color-ds-grey-50,#f7f8f9)] px-4 py-2 text-[var(--text-secondary)] text-xs'>
        Preview — not published. CTAs run against this draft.
      </div>
      <SpecRenderer
        spec={page.spec}
        state={state}
        pending={runAction.isPending}
        onNavigate={navigate}
        onRunAction={async (actionId, values) => {
          try {
            const result = await runAction.mutateAsync({ actionId, values })
            if (result.setState) {
              setState((current) => ({ ...current, ...result.setState }))
            }
            if (result.navigate) {
              navigate(result.navigate)
            }
            if (!result.ok) {
              logger.warn('Draft preview action returned an error', { error: result.error })
            }
          } catch (error) {
            logger.error('Draft preview action failed', { error: toError(error).message })
          }
        }}
      />
    </div>
  )
}
