'use client'

import * as React from 'react'
import axios from 'axios'
import { Check, ChevronsUpDown } from 'lucide-react'
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
import { getArenaToken } from '@/lib/arena-utils/cookie-utils'
import { env } from '@/lib/env'
import { cn } from '@/lib/utils'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-sub-block-value'
import { useSubBlockStore, useWorkflowRegistry } from '@/stores'

interface Assignee {
  value: string
  label: string
}

interface ArenaAssigneeSelectorProps {
  blockId: string
  subBlockId: string
  title: string
  layout?: 'full' | 'half'
  isPreview?: boolean
  subBlockValues?: Record<string, any>
  disabled?: boolean
}

export function ArenaAssigneeSelector({
  blockId,
  subBlockId,
  title,
  layout,
  isPreview = false,
  subBlockValues,
  disabled = false,
}: ArenaAssigneeSelectorProps) {
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlockId, true)

  const activeWorkflowId = useWorkflowRegistry((state) => state.activeWorkflowId)
  const values = useSubBlockStore((state) => state.workflowValues)
  const clientKey = subBlockId === 'task-assignee' ? 'task-client' : 'search-task-client'
  const projectKey = subBlockId === 'task-assignee' ? 'task-project' : 'search-task-project'
  const clientId = values?.[activeWorkflowId ?? '']?.[blockId]?.[clientKey]?.clientId
  const projectId = values?.[activeWorkflowId ?? '']?.[blockId]?.[projectKey]

  const previewValue = isPreview && subBlockValues ? subBlockValues[subBlockId]?.value : undefined
  const selectedValue = isPreview ? previewValue : storeValue

  const [assignees, setAssignees] = React.useState<Assignee[]>([])
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  // Fetch assignees when clientId & projectId change
  React.useEffect(() => {
    if (!clientId || !projectId) return

    const fetchAssignees = async () => {
      setLoading(true)
      try {
        setAssignees([])
        const v2Token = await getArenaToken()
        const arenaBackendBaseUrl = env.NEXT_PUBLIC_ARENA_BACKEND_BASE_URL

        const url = `${arenaBackendBaseUrl}/sol/v1/users/list?cId=${clientId}&pId=${projectId}`
        const response = await axios.get(url, {
          headers: {
            Authorisation: v2Token || '',
          },
        })

        const users = response.data?.userList || []

        const formattedAssignees: Assignee[] = users.map((user: any) => ({
          value: user.sysId,
          label: user.name,
        }))

        setAssignees(formattedAssignees)
      } catch (error) {
        console.error('Error fetching assignees:', error)
        setAssignees([])
      } finally {
        setLoading(false)
      }
    }

    fetchAssignees()
  }, [clientId, projectId])

  const selectedLabel =
    assignees.find((a) => a.value === selectedValue)?.label || 'Select assignee...'

  const handleSelect = (assigneeId: string) => {
    if (!isPreview && !disabled) {
      setStoreValue(assigneeId)
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
            id={`assignee-${subBlockId}`}
            className='w-full justify-between'
            disabled={disabled || !clientId || !projectId || loading}
          >
            {loading ? 'Loading...' : selectedLabel}
            <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-full p-0'>
          <Command
            filter={(value, search) => {
              const assignee = assignees.find((a) => a.value === value)
              if (!assignee) return 0
              return assignee.label.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }}
          >
            <CommandInput placeholder='Search assignee...' className='h-9' />
            <CommandList>
              <CommandEmpty>{loading ? 'Loading...' : 'No assignees found.'}</CommandEmpty>
              <CommandGroup>
                {assignees.map((assignee) => (
                  <CommandItem
                    key={assignee.value}
                    value={assignee.value}
                    // ✅ FIX: Wrap in closure, don't pass param directly
                    onSelect={() => handleSelect(assignee.value)}
                  >
                    {assignee.label}
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4',
                        selectedValue === assignee.value ? 'opacity-100' : 'opacity-0'
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
