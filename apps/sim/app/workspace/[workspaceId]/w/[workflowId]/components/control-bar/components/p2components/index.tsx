import React, {  useEffect } from 'react'
import {
  Copy
} from 'lucide-react'
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui'
// import { useParams, useRouter } from 'next/navigation'

import { useWorkflowRegistry } from '@/stores/workflows/registry/store'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('workflow-p2')

export const renderApprovalButton = (userPermissions: any, isDebugging: boolean, activeWorkflowId: string | null) => {
      const {
        askApproveWorkflow,
        getApprovalStatus
      } = useWorkflowRegistry()
    const canEdit = userPermissions.canEdit
    const isDisabled = !canEdit || isDebugging

    useEffect(() => {
      if(activeWorkflowId){
         const workFlowStatus = getApprovalStatus(activeWorkflowId)
         console.log("workflowStatus",workFlowStatus)
      }
     
    }, [activeWorkflowId])

    const getTooltipText = () => {
      if (!canEdit) return 'Admin permission required to ask for approval'
      if (isDebugging) return 'Cannot ask for approval while debugging'
      return 'Ask For Approval'
    }
      /**
   * Handle duplicating the current workflow
   */
  const handleApprovalWorkflow = async () => {
    if (!activeWorkflowId || !userPermissions.canEdit) return
    try {
    //   const router = useRouter()
      
      const newWorkflow = await askApproveWorkflow(activeWorkflowId, '6GPiMTG96UJaRjPnnxflUGJsfQBro5OC')
      if (newWorkflow) {
        alert(`Sent for approval`)
        // const params = useParams()
        // const workspaceId = params.workspaceId as string
        // router.push(`/workspace/${workspaceId}/w/${activeWorkflowId}`)
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
              <Copy className='h-4 w-4' />
            </div>
          ) : (
            <Button
              variant='outline'
              onClick={handleApprovalWorkflow}
              className='h-12 w-12 rounded-[11px] border bg-card text-card-foreground shadow-xs hover:bg-secondary'
            >
              <Copy className='h-5 w-5' />
              <span className='sr-only'>Ask For Approval of Workflow</span>
            </Button>
          )}
        </TooltipTrigger>
        <TooltipContent>{getTooltipText()}</TooltipContent>
      </Tooltip>
    )
  }