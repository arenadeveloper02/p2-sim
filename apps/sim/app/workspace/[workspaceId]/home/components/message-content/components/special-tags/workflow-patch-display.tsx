'use client'

import { Button, toast } from '@sim/emcn'
import { useMutation } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import type { WorkflowPatchTagData } from '@/app/workspace/[workspaceId]/home/components/message-content/components/special-tags/special-tags'
import {
  applyLocalCopilotPatchContract,
  rejectLocalCopilotPatchContract,
} from '@/local-copilot/contracts/local-copilot'

interface WorkflowPatchDisplayProps {
  data: WorkflowPatchTagData
}

/**
 * Renders application-attested Apply/Reject controls for a proposed workflow patch.
 */
export function WorkflowPatchDisplay({ data }: WorkflowPatchDisplayProps) {
  const decision = useMutation({
    mutationFn: async (action: 'apply' | 'reject') => {
      if (action === 'apply') {
        return requestJson(applyLocalCopilotPatchContract, {
          params: { patchId: data.patchId },
          body: { workflowId: data.workflowId },
        })
      }
      return requestJson(rejectLocalCopilotPatchContract, {
        params: { patchId: data.patchId },
      })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update patch')
    },
  })

  if (decision.isSuccess) {
    return (
      <p className='text-[13px] text-[var(--text-secondary)]'>
        {decision.variables === 'apply' ? 'Patch applied' : 'Patch rejected'}
      </p>
    )
  }

  return (
    <div className='flex flex-col gap-2 rounded-[8px] border border-[var(--border-1)] p-3'>
      <div>
        <p className='font-medium text-[13px] text-[var(--text-primary)]'>{data.summary}</p>
        <p className='text-[12px] text-[var(--text-secondary)]'>
          Proposed workflow change — review before applying
        </p>
      </div>
      <div className='flex gap-2'>
        <Button
          variant='primary'
          size='sm'
          disabled={decision.isPending}
          onClick={() => decision.mutate('apply')}
        >
          Apply
        </Button>
        <Button
          variant='outline'
          size='sm'
          disabled={decision.isPending}
          onClick={() => decision.mutate('reject')}
        >
          Reject
        </Button>
      </div>
    </div>
  )
}
