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
import { formatDisplayText } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/formatted-text'
import { SubBlockInputController } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/sub-block-input-controller'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'
import { useAccessibleReferencePrefixes } from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/use-accessible-reference-prefixes'
import { useSubBlockStore, useWorkflowRegistry } from '@/stores'
import { useWorkflowStore } from '@/stores/workflows/workflow/store'

interface Group {
  id: string
  name: string
}

interface ArenaGroupSelectorProps {
  blockId: string
  subBlockId: string
  title: string
  layout?: 'full' | 'half'
  isPreview?: boolean
  subBlockValues?: Record<string, any>
  disabled?: boolean
}

export function ArenaGroupSelector({
  blockId,
  subBlockId,
  title,
  layout,
  isPreview = false,
  subBlockValues,
  disabled = false,
}: ArenaGroupSelectorProps) {
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlockId, true)

  const activeWorkflowId = useWorkflowRegistry((state) => state.activeWorkflowId)
  const values = useSubBlockStore((state) => state.workflowValues)
  // Determine the client and project keys based on the group subBlockId
  const clientKey = subBlockId === 'comment-group' ? 'comment-client' : 'task-client'
  const projectKey = subBlockId === 'comment-group' ? 'comment-project' : 'task-project'
  const clientValue = values?.[activeWorkflowId ?? '']?.[blockId]?.[clientKey]
  const projectValue = values?.[activeWorkflowId ?? '']?.[blockId]?.[projectKey]
  // Extract IDs - could be objects (from selector) or strings (from advanced mode/variable)
  const clientId = typeof clientValue === 'object' ? clientValue?.clientId : clientValue || ''
  const projectId = typeof projectValue === 'string' ? projectValue : projectValue?.sysId || ''

  // Check if advanced mode is enabled for this field
  const fieldAdvancedMode = useWorkflowStore((state) =>
    state.getFieldAdvancedMode(blockId, subBlockId)
  )

  const previewValue = isPreview && subBlockValues ? subBlockValues[subBlockId]?.value : undefined
  const selectedValue = isPreview ? previewValue : storeValue

  const [groups, setGroups] = React.useState<Group[]>([])
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState('')
  const [isEditing, setIsEditing] = React.useState(false)

  // Fetch groups when clientId & projectId are available
  React.useEffect(() => {
    if (!clientId || !projectId) return

    const fetchGroups = async () => {
      try {
        setGroups([])
        const v2Token = await getArenaToken()
        const arenaBackendBaseUrl = env.NEXT_PUBLIC_ARENA_BACKEND_BASE_URL
        const url = `${arenaBackendBaseUrl}/sol/v1/tasks/epic?cid=${clientId}&pid=${projectId}`

        const response = await axios.get(url, {
          headers: {
            Authorisation: v2Token || '',
          },
        })

        const epics = response.data?.epics || []
        const formattedGroups = epics.map((epic: any) => ({
          id: epic.id,
          name: epic.name,
        }))

        setGroups(formattedGroups)
      } catch (error) {
        console.error('Error fetching groups:', error)
        setGroups([])
      }
    }

    fetchGroups()
    return () => {
      setGroups([])
    }
  }, [clientId, projectId])

  // Determine selected label and group ID
  const selectedGroup = groups.find(
    (grp) => grp.id === (typeof selectedValue === 'object' ? selectedValue?.id : selectedValue)
  )
  const selectedLabel =
    selectedValue?.customDisplayValue || selectedGroup?.name || 'Select group...'
  const selectedGroupId =
    typeof selectedValue === 'object' ? selectedValue?.id : selectedValue || ''

  // State for advanced mode autocomplete
  const [advancedModeOpen, setAdvancedModeOpen] = React.useState(false)
  const [advancedModeSearch, setAdvancedModeSearch] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const overlayRef = React.useRef<HTMLDivElement>(null)
  // Local state for input display value (separate from stored value) - must be at top level
  const [inputDisplayValue, setInputDisplayValue] = React.useState('')

  const accessiblePrefixes = useAccessibleReferencePrefixes(blockId)

  // Helper to find group by name or ID (defined at top level to avoid hook issues)
  const findGroupByNameOrId = React.useCallback(
    (value: string): Group | undefined => {
      if (!value || !groups.length) return undefined
      const trimmed = value.trim()
      // Try exact name match first
      return (
        groups.find((g) => g.name.toLowerCase() === trimmed.toLowerCase()) ||
        groups.find((g) => g.id === trimmed) ||
        groups.find((g) => g.name.toLowerCase().includes(trimmed.toLowerCase()))
      )
    },
    [groups]
  )

  // When switching to advanced mode, keep the object but display the name
  // When switching back to basic mode, ensure we have the object
  React.useEffect(() => {
    if (fieldAdvancedMode) {
      // In advanced mode, keep the object if we have it (for ID extraction)
      // Only convert to string if it's a variable
      if (typeof selectedValue === 'object' && selectedValue?.id) {
        // Already an object - keep it, just update display
        // No need to change stored value
      } else if (
        typeof selectedValue === 'string' &&
        selectedValue.trim() &&
        !selectedValue.trim().startsWith('<')
      ) {
        // String ID or name - look up and store as object (so we have ID for backend)
        const matchedGroup = findGroupByNameOrId(selectedValue)
        if (matchedGroup && !isPreview && !disabled) {
          setStoreValue({ ...matchedGroup, customDisplayValue: matchedGroup.name })
        }
      }
      // If it's a variable (<block.field>), keep as string - backend will resolve it
    } else {
      // Switching back to basic mode - ensure we have the object
      if (
        typeof selectedValue === 'string' &&
        selectedValue.trim() &&
        !selectedValue.trim().startsWith('<')
      ) {
        const matchedGroup = findGroupByNameOrId(selectedValue)
        if (matchedGroup && !isPreview && !disabled) {
          setStoreValue({ ...matchedGroup, customDisplayValue: matchedGroup.name })
        }
      }
    }
  }, [fieldAdvancedMode, selectedValue, isPreview, disabled, setStoreValue, findGroupByNameOrId])

  // Filter groups for autocomplete (defined at top level)
  const filteredGroups = React.useMemo(() => {
    if (!advancedModeSearch.trim()) return groups.slice(0, 10)
    const searchLower = advancedModeSearch.toLowerCase()
    return groups
      .filter(
        (g) =>
          g.name.toLowerCase().includes(searchLower) || g.id.toLowerCase().includes(searchLower)
      )
      .slice(0, 10)
  }, [groups, advancedModeSearch])

  const handleSelect = (group: Group) => {
    if (!isPreview && !disabled) {
      setStoreValue({ ...group, customDisplayValue: group.name })
      setOpen(false)
      setIsEditing(false)
    }
  }

  // Convert groups to combobox options
  const comboboxOptions = React.useMemo(
    () =>
      groups.map((group) => ({
        label: group.name,
        value: group.id,
      })),
    [groups]
  )

  // Get display value: name if object, look up name if ID string, otherwise the string value
  const currentValue =
    typeof selectedValue === 'object'
      ? selectedValue?.name || selectedValue?.customDisplayValue || ''
      : typeof selectedValue === 'string' &&
          selectedValue.trim() &&
          !selectedValue.trim().startsWith('<')
        ? findGroupByNameOrId(selectedValue)?.name || selectedValue
        : selectedValue || ''

  // Update inputDisplayValue when currentValue changes (from external sources)
  React.useEffect(() => {
    if (fieldAdvancedMode) {
      setInputDisplayValue(currentValue)
    }
  }, [currentValue, fieldAdvancedMode])

  // If advanced mode is enabled, use Input with autocomplete and tag dropdown support
  if (fieldAdvancedMode) {
    return (
      <div className={cn('flex w-full flex-col gap-2 pt-1')}>
        <div className='relative'>
          <SubBlockInputController
            blockId={blockId}
            subBlockId={subBlockId}
            config={{
              id: subBlockId,
              type: 'short-input',
              connectionDroppable: true,
            }}
            value={inputDisplayValue}
            onChange={(newValue) => {
              // Only update display value, not store value
              setInputDisplayValue(newValue)
              setAdvancedModeSearch(newValue)
              // If it's a variable, store it immediately as string
              if (newValue.trim().startsWith('<')) {
                if (!isPreview && !disabled) {
                  setStoreValue(newValue.trim())
                  setAdvancedModeOpen(false)
                }
                return
              }
              // Show autocomplete but don't update store value yet (wait for blur/select)
              if (!isPreview && !disabled) {
                setAdvancedModeOpen(newValue.trim().length > 0 && groups.length > 0)
              }
            }}
            disabled={disabled || isPreview}
            isPreview={isPreview}
          >
            {({ ref, value, onChange, onKeyDown, onDrop, onDragOver, onFocus }) => {
              // Merge refs using callback ref
              const mergedRef = (node: HTMLInputElement | null) => {
                inputRef.current = node
                if (ref && 'current' in ref) {
                  ;(ref as React.MutableRefObject<HTMLInputElement | null>).current = node
                }
              }
              const formattedText = formatDisplayText(value || '', {
                accessiblePrefixes,
                highlightAll: !accessiblePrefixes,
              })

              const handleScroll = (e: React.UIEvent<HTMLInputElement>) => {
                if (overlayRef.current) {
                  overlayRef.current.scrollLeft = e.currentTarget.scrollLeft
                }
              }

              return (
                <>
                  <Input
                    ref={mergedRef}
                    value={value}
                    onChange={(e) => {
                      const newValue = e.target.value
                      setInputDisplayValue(newValue)
                      setAdvancedModeSearch(newValue)
                      // Update the controller's value
                      if (onChange) {
                        onChange(e)
                      }
                      // Show autocomplete
                      if (newValue.trim().length > 0 && !newValue.trim().startsWith('<')) {
                        setAdvancedModeOpen(true)
                      }
                    }}
                    onKeyDown={(e) => {
                      onKeyDown(e)
                      // Close autocomplete on Escape
                      if (e.key === 'Escape') {
                        setAdvancedModeOpen(false)
                      }
                      // Select first item on Enter if autocomplete is open
                      if (e.key === 'Enter' && advancedModeOpen && filteredGroups.length > 0) {
                        e.preventDefault()
                        const firstMatch = filteredGroups[0]
                        if (firstMatch) {
                          // Store the full object so basic mode can display it correctly
                          setStoreValue({ ...firstMatch, customDisplayValue: firstMatch.name })
                          setInputDisplayValue(firstMatch.name)
                          setAdvancedModeSearch('')
                          setAdvancedModeOpen(false)
                        }
                      }
                    }}
                    onFocus={(e) => {
                      onFocus()
                      // Show autocomplete on focus if there's a value
                      if (value.trim().length > 0 && !value.trim().startsWith('<')) {
                        setAdvancedModeOpen(true)
                      }
                    }}
                    onBlur={() => {
                      if (!isPreview && !disabled && inputDisplayValue) {
                        // If it's a variable, store as string (backend will resolve it)
                        if (inputDisplayValue.trim().startsWith('<')) {
                          setStoreValue(inputDisplayValue.trim())
                        } else {
                          // Try to match name or ID and store as object (so we have ID for backend)
                          const matchedGroup = findGroupByNameOrId(inputDisplayValue)
                          if (matchedGroup) {
                            // Store the full object with ID (backend will extract id)
                            setStoreValue({
                              ...matchedGroup,
                              customDisplayValue: matchedGroup.name,
                            })
                            setInputDisplayValue(matchedGroup.name)
                          } else {
                            // If no match, might be an ID - store as string, backend will handle it
                            setStoreValue(inputDisplayValue.trim())
                          }
                        }
                      }
                      // Close autocomplete after a short delay to allow click
                      setTimeout(() => setAdvancedModeOpen(false), 200)
                    }}
                    placeholder='Enter group name, ID, or variable like <block.group_id>'
                    disabled={disabled || isPreview}
                    onDrop={onDrop as (e: React.DragEvent<HTMLInputElement>) => void}
                    onDragOver={onDragOver as (e: React.DragEvent<HTMLInputElement>) => void}
                    onScroll={handleScroll}
                    className='allow-scroll h-[32px] w-full overflow-auto text-transparent caret-foreground [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground/50 [&::-webkit-scrollbar]:hidden'
                  />
                  <div
                    ref={overlayRef}
                    className='pointer-events-none absolute inset-0 flex items-center overflow-x-auto bg-transparent px-[8px] py-[6px] font-medium font-sans text-foreground text-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
                  >
                    <div className='min-w-fit whitespace-pre'>{formattedText}</div>
                  </div>
                </>
              )
            }}
          </SubBlockInputController>

          {/* Autocomplete dropdown */}
          {advancedModeOpen && filteredGroups.length > 0 && (
            <div className='absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md'>
              <Command>
                <CommandList>
                  <CommandEmpty>No groups found.</CommandEmpty>
                  <CommandGroup>
                    {filteredGroups.map((group) => (
                      <CommandItem
                        key={group.id}
                        value={group.id}
                        onSelect={() => {
                          // Store the full object so basic mode can display it correctly
                          if (!isPreview && !disabled) {
                            setStoreValue({ ...group, customDisplayValue: group.name })
                            setInputDisplayValue(group.name)
                            setAdvancedModeSearch('')
                            setAdvancedModeOpen(false)
                            inputRef.current?.blur()
                          }
                        }}
                        className='max-w-full whitespace-normal break-words'
                        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                      >
                        <span className='truncate'>{group.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Basic mode: Use existing Popover/Command pattern
  return (
    <div className={cn('flex w-full flex-col gap-2 pt-1')}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            role='combobox'
            aria-expanded={open}
            id={`group-${subBlockId}`}
            className={cn(
              comboboxVariants(),
              'relative h-[32px] w-full cursor-pointer items-center justify-between'
            )}
            disabled={disabled || !clientId || !projectId}
          >
            <span className='truncate'>{selectedLabel}</span>
            <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-[var(--radix-popover-trigger-width)] rounded-[4px] p-0'>
          <Command
            filter={(value, search) => {
              const group = groups.find((g) => g.id === value || g.name === value)
              if (!group) return 0

              return group.name.toLowerCase().includes(search.toLowerCase()) ||
                group.id.toLowerCase().includes(search.toLowerCase())
                ? 1
                : 0
            }}
          >
            <CommandInput placeholder='Search groups...' className='h-9' />
            <CommandList>
              <CommandEmpty>No groups found.</CommandEmpty>
              <CommandGroup>
                {groups.map((group) => (
                  <CommandItem
                    key={group.id}
                    value={group.id}
                    onSelect={() => handleSelect(group)}
                    className='max-w-full whitespace-normal break-words'
                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                  >
                    <span className='truncate'>{group.name}</span>
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4',
                        (typeof selectedValue === 'object' ? selectedValue?.id : selectedValue) ===
                          group.id
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
