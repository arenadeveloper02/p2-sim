'use client'

import { ChipTag, Modal, ModalContent } from '@sim/emcn'
import { WelcomeMessageWithCtas } from '@/app/(interfaces)/chat/components/message/components/welcome-message-with-ctas'

interface DeployedChatDescriptionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  department?: string | null
  /** When set, `{{query}}` tokens submit that query and close the modal */
  onWelcomeQueryClick?: (query: string) => void
}

function shouldShowDepartmentBadge(department?: string | null): boolean {
  if (!department) return false
  const trimmed = department.trim()
  return trimmed.length > 0 && trimmed.toLowerCase() !== 'default'
}

export function DeployedChatDescriptionModal({
  open,
  onOpenChange,
  title,
  description,
  department,
  onWelcomeQueryClick,
}: DeployedChatDescriptionModalProps) {
  const showBadge = shouldShowDepartmentBadge(department)

  const handleQueryClick = (query: string) => {
    onOpenChange(false)
    onWelcomeQueryClick?.(query)
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        bare
        showClose={false}
        srTitle={title}
        size='lg'
        className='border-0 bg-transparent p-0 shadow-none'
      >
        <div className='rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6'>
          <div className='mb-4 flex items-center justify-between gap-3'>
            <h2 className='text-[20px] text-[var(--text-primary)] leading-[1.25]'>{title}</h2>
            {showBadge ? <ChipTag variant='gray'>{department}</ChipTag> : null}
          </div>

          <div className='rounded-xl border border-[var(--border)] bg-[var(--bg)] p-6'>
            <p className='whitespace-pre-wrap text-left text-[var(--text-primary)] text-sm leading-[1.6]'>
              <WelcomeMessageWithCtas
                content={description}
                variant='landing'
                onQueryClick={onWelcomeQueryClick ? handleQueryClick : undefined}
              />
            </p>
          </div>
        </div>
      </ModalContent>
    </Modal>
  )
}
