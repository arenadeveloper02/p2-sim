'use client'

import { Button, toast } from '@sim/emcn'
import { useMutation } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import { copilotConfirmContract } from '@/lib/api/contracts/copilot'
import type { ToolConfirmationTagData } from '@/app/workspace/[workspaceId]/home/components/message-content/components/special-tags/special-tags'

interface ToolConfirmationDisplayProps {
  data: ToolConfirmationTagData
}

/**
 * Renders application-attested approval controls for a pending high-risk tool.
 */
export function ToolConfirmationDisplay({ data }: ToolConfirmationDisplayProps) {
  const decision = useMutation({
    mutationFn: (status: 'success' | 'cancelled') =>
      requestJson(copilotConfirmContract, {
        body: {
          toolCallId: data.toolCallId,
          status,
          message: status === 'success' ? 'User approved action' : 'User rejected action',
        },
      }),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not submit confirmation')
    },
  })

  if (decision.isSuccess) {
    return (
      <p className='text-[13px] text-[var(--text-secondary)]'>
        {decision.variables === 'success' ? 'Approved' : 'Rejected'}
      </p>
    )
  }

  return (
    <div className='flex flex-col gap-2 rounded-[8px] border border-[var(--border-1)] p-3'>
      <div>
        <p className='font-medium text-[13px] text-[var(--text-primary)]'>{data.summary}</p>
        <p className='text-[12px] text-[var(--text-secondary)]'>
          {data.target ? `${data.category} action on ${data.target}` : `${data.category} action`}
          {data.estimatedCostLabel ? ` · Est. ${data.estimatedCostLabel}` : ''}
        </p>
      </div>
      <div className='flex gap-2'>
        <Button
          variant='primary'
          size='sm'
          disabled={decision.isPending}
          onClick={() => decision.mutate('success')}
        >
          Approve
        </Button>
        <Button
          variant='outline'
          size='sm'
          disabled={decision.isPending}
          onClick={() => decision.mutate('cancelled')}
        >
          Reject
        </Button>
      </div>
    </div>
  )
}
