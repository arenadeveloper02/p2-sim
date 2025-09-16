'use client'

import * as React from 'react'
import axios from 'axios'
import { Check, ChevronsUpDown } from 'lucide-react'
import { env } from '@/lib/env'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-sub-block-value'
import { getArenaServiceBaseUrl } from '@/lib/arena-utils/arena-utils'
import { useSubBlockStore, useWorkflowRegistry } from '@/stores'
import { getArenaToken } from '@/lib/arena-utils/cookie-utils'

interface Task {
  sysId: string
  id?: string
  name: string
}

interface ArenaTaskSelectorProps {
  blockId: string
  subBlockId: string
  title: string
  layout?: 'full' | 'half'
  isPreview?: boolean
  subBlockValues?: Record<string, any>
  disabled?: boolean
}

export function ArenaTaskSelector({
  blockId,
  subBlockId,
  title,
  layout,
  isPreview = false,
  subBlockValues,
  disabled = false,
}: ArenaTaskSelectorProps) {
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlockId, true)

  const activeWorkflowId = useWorkflowRegistry((state) => state.activeWorkflowId)
  const values = useSubBlockStore((state) => state.workflowValues)
  const projectId = values?.[activeWorkflowId ?? '']?.[blockId]?.['task-project']

  const previewValue = isPreview && subBlockValues ? subBlockValues[subBlockId]?.value : undefined
  const selectedValue = isPreview ? previewValue : storeValue

  const [tasks, setTasks] = React.useState<Task[]>([])
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (!projectId) return

    const fetchTasks = async () => {
      setTasks([])
      try {
        const v2Token = await getArenaToken()
        const arenaBackendBaseUrl = env.NEXT_PUBLIC_ARENA_BACKEND_BASE_URL

        const url = `${arenaBackendBaseUrl}/sol/v1/tasks/deliverable/list?projectId=${projectId}`
        const response = await axios.get(url, {
          headers: {
            Authorisation: v2Token || '',
          },
        })

        setTasks(response.data.deliverables || [])
      } catch (error) {
        console.error('Error fetching tasks:', error)
        setTasks([])
      }
    }

    fetchTasks()

    return () => {
      setTasks([])
      setStoreValue('')
    }
  }, [projectId])

  const selectedLabel =
    tasks.find((task) => task.sysId === selectedValue || task.id === selectedValue)?.name ||
    'Select task...'

  const handleSelect = (taskId: string) => {
    if (!isPreview && !disabled) {
      setStoreValue(taskId)
      setOpen(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-2 pt-1', layout === 'half' ? 'max-w-md' : 'w-full')}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            role='combobox'
            aria-expanded={open}
            id={`task-${subBlockId}`}
            className='w-full justify-between'
            disabled={disabled || !projectId}
          >
            {selectedLabel}
            <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-full p-0'>
          <Command>
            <CommandInput placeholder='Search tasks...' className='h-9' />
            <CommandList>
              <CommandEmpty>No task found.</CommandEmpty>
              <CommandGroup>
                {tasks.map((task) => (
                  <CommandItem
                    key={task.sysId || task.id}
                    value={task.name} // <-- IMPORTANT for Command filter
                    onSelect={() => handleSelect(task.sysId)}
                  >
                    {task.name}
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4',
                        selectedValue === task.sysId || selectedValue === task.id
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
