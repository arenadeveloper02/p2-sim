'use client'
import { Loader2, X } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Textarea } from '@/components/ui'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('ApprovalModal')

interface RejectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmReject: (reason: string) => void
  isSubmitting?: boolean
  reason: string
  handleReasonChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
}

export function RejectApprovalModal({
  open,
  onOpenChange,
  onConfirmReject,
  isSubmitting,
  handleReasonChange,
  reason,
}: RejectModalProps) {
  const handleCloseModal = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleCloseModal}>
      <DialogContent
        className='flex max-h-[78vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[480px]'
        hideCloseButton
      >
        <DialogHeader className='flex-shrink-0 border-b px-6 py-4'>
          <div className='flex items-center justify-between'>
            <DialogTitle className='font-medium text-lg'>Justify the Rejection</DialogTitle>
            <Button variant='ghost' size='icon' className='h-8 w-8 p-0' onClick={handleCloseModal}>
              <X className='h-4 w-4' />
              <span className='sr-only'>Close</span>
            </Button>
          </div>
        </DialogHeader>

        <div className='flex flex-1 flex-col overflow-hidden '>
          <div className='h-[200px] overflow-y-auto p-6'>
            <div className='flex flex-col gap-1'>
              <p className='font-medium text-sm'>Rejection Reason</p>
              <Textarea
                placeholder='Enter the reason for rejection...'
                className='min-h-[100px]'
                value={reason}
                onChange={handleReasonChange}
              />
            </div>
          </div>
        </div>

        <div className='flex flex-shrink-0 justify-between border-t px-6 py-4'>
          <Button variant='outline' onClick={handleCloseModal}>
            Cancel
          </Button>

          <Button
            disabled={reason.trim().length === 0 || isSubmitting}
            variant={'destructive'}
            onClick={() => onConfirmReject(reason)}
          >
            {isSubmitting ? (
              <>
                <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                Rejecting...
              </>
            ) : (
              'Reject Workflow'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
