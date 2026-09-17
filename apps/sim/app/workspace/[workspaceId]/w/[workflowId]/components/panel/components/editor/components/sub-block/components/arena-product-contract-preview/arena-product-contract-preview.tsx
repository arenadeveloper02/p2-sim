'use client'

import { type ReactNode, useMemo, useState } from 'react'
import { Chip, ChipDropdown, ChipTextarea, Label } from '@sim/emcn'
import { getErrorMessage } from '@sim/utils/errors'
import { useParams } from 'next/navigation'
import {
  ARENA_GENERATIVE_IA_PRESETS,
  type ArenaGenerativeAfterSubmit,
  type ArenaGenerativeCompositionPatch,
  type ArenaGenerativeHistoryMode,
  type ArenaGenerativeInspectMode,
  type ArenaGenerativeMutationsMode,
  type ArenaGenerativeNavigateWhen,
} from '@/lib/arena-generative-ui/composition'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'
import {
  useGenerativeAppDraft,
  usePatchGenerativeAppDraft,
  usePlanGenerativeApp,
} from '@/hooks/queries/arena-generative-apps'

interface ArenaProductContractPreviewProps {
  blockId: string
  children: ReactNode
}

const AFTER_SUBMIT_OPTIONS = [
  { value: 'replace', label: 'Replace the form' },
  { value: 'stack', label: 'Stack results below' },
  { value: 'alongside', label: 'Keep both visible' },
]

const NAVIGATE_WHEN_OPTIONS = [
  { value: 'immediate', label: 'Leave immediately (wait on Results)' },
  { value: 'success', label: 'Leave only if the API succeeds' },
]

const INSPECT_OPTIONS = [
  { value: 'none', label: 'Not applicable' },
  { value: 'same-page', label: 'Stay here' },
  { value: 'navigate', label: 'Leave to a detail page' },
]

const HISTORY_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'peer-tab', label: 'History tab' },
]

const MUTATIONS_OPTIONS = [
  { value: 'local', label: 'On this page' },
  { value: 'pages', label: 'Separate pages' },
]

const PRESET_OPTIONS = ARENA_GENERATIVE_IA_PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.label,
}))

/**
 * Product-contract editor under the Draft dropdown for Generate from Plan.
 * Knobs PATCH the brief; Adjust this plan re-runs the planner only.
 */
