'use client'

import { useMemo, useState } from 'react'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { useRouter } from 'next/navigation'
import { flushSync } from 'react-dom'
import {
  actionChatProtocolFrom,
  actionHiddenInputsFrom,
  actionHostKeysFrom,
} from '@/lib/arena-generative-ui/binding-layout-plan'
import { streamingContentState } from '@/lib/arena-generative-ui/consume-action-sse'
import {
  collectRenderDiagnostics,
  editInstructionsFromDiagnostics,
  pageEditPrompt,
} from '@/lib/arena-generative-ui/render-diagnostics'
import type { ArenaGenerativeTheme } from '@/lib/arena-generative-ui/theme'
import {
  ARENA_GENERATIVE_APP_PREVIEW_BASE_PATH,
  actionErrorFrom,
  actionNavigateFrom,
  actionSchemaWarningFrom,
  clearedActionErrorState,
  clearedSelectedItemHostState,
  isJsonRenderSpec,
  navigationHref,
  scrollGenerativeAppToTop,
  selectedItemHostState,
  streamingActionIdsFrom,
} from '@/lib/arena-generative-ui/types'
import { compileGenerativeUx } from '@/lib/arena-generative-ui/ux-compiler'
import { SpecRenderer } from '@/app/(interfaces)/gui-apps/[identifier]/spec-renderer'
import { ActionErrorBanner } from '@/app/(interfaces)/gui-apps/action-error-banner'
import { useGenerativeAppHostState } from '@/app/(interfaces)/gui-apps/generative-app-host-state'
import {
  ActionRefreshButton,
  ActionSuccessToast,
  DestructiveConfirmDialog,
} from '@/app/(interfaces)/gui-apps/generative-app-overlays'
import { GenerativeAppThemeRoot } from '@/app/(interfaces)/gui-apps/generative-app-theme-root'
import { PreviewDiagnosticsBanner } from '@/app/(interfaces)/gui-apps/preview-diagnostics-banner'
import { PreviewThemePicker } from '@/app/(interfaces)/gui-apps/preview-theme-picker'
import { SpecRenderErrorBoundary } from '@/app/(interfaces)/gui-apps/spec-render-error-boundary'
import { useGenerativeAppRuntime } from '@/app/(interfaces)/gui-apps/use-generative-app-runtime'
import { usePageLoadActions } from '@/app/(interfaces)/gui-apps/use-page-load-actions'
import {
  runGenerativeAppDraftActionStream,
  useGenerativeAppDraft,
  useRunGenerativeAppDraftAction,
} from '@/hooks/queries/arena-generative-apps'

const logger = createLogger('GenerativeAppPreviewHost')

interface GenerativeAppPreviewHostProps {
  draftId: string
  pagePath: string
  /** Page query params, passed as the input values for the page's `onLoad` actions. */
  pageParams?: Record<string, string>
}

const NO_PAGE_PARAMS: Record<string, string> = {}

