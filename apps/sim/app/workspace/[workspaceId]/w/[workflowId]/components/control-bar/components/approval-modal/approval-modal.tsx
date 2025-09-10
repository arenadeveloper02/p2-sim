'use client'

import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui'
import { useSession } from '@/lib/auth-client'
import { createLogger } from '@/lib/logs/console/logger'
import { cn } from '@/lib/utils'
import { useWorkflowRegistry } from '@/stores'
import { useUserApprovalStore } from '@/stores/approver-list/store'
import { useUiFlagsStore } from '@/stores/feature-flag/store'
import UserSearch from './components/user-list'

const logger = createLogger('ApprovalModal')

interface ApprovalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  canEdit: boolean
}

export function GetApprovalModal({ open, onOpenChange, workflowId, canEdit }: ApprovalModalProps) {
  const { data: session } = useSession()
  const userId = session?.user?.id
  const { users, loading, error, fetchUsers } = useUserApprovalStore()
  const { askApproveWorkflow } = useWorkflowRegistry()
  const { setGlobalActionsDisabled } = useUiFlagsStore()

  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSelectUser = (user: any) => {
    setSelectedUser(user)
  }

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleCloseModal = () => {
    onOpenChange(false)
    setSelectedUser(null)
  }

  const handleSendForApproval = async () => {
    if (!workflowId || !canEdit) return
    setIsSubmitting(true)
    try {
      const newWorkflow = await askApproveWorkflow(workflowId, selectedUser.id)
      if (newWorkflow) {
        setIsSubmitting(false)
        setGlobalActionsDisabled(true)
        handleCloseModal()
        // return (
        //   <Alert>
        //     <AlertTitle>Request Submitted</AlertTitle>
        //     <AlertDescription>Sent for Approval</AlertDescription>
        //   </Alert>
        // )
        alert('Request Submitted: Sent for Approval')
      }
    } catch (error) {
      logger.error('Error approval workflow:', { error })
      setIsSubmitting(false)
      alert('Error: Something went wrong')
      // return (
      //   <Alert>
      //     <AlertTitle>Error</AlertTitle>
      //     <AlertDescription>Something went wrong</AlertDescription>
      //   </Alert>
      // )
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleCloseModal}>
      <DialogContent
        className='flex max-h-[78vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[480px]'
        hideCloseButton
      >
        <DialogHeader className='flex-shrink-0 border-b px-6 py-4'>
          <div className='flex items-center justify-between'>
            <DialogTitle className='font-medium text-lg'>Send for Approval</DialogTitle>
            <Button variant='ghost' size='icon' className='h-8 w-8 p-0' onClick={handleCloseModal}>
              <X className='h-4 w-4' />
              <span className='sr-only'>Close</span>
            </Button>
          </div>
        </DialogHeader>

        <div className='flex flex-1 flex-col overflow-hidden '>
          <div className='h-[200px] overflow-y-auto p-6'>
            <div className='flex flex-col gap-1'>
              <p className='font-medium text-sm'>Select Approver</p>
              <UserSearch
                users={users?.filter((u) => u.id !== userId) || []}
                selectedUser={selectedUser}
                onSelectUser={handleSelectUser}
                loading={loading}
                error={error}
              />
            </div>
          </div>
        </div>

        <div className='flex flex-shrink-0 justify-between border-t px-6 py-4'>
          <Button variant='outline' onClick={handleCloseModal}>
            Cancel
          </Button>

          <Button
            form='deploy-api-form'
            disabled={isSubmitting || selectedUser === null}
            onClick={handleSendForApproval}
            className={cn(
              'gap-2 font-medium',
              'bg-[var(--brand-primary-hex)] hover:bg-[var(--brand-primary-hover-hex)]',
              'shadow-[0_0_0_0_var(--brand-primary-hover-hex)]',
              'text-white transition-all duration-200',
              'disabled:opacity-50 disabled:hover:bg-[var(--brand-primary-hover-hex)] disabled:hover:shadow-none'
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                Submitting...
              </>
            ) : (
              'Send for Approval'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
