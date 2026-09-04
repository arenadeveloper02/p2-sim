import { LoadingAgentP2 } from '@/components/ui/loading-agent-arena'

export default function ChatLoading() {
  return (
    <div className='light fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)]'>
      <LoadingAgentP2 size='lg' />
    </div>
  )
}
