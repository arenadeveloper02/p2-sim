'use client'

import * as React from 'react'
import axios from 'axios'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Input } from '@/components/emcn/components'
import { comboboxVariants } from '@/components/emcn/components/combobox/combobox'
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
import { env } from '@/lib/core/config/env'
import { cn } from '@/lib/core/utils/cn'
import { SubBlockInputController } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/sub-block-input-controller'
import { useWorkflowStore } from '@/stores/workflows/workflow/store'
import { useSubBlockValue } from '../../../hooks/use-sub-block-value'

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

  // Check if advanced mode is enabled for this field
  const fieldAdvancedMode = useWorkflowStore((state) =>
    state.getFieldAdvancedMode(blockId, subBlockId)
  )

  // Expecting array for multiselect
  const previewValue = isPreview && subBlockValues ? subBlockValues[subBlockId]?.value : undefined
  const selectedValues: string[] = isPreview
    ? previewValue || []
    : Array.isArray(storeValue)
      ? storeValue
      : typeof storeValue === 'string' && storeValue.trim()
        ? storeValue
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []

  const [states, setStates] = React.useState<ArenaState[]>([])
  const [open, setOpen] = React.useState(false)

  // Clear value when switching to advanced mode if it's an array
  React.useEffect(() => {
    if (fieldAdvancedMode && Array.isArray(storeValue) && storeValue.length > 0) {
      // When switching to advanced mode, convert array to comma-separated string
      const csvValue = storeValue.join(', ')
      if (!isPreview && !disabled) {
        setStoreValue(csvValue)
      }
    }
  }, [fieldAdvancedMode, storeValue, isPreview, disabled, setStoreValue])

  React.useEffect(() => {
    const fetchStates = async () => {
      setStates([])
      try {
        const v2Token = await getArenaToken()
        const arenaBackendBaseUrl = env.NEXT_PUBLIC_ARENA_BACKEND_BASE_URL

        if (!v2Token || !arenaBackendBaseUrl) {
          console.warn('Missing v2Token or arenaBackendBaseUrl for states fetch')
          setStates([])
          return
        }

        const url = `${arenaBackendBaseUrl}/sol/v1/state-management/state`
        const response = await axios.get(url, {
          headers: {
            authorisation: v2Token || '',
          },
        })

        // Handle different possible response structures
        let statesArray: ArenaState[] = []
        if (Array.isArray(response.data)) {
          statesArray = response.data
        } else if (response.data?.data && Array.isArray(response.data.data)) {
          statesArray = response.data.data
        } else if (response.data?.response && Array.isArray(response.data.response)) {
          statesArray = response.data.response
        } else if (response.data?.states && Array.isArray(response.data.states)) {
          statesArray = response.data.states
        } else if (response.data?.list && Array.isArray(response.data.list)) {
          statesArray = response.data.list
        } else {
          console.warn(
            'Unexpected states response structure:',
            JSON.stringify(response.data, null, 2)
          )
          statesArray = []
        }

        setStates(statesArray)
      } catch (error) {
        console.error('Error fetching states:', error)
        if (error instanceof Error) {
          console.error('Error message:', error.message)
        }
        setStates([])
      }
    }

    fetchStates()

    return () => {
      setStates([])
    }
  }, [])

  const handleSelect = (stateName: string) => {
    if (isPreview || disabled) return

    let newValues: string[]
    if (selectedValues.includes(stateName)) {
      newValues = selectedValues.filter((s) => s !== stateName)
    } else {
      newValues = [...selectedValues, stateName]
    }

    setStoreValue(newValues) // store as array (or newValues.join(",") if backend expects CSV)
  }

  const selectedLabel = selectedValues.length > 0 ? selectedValues.join(', ') : 'Select states...'

  // If advanced mode is enabled, use plain Input with tag dropdown support
  if (fieldAdvancedMode) {
    // Convert array to comma-separated string for display
    const currentValue = Array.isArray(storeValue)
      ? storeValue.join(', ')
      : typeof storeValue === 'string'
        ? storeValue
        : ''

    return (
      <div className={cn('flex flex-col gap-2 pt-1', layout === 'half' ? 'max-w-md' : 'w-full')}>
        <SubBlockInputController
          blockId={blockId}
          subBlockId={subBlockId}
          config={{
            id: subBlockId,
            type: 'short-input',
            connectionDroppable: true,
          }}
          value={currentValue}
          onChange={(newValue) => {
            // Store as string (supports variables like <block.field> or comma-separated values)
            if (!isPreview && !disabled) {
              setStoreValue(newValue)
            }
          }}
          disabled={disabled || isPreview}
          isPreview={isPreview}
        >
          {({ ref, value, onChange, onKeyDown, onDrop, onDragOver, onFocus }) => (
            <Input
              ref={ref as React.RefObject<HTMLInputElement>}
              value={value}
              onChange={onChange as (e: React.ChangeEvent<HTMLInputElement>) => void}
              onKeyDown={onKeyDown as (e: React.KeyboardEvent<HTMLInputElement>) => void}
              onFocus={onFocus}
              placeholder='Enter comma-separated states or variables like <block.field>'
              disabled={disabled || isPreview}
              onDrop={onDrop as (e: React.DragEvent<HTMLInputElement>) => void}
              onDragOver={onDragOver as (e: React.DragEvent<HTMLInputElement>) => void}
              className='w-full'
            />
          )}
        </SubBlockInputController>
      </div>
    )
  }

  // Basic mode: Use existing Popover/Command pattern
  return (
    <div className={cn('flex flex-col gap-2 pt-1', layout === 'half' ? 'max-w-md' : 'w-full')}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            role='combobox'
            aria-expanded={open}
            id={`state-${subBlockId}`}
            className={cn(
              comboboxVariants(),
              'flex h-auto min-h-[2.5rem] w-full items-start justify-between whitespace-normal break-words py-2 text-left'
            )}
            disabled={disabled}
          >
            <div className='flex-1 whitespace-normal break-words text-left'>{selectedLabel}</div>
            <ChevronsUpDown className='mt-1 ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-[var(--radix-popover-trigger-width)] rounded-[4px] p-0'>
          <Command
            filter={(value, search) => {
              if (!Array.isArray(states) || states.length === 0) return 0
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
                {Array.isArray(states) && states.length > 0
                  ? states.map((state) => (
                  <CommandItem
                    key={state.id}
                    value={state.name}
                    onSelect={() => handleSelect(state.name)}
                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                  >
                    {state.name}
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4',
                        selectedValues.includes(state.name) ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                    ))
                  : null}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
