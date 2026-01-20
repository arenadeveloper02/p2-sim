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
import { isVariable } from '../utils'

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
  const isSearchTask = subBlockId === 'search-task-assignee'
  const isCreateTask = subBlockId === 'task-assignee'
  const clientKey = subBlockId === 'task-assignee' ? 'task-client' : 'search-task-client'
  const projectKey = subBlockId === 'task-assignee' ? 'task-project' : 'search-task-project'
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

  const [assignees, setAssignees] = React.useState<Assignee[]>([])
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [inputValue, setInputValue] = React.useState('')
  const [isEditing, setIsEditing] = React.useState(false)

  // Fetch assignees when clientId & projectId change
  // For search task, only clientId is needed (uses allUsers=true)
  // For create task, both clientId and projectId are required
  React.useEffect(() => {
    if (!clientId) return
    if (isCreateTask && !projectId) return

    // Skip fetch if dependencies are variables
    if (isVariable(clientId) || (isCreateTask && projectId && isVariable(projectId))) {
      setAssignees([])
      setLoading(false)
      return
    }

    // Skip fetch if assignee field is in advanced mode and value is a variable
    if (fieldAdvancedMode && isVariable(selectedValue)) {
      setAssignees([])
      setLoading(false)
      return
    }

    const fetchAssignees = async () => {
      setLoading(true)
      try {
        setAssignees([])
        const v2Token = await getArenaToken()
        const arenaBackendBaseUrl = env.NEXT_PUBLIC_ARENA_BACKEND_BASE_URL

        let url = `${arenaBackendBaseUrl}/sol/v1/users/list?cId=${clientId}`
        if (isCreateTask && projectId) {
          url += `&pId=${projectId}`
        }
        if (isSearchTask) {
          url = `${url}&allUsers=true&includeClientUsers=true`
        }
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
  }, [clientId, isCreateTask ? projectId : undefined, fieldAdvancedMode, selectedValue, subBlockId])

  // Determine selected label and assignee ID
  const selectedAssignee = assignees.find(
    (a) => a.value === (typeof selectedValue === 'object' ? selectedValue?.value : selectedValue)
  )
  const selectedLabel =
    (typeof selectedValue === 'object' ? selectedValue?.customDisplayValue : null) ||
    selectedAssignee?.label ||
    'Select assignee...'
  const selectedAssigneeId =
    typeof selectedValue === 'object' ? selectedValue?.value : selectedValue || ''

  // State for advanced mode autocomplete
  const [advancedModeOpen, setAdvancedModeOpen] = React.useState(false)
  const [advancedModeSearch, setAdvancedModeSearch] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const overlayRef = React.useRef<HTMLDivElement>(null)
  // Local state for input display value (separate from stored value) - must be at top level
  const [inputDisplayValue, setInputDisplayValue] = React.useState('')

  const accessiblePrefixes = useAccessibleReferencePrefixes(blockId)

  // Helper to find assignee by name or ID (defined at top level to avoid hook issues)
  const findAssigneeByNameOrId = React.useCallback(
    (value: string): Assignee | undefined => {
      if (!value || !assignees.length) return undefined
      const trimmed = value.trim()
      return (
        assignees.find((a) => a.label.toLowerCase() === trimmed.toLowerCase()) ||
        assignees.find((a) => a.value === trimmed) ||
        assignees.find((a) => a.label.toLowerCase().includes(trimmed.toLowerCase()))
      )
    },
    [assignees]
  )

  // When switching to advanced mode, keep the object but display the name
  // When switching back to basic mode, ensure we have the object
  React.useEffect(() => {
    if (fieldAdvancedMode) {
      // In advanced mode, keep the object if we have it (for ID extraction)
      // Only convert to string if it's a variable
      if (typeof selectedValue === 'object' && selectedValue?.value) {
        // Already an object - keep it, just update display
        // No need to change stored value
      } else if (
        typeof selectedValue === 'string' &&
        selectedValue.trim() &&
        !selectedValue.trim().startsWith('<')
      ) {
        // String ID or name - look up and store as object (so we have ID for backend)
        const matchedAssignee = findAssigneeByNameOrId(selectedValue)
        if (matchedAssignee && !isPreview && !disabled) {
          setStoreValue({ ...matchedAssignee, customDisplayValue: matchedAssignee.label })
        }
      }
      // If it's a variable (<block.field>), keep as string - backend will resolve it
    } else {
      // Switching back to basic mode
      if (typeof selectedValue === 'string') {
        const trimmed = selectedValue.trim()

        // Clear variables - they can't work in basic mode dropdowns
        if (trimmed.startsWith('<')) {
          if (!isPreview && !disabled) {
            setStoreValue(null)
          }
          return
        }

        // Try to convert valid ID/name to object
        if (trimmed) {
          const matchedAssignee = findAssigneeByNameOrId(trimmed)
          if (matchedAssignee && !isPreview && !disabled) {
            setStoreValue({ ...matchedAssignee, customDisplayValue: matchedAssignee.label })
          } else {
            // If conversion fails, clear the value (invalid string)
            if (!isPreview && !disabled) {
              setStoreValue(null)
            }
          }
        }
      }
      // If it's already an object, keep it
    }
  }, [fieldAdvancedMode, selectedValue, isPreview, disabled, setStoreValue, findAssigneeByNameOrId])

  // Filter assignees for autocomplete (defined at top level)
  const filteredAssignees = React.useMemo(() => {
    if (!advancedModeSearch.trim()) return assignees.slice(0, 10)
    const searchLower = advancedModeSearch.toLowerCase()
    return assignees
      .filter(
        (a) =>
          a.label.toLowerCase().includes(searchLower) || a.value.toLowerCase().includes(searchLower)
      )
      .slice(0, 10)
  }, [assignees, advancedModeSearch])

  const handleSelect = (assignee: Assignee) => {
    if (!isPreview && !disabled) {
      setStoreValue({ ...assignee, customDisplayValue: assignee.label })
      setOpen(false)
      setIsEditing(false)
    }
  }

  // Convert assignees to combobox options
  const comboboxOptions = React.useMemo(
    () =>
      assignees.map((assignee) => ({
        label: assignee.label,
        value: assignee.value,
      })),
    [assignees]
  )

  // Get display value: label if object, look up label if ID string, otherwise the string value
  const currentValue =
    typeof selectedValue === 'object'
      ? selectedValue?.label || selectedValue?.customDisplayValue || ''
      : typeof selectedValue === 'string' &&
          selectedValue.trim() &&
          !selectedValue.trim().startsWith('<')
        ? findAssigneeByNameOrId(selectedValue)?.label || selectedValue
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
              if (newValue.trim().startsWith('<')) {
                if (!isPreview && !disabled) {
                  setStoreValue(newValue)
                  setAdvancedModeOpen(false)
                }
                return
              }
              // Show autocomplete but don't update store value
              if (!isPreview && !disabled) {
                setAdvancedModeOpen(newValue.trim().length > 0 && assignees.length > 0)
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
                      if (e.key === 'Escape') {
                        setAdvancedModeOpen(false)
                      }
                      if (e.key === 'Enter' && advancedModeOpen && filteredAssignees.length > 0) {
                        e.preventDefault()
                        const firstMatch = filteredAssignees[0]
                        if (firstMatch) {
                          // Store the full object so basic mode can display it correctly
                          setStoreValue({ ...firstMatch, customDisplayValue: firstMatch.label })
                          setInputDisplayValue(firstMatch.label)
                          setAdvancedModeSearch('')
                          setAdvancedModeOpen(false)
                        }
                      }
                    }}
                    onFocus={(e) => {
                      onFocus()
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
                          const matchedAssignee = findAssigneeByNameOrId(inputDisplayValue)
                          if (matchedAssignee) {
                            // Store the full object with ID (backend will extract value)
                            setStoreValue({
                              ...matchedAssignee,
                              customDisplayValue: matchedAssignee.label,
                            })
                            setInputDisplayValue(matchedAssignee.label)
                          } else {
                            // If no match, might be an ID - store as string, backend will handle it
                            setStoreValue(inputDisplayValue.trim())
                          }
                        }
                      }
                      setTimeout(() => setAdvancedModeOpen(false), 200)
                    }}
                    placeholder='Enter assignee name, ID, or variable like <block.assignee_id>'
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
          {advancedModeOpen && filteredAssignees.length > 0 && (
            <div className='absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md'>
              <Command>
                <CommandList>
                  <CommandEmpty>{loading ? 'Loading...' : 'No assignees found.'}</CommandEmpty>
                  <CommandGroup>
                    {filteredAssignees.map((assignee) => (
                      <CommandItem
                        key={assignee.value}
                        value={assignee.value}
                        onSelect={() => {
                          if (!isPreview && !disabled) {
                            // Store the full object so basic mode can display it correctly
                            setStoreValue({ ...assignee, customDisplayValue: assignee.label })
                            setInputDisplayValue(assignee.label)
                            setAdvancedModeSearch('')
                            setAdvancedModeOpen(false)
                            inputRef.current?.blur()
                          }
                        }}
                        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                      >
                        {assignee.label}
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
            id={`assignee-${subBlockId}`}
            className={cn(
              comboboxVariants(),
              'relative h-[32px] w-full cursor-pointer items-center justify-between'
            )}
            disabled={
              disabled ||
              loading ||
              (!fieldAdvancedMode && (!clientId || (isCreateTask && !projectId)))
            }
          >
            {loading ? 'Loading...' : selectedLabel}
            <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-[var(--radix-popover-trigger-width)] rounded-[4px] p-0'>
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
                {assignees.map((assignee) => {
                  const isSelected =
                    typeof selectedValue === 'object'
                      ? selectedValue?.value === assignee.value
                      : selectedValue === assignee.value
                  return (
                    <CommandItem
                      key={assignee.value}
                      value={assignee.value}
                      onSelect={() => handleSelect(assignee)}
                      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    >
                      {assignee.label}
                      <Check
                        className={cn('ml-auto h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')}
                      />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
