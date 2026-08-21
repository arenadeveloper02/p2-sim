'use client'

import type { ReactNode } from 'react'
import { Label } from '@sim/emcn'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'
import { useGenerativeAppDraft } from '@/hooks/queries/arena-generative-apps'

interface ArenaDraftBriefPreviewProps {
  blockId: string
  children: ReactNode
}

/**
 * Shows the selected draft's original generate brief under the Draft dropdown.
 * Display-only — does not write a sub-block value or copy into `userInput`.
 */
export function ArenaDraftBriefPreview({ blockId, children }: ArenaDraftBriefPreviewProps) {
  const [draftId] = useSubBlockValue<string>(blockId, 'existingDraftId')
  const selectedId = draftId?.trim() ?? ''
  const { data, isLoading } = useGenerativeAppDraft(selectedId || undefined)
  const brief = data?.brief?.trim()

  return (
    <div className='flex flex-col gap-2'>
      {children}
      {selectedId ? (
        <div className='flex flex-col gap-1.5'>
          <Label className='flex items-baseline gap-1.5 whitespace-nowrap pl-0.5'>
            Original User Input
          </Label>
          <div className='max-h-[120px] overflow-y-auto whitespace-pre-wrap break-words rounded-sm border border-[var(--border-1)] bg-[var(--surface-1)] p-2 text-[var(--text-secondary)] text-sm'>
            {isLoading
              ? 'Loading original user input…'
              : brief
                ? brief
                : 'Original user input is not stored for this draft.'}
          </div>
        </div>
      ) : null}
    </div>
  )
}
