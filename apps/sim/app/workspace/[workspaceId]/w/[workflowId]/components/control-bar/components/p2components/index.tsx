'use client'

import { useEffect, useState } from 'react'
import { CircleCheck, CircleX, FileCheck } from 'lucide-react'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { useSession } from '@/lib/auth-client'
import { createLogger } from '@/lib/logs/console/logger'
import { cn } from '@/lib/utils'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'
import { useUiFlagsStore } from '@/stores/feature-flag/store'

const logger = createLogger('workflow-p2')

export const renderApprovalButton = (
  userPermissions: any,
  isDebugging: boolean,
  activeWorkflowId: string | null
) => {
  const [approval, setApproval] = useState<any>()
  const { data: session } = useSession()
  const { askApproveWorkflow, getApprovalStatus, approveRejectWorkflow } = useWorkflowRegistry()
  const { setGlobalActionsDisabled} = useUiFlagsStore();
  const canEdit = userPermissions.canEdit
  const isDisabled = !canEdit || isDebugging

  useEffect(() => {
    if (activeWorkflowId) {
      const workFlowStatus = getApprovalStatus(activeWorkflowId)
      workFlowStatus
        .then((e:any) => {
          setApproval(e)
          if (e?.status === "APPROVED" || e?.status === "REJECTED") {
            setGlobalActionsDisabled(true)
          } else if (e?.status === "PENDING" && e?.ownerId === session?.user?.id) {
            setGlobalActionsDisabled(true)
          } else {
            setGlobalActionsDisabled(false)
          }
        })
        .catch((error) => {
          console.log(error)
        })
    }
  }, [activeWorkflowId])

  const getTooltipText = () => {
    if (!canEdit) return 'Admin permission required to ask for approval'
    if (isDebugging) return 'Cannot ask for approval while debugging'

    if (approval?.status === 'APPROVED') return 'Already approved'
    if (approval?.status === 'REJECTED') return 'Already rejected'

    if (approval?.status === 'PENDING' && approval?.userId === session?.user?.id) {
      return 'Approve or Reject the workflow'
    }

    return 'Ask For Approval'
  }

  const handleApprovalWorkflow = async () => {
    if (!activeWorkflowId || !userPermissions.canEdit) return
    try {
      const newWorkflow = await askApproveWorkflow(
        activeWorkflowId,
        '6GPiMTG96UJaRjPnnxflUGJsfQBro5OC'
      )
      if (newWorkflow) {
        alert(`Sent for approval`)
        setGlobalActionsDisabled(true)
      }
    } catch (error) {
      logger.error('Error approval workflow:', { error })
    }
  }

  const handleApproveRejectWorkflow = async (action: 'APPROVED' | 'REJECTED') => {
    if (!activeWorkflowId || !userPermissions.canEdit) return
    try {
      const aRWorkflow = await approveRejectWorkflow(
        activeWorkflowId,
        action,
        'Reason for approval/rejection',
        approval.id
      )
      if (aRWorkflow) {
        if (action === 'APPROVED') {
          alert(`Approved`)
        } else {
          alert(`Rejected`)
        }
        setGlobalActionsDisabled(true)
      }
    } catch (error) {
      logger.error('Error approval workflow:', { error })
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {isDisabled ? (
          <div className='inline-flex h-12 w-12 cursor-not-allowed items-center justify-center rounded-[11px] border bg-card text-card-foreground opacity-50 shadow-xs transition-colors'>
            <FileCheck className='h-4 w-4' />
          </div>
        ) : approval?.status === 'APPROVED' || approval?.status === 'REJECTED' ? (
          <></>
        ) : approval?.status !== 'PENDING' && approval?.userId !== session?.user?.id ? (
          <Button
            variant='outline'
            onClick={handleApprovalWorkflow}
            className={cn(
              'h-12 w-12 rounded-[11px] border bg-card text-card-foreground shadow-xs hover:bg-secondary',
              'hover:border-[var(--brand-primary-hex)] hover:bg-[var(--brand-primary-hex)] hover:text-white'
            )}
          >
            <FileCheck className='h-5 w-5' />
            <span className='sr-only'>Ask For Approval of Workflow</span>
          </Button>
        ) : (
          <>
            <Button
              variant='outline'
              onClick={() => handleApproveRejectWorkflow('APPROVED')}
              className='h-12 w-12 rounded-[11px] border bg-card text-card-foreground shadow-xs hover:bg-green-500 hover:text-white'
            >
              <CircleCheck className='h-5 w-5' />
              <span className='sr-only'>Accept</span>
            </Button>
            <Button
              variant='outline'
              onClick={() => handleApproveRejectWorkflow('REJECTED')}
              className='h-12 w-12 rounded-[11px] border bg-card text-card-foreground shadow-xs hover:bg-red-500 hover:text-white'
            >
              <CircleX className='h-5 w-5' />
              <span className='sr-only'>Reject</span>
            </Button>
          </>
        )}
      </TooltipTrigger>
      <TooltipContent>{getTooltipText()}</TooltipContent>
    </Tooltip>
  )
}
