'use client'

import { useEffect, useState } from 'react'
import { CircleCheck, CircleX, FileCheck, Hourglass } from 'lucide-react'
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toastError,
  toastSuccess,
} from '@/components/ui'
import { useSession } from '@/lib/auth-client'
import { createLogger } from '@/lib/logs/console/logger'
import { cn } from '@/lib/utils'
import { useUiFlagsStore } from '@/stores/feature-flag/store'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'
import { RejectApprovalModal } from '../reject-modal/reject-modal'

const logger = createLogger('workflow-p2')

export const renderApprovalButton = (
  userPermissions: any,
  isDebugging: boolean,
  activeWorkflowId: string | null,
  handleOpenApproval: any,
  workspaceName?: string
) => {
  const [approval, setApproval] = useState<any>({})
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: session } = useSession()
  const { getApprovalStatus, approveRejectWorkflow } = useWorkflowRegistry()
  const { setGlobalActionsDisabled } = useUiFlagsStore()
  const canEdit = userPermissions.canEdit
  const isDisabled = !canEdit || isDebugging

  useEffect(() => {
    if (activeWorkflowId) {
      const workFlowStatus = getApprovalStatus(activeWorkflowId)
      workFlowStatus
        .then((e: any) => {
          setApproval(e)
          if (
            (e?.status === 'APPROVED' || e?.status === 'REJECTED') &&
            e?.userId === session?.user?.id
          ) {
            setGlobalActionsDisabled(true)
          } else if (e?.status === 'APPROVED' && e?.ownerId === session?.user?.id) {
            setGlobalActionsDisabled(false)
          } else if (e?.status === 'PENDING' && e?.ownerId === session?.user?.id) {
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

  const handleApproveRejectWorkflow = async (action: 'APPROVED' | 'REJECTED', reason?: string) => {
    if (!activeWorkflowId || !userPermissions.canEdit) return
    setIsSubmitting(true)
    try {
      const aRWorkflow = await approveRejectWorkflow(
        activeWorkflowId,
        action,
        reason || 'Reason not provided',
        approval.id
      )
      if (aRWorkflow) {
        setIsSubmitting(false)
        setIsRejectModalOpen(false)
        setGlobalActionsDisabled(true)

        // Show success toast based on action
        if (action === 'APPROVED') {
          toastSuccess('Workflow Approved', {
            description: 'The workflow has been successfully approved.',
          })
        } else {
          toastSuccess('Workflow Rejected', {
            description: reason
              ? `Workflow rejected: ${reason}`
              : 'The workflow has been rejected.',
          })
        }
      }
    } catch (error) {
      logger.error('Error approval workflow:', { error })
      setIsSubmitting(false)
      toastError('Action Failed', {
        description: `Failed to ${action.toLowerCase()} the workflow. Please try again.`,
      })
    }
  }

  const handleOpenReject = () => {
    setIsRejectModalOpen(true)
  }

  const handleReasonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReason(e.target.value)
  }

  const canShowApprovalRequest =
    !isDisabled && approval?.status !== 'PENDING' && approval?.ownerId === session?.user?.id
  workspaceName !== 'AGENTS APPROVAL'

  const canShowApproveReject =
    !isDisabled && approval?.status === 'PENDING' && approval?.userId === session?.user?.id

  return (
    <>
      {!isDisabled &&
        approval?.status === 'REJECTED' &&
        approval?.ownerId === session?.user?.id && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='outline'
                className='h-12 w-12 rounded-[11px] border bg-card text-card-foreground shadow-xs hover:bg-red-500 hover:text-white'
              >
                <CircleX className='h-5 w-5' />
                <span className='sr-only'>Rejected</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className='max-w-[300px]'>
              {approval?.comments
                ? approval.comments.charAt(0).toUpperCase() +
                  approval.comments.slice(1).toLowerCase()
                : ''}
            </TooltipContent>
          </Tooltip>
        )}
      {approval?.status === 'APPROVED' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='outline'
              className='h-12 w-12 rounded-[11px] border bg-card text-card-foreground shadow-xs hover:bg-green-500 hover:text-white'
            >
              <CircleCheck className='h-5 w-5' />
              <span className='sr-only'>Approved</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Approved</TooltipContent>
        </Tooltip>
      )}
      {((approval?.userId !== session?.user?.id && approval?.status === 'PENDING') ||
        (isDisabled &&
          approval?.ownerId === session?.user?.id &&
          approval?.status === 'PENDING')) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='outline'
              className={cn(
                'h-12 w-12 rounded-[11px] border bg-card text-card-foreground shadow-xs hover:bg-secondary'
              )}
            >
              <Hourglass className='h-5 w-5' />
              <span className='sr-only'>Pending Approval</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Pending Approval</TooltipContent>
        </Tooltip>
      )}

      {canShowApprovalRequest && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='outline'
              onClick={handleOpenApproval}
              className={cn(
                'h-12 w-12 rounded-[11px] border bg-card text-card-foreground shadow-xs hover:bg-secondary',
                'hover:border-[var(--brand-primary-hex)] hover:bg-[var(--brand-primary-hex)] hover:text-white'
              )}
            >
              <FileCheck className='h-5 w-5' />
              <span className='sr-only'>Ask For Approval of Workflow</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ask For Approval</TooltipContent>
        </Tooltip>
      )}

      {canShowApproveReject && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='outline'
                onClick={() => handleApproveRejectWorkflow('APPROVED')}
                className='h-12 w-12 rounded-[11px] border bg-card text-card-foreground shadow-xs hover:bg-green-500 hover:text-white'
              >
                <CircleCheck className='h-5 w-5' />
                <span className='sr-only'>Accept</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Approve Workflow</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='outline'
                onClick={handleOpenReject}
                className='h-12 w-12 rounded-[11px] border bg-card text-card-foreground shadow-xs hover:bg-red-500 hover:text-white'
              >
                <CircleX className='h-5 w-5' />
                <span className='sr-only'>Reject</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reject Workflow</TooltipContent>
          </Tooltip>
        </>
      )}

      {/* Reject approval Modal */}
      {activeWorkflowId && (
        <RejectApprovalModal
          open={isRejectModalOpen}
          onOpenChange={setIsRejectModalOpen}
          onConfirmReject={(reason: string) => {
            handleApproveRejectWorkflow('REJECTED', reason)
            setIsRejectModalOpen(false)
            setReason('')
          }}
          handleReasonChange={handleReasonChange}
          reason={reason}
          isSubmitting={isSubmitting}
        />
      )}
    </>
  )
}