export function ArenaProductContractPreview({
  blockId,
  children,
}: ArenaProductContractPreviewProps) {
  const params = useParams<{ workspaceId?: string }>()
  const [draftId] = useSubBlockValue<string>(blockId, 'existingDraftId')
  const selectedId = draftId?.trim() ?? ''
  const { data, isLoading } = useGenerativeAppDraft(selectedId || undefined)
  const patchDraft = usePatchGenerativeAppDraft()
  const planApp = usePlanGenerativeApp()
  const [planChanges, setPlanChanges] = useState('')
  const [error, setError] = useState<string | null>(null)

  const composition = data?.composition
  const busy = patchDraft.isPending || planApp.isPending

  const presetHint = useMemo(() => {
    if (!composition) return undefined
    return ARENA_GENERATIVE_IA_PRESETS.find(
      (preset) =>
        preset.composition.afterSubmit === composition.afterSubmit &&
        preset.composition.inspect === composition.inspect &&
        preset.composition.history === composition.history &&
        preset.composition.mutations === composition.mutations &&
        (preset.composition.navigateWhen ?? 'immediate') ===
          (composition.navigateWhen ?? 'immediate')
    )?.id
  }, [composition])

  const patch = async (next: {
    composition?: ArenaGenerativeCompositionPatch
    iaPreset?: (typeof ARENA_GENERATIVE_IA_PRESETS)[number]['id']
  }) => {
    if (!selectedId) return
    setError(null)
    try {
      await patchDraft.mutateAsync({ id: selectedId, body: next })
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update plan'))
    }
  }

  const adjust = async () => {
    if (!selectedId || !planChanges.trim() || !data) return
    setError(null)
    try {
      await planApp.mutateAsync({
        existingDraftId: selectedId,
        planChanges: planChanges.trim(),
        workflowId: data.workflowId,
        workspaceId: params.workspaceId,
        apiBindings: data.apiBindings,
      })
      setPlanChanges('')
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to adjust plan'))
    }
  }

  return (
    <div className='flex flex-col gap-2'>
      {children}
      {selectedId ? (
        <div className='flex flex-col gap-2'>
          {isLoading ? (
            <p className='text-[var(--text-secondary)] text-sm'>Loading product contract…</p>
          ) : !data?.composition ? (
            <p className='text-[var(--text-secondary)] text-sm'>
              This draft has no product contract yet. Run Plan App first.
            </p>
          ) : (
            <>
              <Label className='flex items-baseline gap-1.5 whitespace-nowrap pl-0.5'>
                IA starting point
              </Label>
              <ChipDropdown
                options={PRESET_OPTIONS}
                value={presetHint}
                placeholder='Optional preset'
                fullWidth
                disabled={busy}
                onChange={(value) =>
                  patch({
                    iaPreset: value as (typeof ARENA_GENERATIVE_IA_PRESETS)[number]['id'],
                  })
                }
              />
              <Label className='flex items-baseline gap-1.5 whitespace-nowrap pl-0.5'>
                After submit
              </Label>
              <ChipDropdown
                options={AFTER_SUBMIT_OPTIONS}
                value={composition.afterSubmit}
                fullWidth
                disabled={busy}
                onChange={(value) =>
                  patch({ composition: { afterSubmit: value as ArenaGenerativeAfterSubmit } })
                }
              />
              {composition.afterSubmit === 'replace' ? (
                <>
                  <Label className='flex items-baseline gap-1.5 whitespace-nowrap pl-0.5'>
                    When to leave
                  </Label>
                  <ChipDropdown
                    options={NAVIGATE_WHEN_OPTIONS}
                    value={composition.navigateWhen ?? 'immediate'}
                    fullWidth
                    disabled={busy}
                    onChange={(value) =>
                      patch({
                        composition: { navigateWhen: value as ArenaGenerativeNavigateWhen },
                      })
                    }
                  />
                </>
              ) : null}
              <Label className='flex items-baseline gap-1.5 whitespace-nowrap pl-0.5'>
                Opening a row
              </Label>
              <ChipDropdown
                options={INSPECT_OPTIONS}
                value={composition.inspect}
                fullWidth
                disabled={busy}
                onChange={(value) =>
                  patch({ composition: { inspect: value as ArenaGenerativeInspectMode } })
                }
              />
              <Label className='flex items-baseline gap-1.5 whitespace-nowrap pl-0.5'>
                Previous runs
              </Label>
              <ChipDropdown
                options={HISTORY_OPTIONS}
                value={composition.history}
                fullWidth
                disabled={busy}
                onChange={(value) =>
                  patch({ composition: { history: value as ArenaGenerativeHistoryMode } })
                }
              />
              <Label className='flex items-baseline gap-1.5 whitespace-nowrap pl-0.5'>
                Create and edit
              </Label>
              <ChipDropdown
                options={MUTATIONS_OPTIONS}
                value={composition.mutations}
                fullWidth
                disabled={busy}
                onChange={(value) =>
                  patch({ composition: { mutations: value as ArenaGenerativeMutationsMode } })
                }
              />
              <Label className='flex items-baseline gap-1.5 whitespace-nowrap pl-0.5'>
                Sitemap
              </Label>
              <ul className='rounded-sm border border-[var(--border-1)] bg-[var(--surface-1)] p-2 text-[var(--text-secondary)] text-sm'>
                {(data.plannedPages ?? []).map((page) => (
                  <li key={page.path}>
                    {page.path}
                    {page.title ? ` — ${page.title}` : ''}
                  </li>
                ))}
              </ul>
              {(data.apiBindings ?? []).length > 0 ? (
                <p className='text-[var(--text-secondary)] text-xs'>
                  APIs: {data.apiBindings.map((binding) => binding.key).join(', ')}
                </p>
              ) : null}
              {data.compositionIssues.length > 0 ? (
                <p className='text-[var(--text-error)] text-xs'>
                  {data.compositionIssues.join(' ')} Adjust this plan so the sitemap matches.
                </p>
              ) : null}
              <Label className='flex items-baseline gap-1.5 whitespace-nowrap pl-0.5'>
                Adjust this plan
              </Label>
              <ChipTextarea
                value={planChanges}
                onChange={(event) => setPlanChanges(event.target.value)}
                placeholder='Inspect the task without leaving. Keep History.'
                rows={3}
                disabled={busy}
              />
              <Chip onClick={() => void adjust()} disabled={busy || !planChanges.trim()}>
                Adjust plan
              </Chip>
            </>
          )}
          {error ? <p className='text-[var(--text-error)] text-xs'>{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
