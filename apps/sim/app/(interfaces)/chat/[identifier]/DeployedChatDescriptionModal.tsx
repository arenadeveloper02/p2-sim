'use client'

import { Modal, ModalContent } from '@sim/emcn'
import { WelcomeMessageWithCtas } from '@/app/(interfaces)/chat/components/message/components/welcome-message-with-ctas'
import {
  DEPLOYED_CHAT_CANVAS_BG,
  DEPLOYED_CHAT_DIVIDER,
  DEPLOYED_CHAT_SIDEBAR_BORDER,
  DEPLOYED_CHAT_TEXT_BODY,
  DEPLOYED_CHAT_TEXT_DISPLAY,
} from '@/app/(interfaces)/chat/constants'

const DEPLOYED_CHAT_DEPARTMENT_BADGE_TEXT = '#B364D7'
const DEPLOYED_CHAT_DEPARTMENT_BADGE_BORDER = '#F0E0F7'

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
        <div
          className='rounded-2xl border p-6'
          style={{
            backgroundColor: DEPLOYED_CHAT_CANVAS_BG,
            borderColor: DEPLOYED_CHAT_SIDEBAR_BORDER,
          }}
        >
          <div className='mb-4 flex items-center justify-between gap-3'>
            <h2
              className='font-semibold text-[20px] leading-[1.25]'
              style={{ color: DEPLOYED_CHAT_TEXT_DISPLAY }}
            >
              {title}
            </h2>
            {showBadge ? (
              <span
                className='shrink-0 rounded-md border bg-white px-3 py-1 font-medium text-[13px]'
                style={{
                  color: DEPLOYED_CHAT_DEPARTMENT_BADGE_TEXT,
                  borderColor: DEPLOYED_CHAT_DEPARTMENT_BADGE_BORDER,
                }}
              >
                {department}
              </span>
            ) : null}
          </div>

          <div
            className='rounded-xl border bg-white p-6'
            style={{ borderColor: DEPLOYED_CHAT_DIVIDER }}
          >
            <p
              className='whitespace-pre-wrap text-left font-normal text-[14px] leading-[1.6]'
              style={{ color: DEPLOYED_CHAT_TEXT_BODY }}
            >
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
