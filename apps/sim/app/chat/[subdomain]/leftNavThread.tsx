'use client'
import { MessageSquare, Plus } from 'lucide-react'
import { Tooltip, TooltipTrigger } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

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
  error: string | null
  currentChatId: string
  onSelectThread?: (chatId: string) => void
  onNewChat?: () => void
  isStreaming: boolean
}

const LeftNavThread = ({
  threads,
  isLoading,
  error,
  currentChatId,
  onSelectThread,
  onNewChat,
  isStreaming,
}: LeftNavThreadProps) => {
  return (
    <div className='absolute top-[70px] left-4 z-50 flex h-[calc(100%-84px)] w-64 flex-col rounded-[10px] border border-gray-200 bg-gray-50'>
      <div className='border-gray-200 border-b p-3'>
        <Button
          className='w-full justify-start gap-2 border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          variant='outline'
          onClick={() => {
            onNewChat?.()
          }}
          disabled={isLoading || isStreaming}
        >
          <Plus className='h-4 w-4' />
          New Chat
        </Button>
      </div>

      <div className='flex-1 overflow-y-auto'>
        <div className='space-y-1 p-2'>
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
                  className={`group relative flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-all duration-200 ${
                    isActive
                      ? 'border border-gray-200 bg-white shadow-sm'
                      : 'hover:bg-white hover:shadow-sm'
                  }`}
                  onClick={() => {
                    if (isActive) return
                    onSelectThread?.(thread.chatId)
                  }}
                >
                  <MessageSquare
                    className={`h-4 w-4 flex-shrink-0 ${
                      isActive ? 'text-blue-600' : 'text-gray-400'
                    }`}
                  />

                  <div className='min-w-0 flex-1'>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={`truncate font-medium text-sm ${
                              isActive ? 'text-gray-900' : 'text-gray-700'
                            }`}
                          >
                            {thread.title}
                          </div>
                        </TooltipTrigger>
                        {thread.title?.length > 23 && (
                          <TooltipContent side='bottom'>{thread.title}</TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  {/* Active indicator */}
                  {isActive && (
                    <div className='-translate-y-1/2 absolute top-1/2 left-0 h-6 w-1 rounded-r-full bg-blue-600' />
                  )}
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
    </div>
  )
}

export default LeftNavThread
