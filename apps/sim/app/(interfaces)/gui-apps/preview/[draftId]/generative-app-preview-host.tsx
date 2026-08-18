'use client'

import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { useRouter } from 'next/navigation'
import { flushSync } from 'react-dom'
import { streamingContentState } from '@/lib/arena-generative-ui/consume-action-sse'
import type { RunDeployedAppActionResult } from '@/lib/arena-generative-ui/run-action'
import {
  ARENA_GENERATIVE_APP_PREVIEW_BASE_PATH,
  actionErrorFrom,
  actionNavigateFrom,
  clearedActionErrorState,
  isJsonRenderSpec,
  streamingActionIdsFrom,
} from '@/lib/arena-generative-ui/types'
import { SpecRenderer } from '@/app/(interfaces)/gui-apps/[identifier]/spec-renderer'
import { ActionErrorBanner } from '@/app/(interfaces)/gui-apps/action-error-banner'
import { useGenerativeAppHostState } from '@/app/(interfaces)/gui-apps/generative-app-host-state'
import {
  runGenerativeAppDraftActionStream,
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
  const { state, mergeState, actionPending, setActionPending } = useGenerativeAppHostState()

  const navigate = (path: string) => {
    mergeState(clearedActionErrorState())
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

  const manifest = draftQuery.data.manifest
  const apiBindings = draftQuery.data.apiBindings
  const page = manifest.pages[pagePath]
  if (!page || !isJsonRenderSpec(page.spec)) {
    return <div className='p-8 text-center'>Page not found</div>
  }

  const streamingIds = new Set(streamingActionIdsFrom(manifest, apiBindings))
  const actionNavigate = actionNavigateFrom(manifest)
  const actionError = actionErrorFrom(state)

  return (
    <div className='min-h-screen'>
      <div className='border-[var(--border)] border-b bg-[var(--color-ds-grey-50,#f7f8f9)] px-4 py-2 text-[var(--text-secondary)] text-xs'>
        Preview — not published. CTAs run against this draft.
      </div>
      {actionError ? (
        <ActionErrorBanner
          message={actionError}
          onDismiss={() => mergeState(clearedActionErrorState())}
        />
      ) : null}
      <SpecRenderer
        spec={page.spec}
        state={state}
        pending={runAction.isPending || actionPending}
        onNavigate={navigate}
        onRunAction={async (actionId, values) => {
          const navigateTo = actionNavigate[actionId]
          setActionPending(true)
          mergeState(clearedActionErrorState())
          try {
            if (navigateTo) {
              navigate(navigateTo)
            }
            const result = streamingIds.has(actionId)
              ? await runGenerativeAppDraftActionStream({
                  draftId,
                  actionId,
                  values,
                  onChunk: (accumulated) => {
                    mergeState(streamingContentState(accumulated))
                  },
                })
              : await runAction.mutateAsync({ actionId, values })
            applyPreviewActionResult(result, mergeState, navigate, {
              skipNavigate: Boolean(navigateTo),
            })
          } catch (error) {
            logger.error('Draft preview action failed', { error: toError(error).message })
            mergeState({ error: toError(error).message || 'Action failed' })
          } finally {
            setActionPending(false)
          }
        }}
      />
    </div>
  )
}

function applyPreviewActionResult(
  result: RunDeployedAppActionResult,
  mergeState: (patch: Record<string, unknown>) => void,
  navigate: (path: string) => void,
  options?: { skipNavigate?: boolean }
) {
  if (result.setState) {
    flushSync(() => {
      mergeState(result.setState as Record<string, unknown>)
    })
  }
  if (!options?.skipNavigate && result.navigate) {
    navigate(result.navigate)
  }
  if (!result.ok) {
    flushSync(() => {
      mergeState({ error: result.error ?? 'Action failed' })
    })
    logger.warn('Draft preview action returned an error', { error: result.error })
  }
}
