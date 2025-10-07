'use client'

import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toastError,
  toastSuccess,
} from '@/components/ui'
import { useSession } from '@/lib/auth-client'
import { createLogger } from '@/lib/logs/console/logger'
import { cn } from '@/lib/utils'
import { categories } from '@/app/workspace/[workspaceId]/templates/templates'
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
  const { askApproveWorkflow, getApprovalStatus } = useWorkflowRegistry()
  const { setGlobalActionsDisabled } = useUiFlagsStore()

  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [isCategoryDisabled, setIsCategoryDisabled] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSelectUser = (user: any) => {
    setSelectedUser(user)
  }

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Fetch approval data to get existing category and user
  useEffect(() => {
    if (workflowId && open) {
      const fetchApprovalData = async () => {
        try {
          const approvalData = (await getApprovalStatus(workflowId)) as any
          // Handle category
          if (approvalData?.category) {
            setSelectedCategory(approvalData.category)
            setIsCategoryDisabled(true) // Disable category select if existing category found
          } else {
            setIsCategoryDisabled(false) // Enable category select if no existing category
          }

          // Handle description
          if (approvalData?.description) {
            setDescription(approvalData.description)
          }

          // Handle user
          if (approvalData?.userId) {
            // Find the user in the users list by userId
            const existingUser = users?.find((user) => user.id === approvalData.userId)
            if (existingUser) {
              setSelectedUser(existingUser)
            }
          }
        } catch (error) {
          logger.error('Error fetching approval data:', { error })
          // Keep default values if fetch fails
          setIsCategoryDisabled(false) // Enable category select on error
        }
      }
      fetchApprovalData()
    }
  }, [workflowId, open, getApprovalStatus, users])

  const handleCloseModal = () => {
    onOpenChange(false)
    setSelectedUser(null)
    setSelectedCategory('')
    setDescription('')
    setIsCategoryDisabled(false) // Reset category disabled state
  }

  const handleSendForApproval = async () => {
    if (!workflowId || !canEdit) return
    setIsSubmitting(true)
    try {
      const newWorkflow = await askApproveWorkflow(
        workflowId,
        selectedUser.id,
        selectedCategory,
        description
      )
      if (newWorkflow) {
        setIsSubmitting(false)
        setGlobalActionsDisabled(true)
        handleCloseModal()
        toastSuccess('Request Submitted', {
          description: `Workflow sent for approval to ${selectedUser.name || selectedUser.email}`,
        })
      }
    } catch (error) {
      logger.error('Error approval workflow:', { error })
      setIsSubmitting(false)
      toastError('Approval Request Failed', {
        description: 'Something went wrong while sending the approval request. Please try again.',
      })
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
          <div className='h-[300px] overflow-y-auto p-6'>
            <div className='flex flex-col gap-4'>
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

              <div className='flex flex-col gap-1'>
                <p className='font-medium text-sm'>Select Category</p>
                <Select
                  value={selectedCategory}
                  onValueChange={(value) => setSelectedCategory(value)}
                  disabled={isCategoryDisabled}
                >
                  <SelectTrigger className='h-10'>
                    <SelectValue placeholder='Select category' />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='flex flex-col gap-1'>
                <p className='font-medium text-sm'>Description</p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder='Enter description for the agent...'
                  className='flex min-h-[80px] w-full rounded-[8px] border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>

        <div className='flex flex-shrink-0 justify-between border-t px-6 py-4'>
          <Button variant='outline' onClick={handleCloseModal}>
            Cancel
          </Button>

          <Button
            form='deploy-api-form'
            disabled={isSubmitting || selectedUser === null || selectedCategory === ''}
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