export function GenerativeAppPreviewHost({
  draftId,
  pagePath,
  pageParams = NO_PAGE_PARAMS,
}: GenerativeAppPreviewHostProps) {
  const router = useRouter()
  const draftQuery = useGenerativeAppDraft(draftId)
  const runAction = useRunGenerativeAppDraftAction(draftId)
  const {
    state,
    mergeState,
    resetState,
    actionPending,
    setActionPending,
    setLoadPending,
    pendingActionIds,
  } = useGenerativeAppHostState()
  const [throwByKey, setThrowByKey] = useState<Record<string, string>>({})
  const [themeOverride, setThemeOverride] = useState<ArenaGenerativeTheme | undefined>(undefined)
  const [copiedPagePrompt, setCopiedPagePrompt] = useState(false)

  const manifest = draftQuery.data?.manifest
  const apiBindings = draftQuery.data?.apiBindings
  const streamingIds = useMemo(
    () => new Set(manifest && apiBindings ? streamingActionIdsFrom(manifest, apiBindings) : []),
    [manifest, apiBindings]
  )
  const compiled = useMemo(
    () => (manifest ? compileGenerativeUx(manifest, apiBindings ?? []) : undefined),
    [manifest, apiBindings]
  )
  const compiledPages = compiled?.pages
  const uxPlan = compiled?.uxPlan

  const actionNavigate = manifest ? actionNavigateFrom(manifest) : {}
  const actionHostKeys = manifest ? actionHostKeysFrom(manifest, apiBindings ?? []) : {}
  const actionHiddenInputs = manifest ? actionHiddenInputsFrom(manifest, apiBindings ?? []) : {}
  const actionChatProtocol = manifest ? actionChatProtocolFrom(manifest, apiBindings ?? []) : {}

  const executeAction = async (actionId: string, values: Record<string, unknown>) =>
    streamingIds.has(actionId)
      ? await runGenerativeAppDraftActionStream({
          draftId,
          actionId,
          values,
          onChunk: (accumulated) => {
            mergeState(streamingContentState(accumulated))
          },
        })
      : await runAction.mutateAsync({ actionId, values })

  const navigate = (target: string) => {
    mergeState(clearedActionErrorState())
    router.push(navigationHref(`${ARENA_GENERATIVE_APP_PREVIEW_BASE_PATH}/${draftId}`, target))
  }

  const runtime = useGenerativeAppRuntime({
    runJson: (actionId, values, surface) => runAction.mutateAsync({ actionId, values, surface }),
    runStream: (actionId, values, onChunk, surface) =>
      runGenerativeAppDraftActionStream({
        draftId,
        actionId,
        values,
        surface,
        onChunk,
      }),
    isStreaming: (actionId) => streamingIds.has(actionId),
    actionNavigate,
    navigate,
    mergeState,
    setActionPending,
    logger,
    uxPlan,
  })

  const { reload, canRefresh } = usePageLoadActions({
    pagePath,
    actionIds: manifest?.pages[pagePath]?.onLoad ?? [],
    values: pageParams,
    actionPending,
    runAction: async (actionId, values) => {
      if (!actionPending) runtime.rememberLoad(actionId, values)
      return executeAction(actionId, values)
    },
    mergeState,
    resetState,
    setLoadPending,
  })

  if (draftQuery.isLoading) {
    return <p className='p-8 text-[var(--color-ds-grey-500,#8a8d99)] text-sm'>Loading…</p>
  }

  if (draftQuery.isError || !draftQuery.data || !manifest) {
    return (
      <div className='p-8 text-center text-[var(--text-error)]'>
        {toError(draftQuery.error).message || 'Unable to load this draft'}
      </div>
    )
  }

  const page = manifest.pages[pagePath]
  if (!page || !isJsonRenderSpec(page.spec)) {
    return <div className='p-8 text-center'>Page not found</div>
  }

  const actionError = actionErrorFrom(state)
  const schemaWarning = actionSchemaWarningFrom(state)
  const bannerMessage = actionError || schemaWarning
  const pending = pendingActionIds.size > 0
  const renderKey = `${pagePath}:${draftQuery.data.revision}`
  const throwMessage = throwByKey[renderKey]
  const diagnostics = [
    ...collectRenderDiagnostics(page.spec, state, pending),
    ...(throwMessage
      ? [{ kind: 'throw' as const, message: `SpecRenderer threw: ${throwMessage}` }]
      : []),
  ]
  const editInstructions = editInstructionsFromDiagnostics(diagnostics, pagePath)
  const liveTheme = themeOverride ?? manifest.theme
  const pagePrompt = pageEditPrompt(pagePath)

  return (
    <GenerativeAppThemeRoot theme={liveTheme}>
      <div className='min-h-screen'>
        <div className='flex flex-wrap items-center justify-between gap-2 border-[var(--gui-border,#e2e3e5)] border-b bg-[var(--gui-canvas,#f7f8f9)] px-4 py-2 text-[var(--gui-text-muted,#8a8d99)] text-xs'>
          <span>Preview — not published. CTAs run against this draft.</span>
          <button
            type='button'
            data-testid='copy-page-edit-prompt'
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(pagePrompt)
                setCopiedPagePrompt(true)
              } catch {
                setCopiedPagePrompt(false)
              }
            }}
            className='text-[var(--gui-brand,#1a73e8)] hover:underline'
          >
            {copiedPagePrompt ? 'Copied' : 'Copy page edit prompt'}
          </button>
        </div>
        <PreviewThemePicker theme={liveTheme} onChange={setThemeOverride} />
        {bannerMessage ? (
          <ActionErrorBanner
            message={bannerMessage}
            tone={actionError ? 'error' : 'warning'}
            onDismiss={runtime.dismissError}
            onRetry={actionError && runtime.canRetry ? runtime.retry : undefined}
          />
        ) : null}
        {canRefresh ? <ActionRefreshButton onRefresh={reload} /> : null}
        {draftQuery.data.screenshotMatchNotes ? (
          <PreviewDiagnosticsBanner instructions={draftQuery.data.screenshotMatchNotes} />
        ) : null}
        <PreviewDiagnosticsBanner instructions={editInstructions} />
        <SpecRenderErrorBoundary
          key={renderKey}
          fallbackTitle='This page failed to render'
          onError={(message) => {
            setThrowByKey((current) => ({ ...current, [renderKey]: message }))
          }}
        >
          <SpecRenderer
            spec={compiledPages?.[pagePath]?.spec ?? page.spec}
            state={state}
            pending={pending}
            pendingActionIds={pendingActionIds}
            actionHostKeys={actionHostKeys}
            actionHiddenInputs={actionHiddenInputs}
            actionChatProtocol={actionChatProtocol}
            conversationStorageKey={`preview:${draftId}`}
            uxPlan={uxPlan}
            currentPath={pagePath}
            onNavigate={navigate}
            onRunAction={runtime.onRunAction}
            onSelectItem={(item, index) => {
              flushSync(() => {
                mergeState(selectedItemHostState(item, index))
              })
              scrollGenerativeAppToTop()
            }}
            onClearItem={() => {
              flushSync(() => {
                mergeState(clearedSelectedItemHostState())
              })
              scrollGenerativeAppToTop()
            }}
            onCancelPending={runtime.cancelPending}
          />
        </SpecRenderErrorBoundary>
        {runtime.toast ? (
          <ActionSuccessToast message={runtime.toast} onDone={runtime.clearToast} />
        ) : null}
        {runtime.confirm ? (
          <DestructiveConfirmDialog
            onCancel={runtime.cancelDestructive}
            onConfirm={runtime.confirmDestructive}
          />
        ) : null}
      </div>
    </GenerativeAppThemeRoot>
  )
}
