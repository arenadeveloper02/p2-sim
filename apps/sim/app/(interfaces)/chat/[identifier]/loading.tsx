import { DeployedResponseLoader } from '@/app/(interfaces)/chat/components/message/components/deployed-response-loader'

export default function ChatLoading() {
  return (
    <div className='fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)]'>
      <DeployedResponseLoader size={160} className='py-0' />
    </div>
  )
}
