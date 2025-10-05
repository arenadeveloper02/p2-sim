'use client'
import { useState, useEffect } from 'react'
import { MessageSquare, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
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

interface ApiResponse {
  records: ThreadRecord[]
  total: number
}

const LeftNavThread = ({ workflowId, setCurrentChatId, currentChatId, onThreadChange }: { 
  workflowId: string, 
  setCurrentChatId: (chatId: string) => void, 
  currentChatId: string,
  onThreadChange?: () => void
}) => {
  const params = new URLSearchParams(window.location.search)
  const workspaceId = params.get('workspaceId')
  const chatId = params.get('chatId')
  const router = useRouter()
  // const [currentChatId, setCurrentChatId] = useState(chatId || '')
  const [threads, setThreads] = useState<ThreadRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch threads from API
  useEffect(() => {
    const fetchThreads = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const response = await fetch(`/api/chat/${workflowId}/all-history`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch threads: ${response.status}`)
        }

        const data: ApiResponse = await response.json()
        setThreads(data.records || [])
        
        // If no chatId is present and no currentChatId
        if (!chatId && !currentChatId) {
          if (data.records.length > 0) {
            // If threads exist, use the first one
            setCurrentChatId(data.records[0].chatId)
            router.push(
              `/chat/${workflowId}?workspaceId=${workspaceId}&chatId=${data.records[0].chatId}`
            )
          } else {
            // If no threads exist, generate a new UUID and push it
            const newChatId = uuidv4()
            setCurrentChatId(newChatId)
            router.push(
              `/chat/${workflowId}?workspaceId=${workspaceId}&chatId=${newChatId}`
            )
          }
        }
      } catch (err) {
        console.error('Error fetching threads:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch threads')
        setThreads([])
      } finally {
        setIsLoading(false)
      }
    }

    if (workflowId) {
      fetchThreads()
    }
  }, [workflowId])

  return (
    <div className='absolute top-[70px] z-50 flex h-[calc(100%-84px)] w-64 flex-col border-gray-200 border-r bg-gray-50'>
      <div className='border-gray-200 border-b p-3'>
        <Button
          className='w-full justify-start gap-2 border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          variant='outline'
          onClick={() => {
            // Generate new UUID for new chat
            const newChatId = uuidv4()
            setCurrentChatId(newChatId)
            // Call the callback to clear messages before switching
            onThreadChange?.()
            router.push(
              `/chat/${workflowId}?workspaceId=${workspaceId}&chatId=${newChatId}`
            )
          }}
        >
          <Plus className='h-4 w-4' />
          New Chat
        </Button>
      </div>

      <div className='flex-1 overflow-y-auto'>
        <div className='space-y-1 p-2'>
          {isLoading ? (
            <div className='flex items-center justify-center py-8'>
              <div className='text-sm text-gray-500'>Loading threads...</div>
            </div>
          ) : error ? (
            <div className='flex items-center justify-center py-8'>
              <div className='text-sm text-red-500'>Failed to load threads</div>
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
                    if (isActive) {
                      return
                    }
                    setCurrentChatId(thread.chatId)
                    // Call the callback to clear messages before switching
                    onThreadChange?.()
                    router.push(
                      `/chat/${workflowId}?workspaceId=${workspaceId}&chatId=${thread.chatId}`
                    )
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
              <div className='text-sm text-gray-500'>No threads found</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LeftNavThread
