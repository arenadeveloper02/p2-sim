import { useEffect,useState } from 'react'
import { Copy } from 'lucide-react'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { useSession } from '@/lib/auth-client'

import { createLogger } from '@/lib/logs/console/logger'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'

const logger = createLogger('workflow-p2')

export const renderApprovalButton = (
  userPermissions: any,
  isDebugging: boolean,
  activeWorkflowId: string | null
) => {
  const [approval, setApproval] = useState<any>()
  const { data: session } = useSession()
  const { askApproveWorkflow, getApprovalStatus } = useWorkflowRegistry()
  const canEdit = userPermissions.canEdit
  const isDisabled = !canEdit || isDebugging

  useEffect(() => {
    if (activeWorkflowId) {
      const workFlowStatus = getApprovalStatus(activeWorkflowId)
      workFlowStatus.then((e)=>{
        setApproval(e)
      }).catch((error)=>{
        // Handle the error here
      })
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
      const newWorkflow = await askApproveWorkflow(
        activeWorkflowId,
        '6GPiMTG96UJaRjPnnxflUGJsfQBro5OC'
      )
      if (newWorkflow) {
        alert(`Sent for approval`)
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
        ) : approval?.status !== 'Pending' && approval?.userId !==session?.user?.id ? (
          <Button
            variant='outline'
            onClick={handleApprovalWorkflow}
            className='h-12 w-12 rounded-[11px] border bg-card text-card-foreground shadow-xs hover:bg-secondary'
          >
            <Copy className='h-5 w-5' />
            <span className='sr-only'>Ask For Approval of Workflow</span>
          </Button>
        ):(
          <>
          <Button
            variant='outline'
            className='h-12 w-12 rounded-[11px] border bg-card text-card-foreground shadow-xs hover:bg-secondary'
          >
            <Copy className='h-5 w-5' />
            <span className='sr-only'>Accept</span>
          </Button>
          <Button
            variant='outline'
            className='h-12 w-12 rounded-[11px] border bg-card text-card-foreground shadow-xs hover:bg-secondary'
          >
            <Copy className='h-5 w-5' />
            <span className='sr-only'>Reject</span>
          </Button>
          </>
          
        )}
      </TooltipTrigger>
      <TooltipContent>{getTooltipText()}</TooltipContent>
    </Tooltip>
  )
}
