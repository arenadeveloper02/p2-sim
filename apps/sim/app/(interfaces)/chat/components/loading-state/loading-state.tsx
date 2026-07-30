'use client'

import { DeployedResponseLoader } from '@/app/(interfaces)/chat/components/message/components/deployed-response-loader'
import { DEPLOYED_CHAT_CANVAS_BG } from '@/app/(interfaces)/chat/constants'

/**
 * Full-page loading state while deployed chat config is fetched.
 */
export function ChatLoadingState() {
  return (
    <div
      className='light fixed inset-0 z-[100] flex items-center justify-center'
      style={{ backgroundColor: DEPLOYED_CHAT_CANVAS_BG }}
    >
      <DeployedResponseLoader size={160} className='py-0' />
    </div>
  )
}
