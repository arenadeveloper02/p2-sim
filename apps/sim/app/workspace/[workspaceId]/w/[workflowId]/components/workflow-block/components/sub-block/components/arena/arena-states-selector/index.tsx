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
import { getArenaToken } from '@/lib/arena-utils/cookie-utils'

interface ArenaState {
  id: string
  name: string
}

interface ArenaStatesSelectorProps {
  blockId: string
  subBlockId: string
  title: string
  layout?: 'full' | 'half'
  isPreview?: boolean
  subBlockValues?: Record<string, any>
  disabled?: boolean
}

export function ArenaStatesSelector({
  blockId,
  subBlockId,
  title,
  layout,
  isPreview = false,
  subBlockValues,
  disabled = false,
}: ArenaStatesSelectorProps) {
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlockId, true)

  const previewValue = isPreview && subBlockValues ? subBlockValues[subBlockId]?.value : undefined
  const selectedValue = isPreview ? previewValue : storeValue

  const [states, setStates] = React.useState<ArenaState[]>([])
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const fetchStates = async () => {
      setStates([])
      try {
        const v2Token = await getArenaToken()
        const arenaBackendBaseUrl = env.NEXT_PUBLIC_ARENA_BACKEND_BASE_URL

        const url = `${arenaBackendBaseUrl}/sol/v1/state-management/state`
        const response = await axios.get(url, {
          headers: {
            authorisation: v2Token || '',
          },
        })

        setStates(response.data || [])
      } catch (error) {
        console.error('Error fetching states:', error)
        setStates([])
      }
    }

    fetchStates()

    return () => {
      setStates([])
      setStoreValue('')
    }
  }, [])

  const selectedLabel =
    states.find((state) => state.name === selectedValue)?.name || 'Select state...'

  const handleSelect = (stateName: string) => {
    if (!isPreview && !disabled) {
      setStoreValue(stateName)
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
            id={`state-${subBlockId}`}
            className='w-full justify-between'
            disabled={disabled}
          >
            {selectedLabel}
            <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-full p-0'>
          <Command
            filter={(value, search) => {
              const state = states.find((s) => s.id === value || s.name === value)
              if (!state) return 0

              return state.name.toLowerCase().includes(search.toLowerCase()) ||
                state.id.toLowerCase().includes(search.toLowerCase())
                ? 1
                : 0
            }}
          >
            <CommandInput placeholder='Search states...' className='h-9' />
            <CommandList>
              <CommandEmpty>No state found.</CommandEmpty>
              <CommandGroup>
                {states.map((state) => (
                  <CommandItem
                    key={state.id}
                    value={state.name}
                    onSelect={() => handleSelect(state.name)}
                  >
                    {state.name}
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4',
                        selectedValue === state.name ? 'opacity-100' : 'opacity-0'
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
