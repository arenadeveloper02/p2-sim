'use client'
import { ArrowLeft, CirclePlus, MessageSquareText, RefreshCw } from 'lucide-react'
import { Tooltip } from '@/components/emcn'
import { Button } from '@/components/ui/button'
import { deployedChatExitEvent } from '@/app/arenaMixpanelEvents/mixpanelEvents'

interface ThreadRecord {
  chatId: string
  title: string
  workflowId: string
  createdAt: string
  updatedAt: string
}

interface LeftNavThreadProps {
  threads: ThreadRecord[]
  isLoading: boolean
  error?: string | null
  currentChatId: string
  onSelectThread?: (chatId: string) => void
  onNewChat?: () => void
  isStreaming: boolean
  workflowId?: string
  showReRun?: boolean
  onReRun?: () => void
}

const LeftNavThread = ({
  threads,
  isLoading,
  error,
  currentChatId,
  onSelectThread,
  onNewChat,
  isStreaming,
  workflowId,
  showReRun = false,
  onReRun,
}: LeftNavThreadProps) => {
  const params = new URLSearchParams(window.location.search)
  const workspaceId = params.get('workspaceId')
  const isFromControlBar = params.get('fromControlBar') === 'true'

  // Determine environment and construct exit URL
  const getExitUrl = () => {
    // If opened from control bar, redirect to workspace
    if (isFromControlBar && workspaceId && workflowId) {
      return `/workspace/${workspaceId}/w/${workflowId}`
    }
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname

      if (hostname.includes('localhost')) {
        return 'http://localhost:3001/hub/agents'
      }
      if (hostname.includes('dev-agent')) {
        return 'https://dev.thearena.ai/hub/agents'
      }
      if (hostname.includes('test-agent')) {
        return 'https://test.thearena.ai/hub/agents'
      }
      // prod - agent.thearena.ai
      return 'https://app.thearena.ai/hub/agents'
    }

    return '/'
  }

  return (
    <div className='absolute top-[86px] left-8 z-50 flex h-[calc(100%-95px)] w-[280px] flex-col rounded-[8px] bg-[#F3F8FE] px-2 py-4'>
      <div className='flex flex-col gap-2 '>
        {/* Re-Run CTA - shown above New Chat when custom fields exist */}
        {showReRun && onReRun && (
          <Button
            className='group h-[32px] w-full justify-start gap-2 rounded border-none bg-white font-normal text-[#41444C] text-sm hover:bg-white hover:font-semibold hover:text-[#2A2A2A] hover:shadow-md'
            variant='outline'
            onClick={onReRun}
            disabled={isLoading || isStreaming}
            title='Re-run workflow with new input values'
          >
            <RefreshCw className='h-4 w-4 text-[#6D717F] group-hover:text-[#1A73E8]' />
            Re-Run
          </Button>
        )}
        <Button
          className='group h-[32px] w-full justify-start gap-2 rounded border-none bg-white font-normal text-[#41444C] text-sm hover:bg-white hover:font-semibold hover:text-[#2A2A2A] hover:shadow-md'
          variant='outline'
          onClick={() => {
            onNewChat?.()
          }}
          disabled={isLoading || isStreaming}
        >
          <CirclePlus className='h-4 w-4 text-[#6D717F] group-hover:text-[#1A73E8]' />
          New Chat
        </Button>
      </div>

      <hr className='my-6 text-[#E2E3E5]' />

      <div className='flex-1 overflow-y-auto'>
        <div className='flex flex-col gap-2'>
          {isLoading ? (
            <div className='flex items-center justify-center py-8'>
              <div className='text-gray-500 text-sm'>Loading threads...</div>
            </div>
          ) : error ? (
            <div className='flex items-center justify-center py-8'>
              <div className='text-red-500 text-sm'>Failed to load threads</div>
            </div>
          ) : threads?.length > 0 ? (
            threads.map((thread) => {
              const isActive = currentChatId === thread.chatId
              return (
                <div
                  key={thread.chatId}
                  className={
                    'group flex h-[32px] cursor-pointer items-center gap-2 rounded bg-white px-1 py-1.5 font-normal text-sm hover:shadow-md'
                  }
                  onClick={() => {
                    if (isActive) return
                    onSelectThread?.(thread.chatId)
                  }}
                >
                  <MessageSquareText
                    className={`mr-1 ml-1 h-4 w-4 group-hover:text-[#1A73E8] ${isActive ? 'text-[#1A73E8]' : 'text-[#6D717F]'}`}
                  />

                  <div className='min-w-0 flex-1'>
                    <Tooltip.Provider>
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <div
                            className={`truncate text-[#2A2A2A] text-sm group-hover:font-semibold ${
                              isActive ? 'font-semibold' : 'font-normal'
                            }`}
                          >
                            {thread.title}
                          </div>
                        </Tooltip.Trigger>
                        {thread.title?.length > 23 && (
                          <Tooltip.Content>{thread.title}</Tooltip.Content>
                        )}
                      </Tooltip.Root>
                    </Tooltip.Provider>
                  </div>
                </div>
              )
            })
          ) : (
            <div className='flex items-center justify-center py-8'>
              <div className='text-gray-500 text-sm'>No threads found</div>
            </div>
          )}
        </div>
      </div>

      <hr className='my-6 text-[#E2E3E5] ' />
      <div className='flex items-center gap-4 text-center font-normal text-[#2C2D33] text-sm'>
        {/* <Link href={getExitUrl()}> */}
        <Button
          variant='outline'
          className='group flex h-[32px] w-[32px] items-center justify-center border-[#E2E3E5] bg-white hover:bg-white hover:shadow-md'
          onClick={() => {
            deployedChatExitEvent({})
            const exitUrl = getExitUrl()
            window.location.replace(exitUrl)
          }}
        >
          <ArrowLeft className='h-4 w-4 text-[#6D717F] group-hover:text-[#1A73E8]' />
        </Button>
        {/* </Link> */}
        Exit Agent
      </div>
    </div>
  )
}

export default LeftNavThread
