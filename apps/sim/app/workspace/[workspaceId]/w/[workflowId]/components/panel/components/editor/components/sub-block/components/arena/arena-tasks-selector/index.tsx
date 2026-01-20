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

  // Extract clientId - needed for variable checking
  const clientKey = subBlockId === 'task-task' ? 'task-client' : 'comment-client'
  const clientValue = values?.[activeWorkflowId ?? '']?.[blockId]?.[clientKey]
  const clientId = typeof clientValue === 'object' ? clientValue?.clientId : clientValue || ''

  // Determine the project key based on the task subBlockId
  const projectKey = subBlockId === 'comment-task' ? 'comment-project' : 'task-project'
  const projectValue = values?.[activeWorkflowId ?? '']?.[blockId]?.[projectKey]
  const projectId = typeof projectValue === 'string' ? projectValue : projectValue?.sysId || ''

  // Check if advanced mode is enabled for this field
  const fieldAdvancedMode = useWorkflowStore((state) =>
    state.getFieldAdvancedMode(blockId, subBlockId)
  )

  const previewValue = isPreview && subBlockValues ? subBlockValues[subBlockId]?.value : undefined
  const selectedValue = isPreview ? previewValue : storeValue

  const [tasks, setTasks] = React.useState<Task[]>([])
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState('')
  const [isEditing, setIsEditing] = React.useState(false)

  React.useEffect(() => {
    if (!projectId) return

    // Skip fetch if dependencies are variables
    if (isVariable(clientId) || isVariable(projectId)) {
      setTasks([])
      return
    }

    // Skip fetch if task field is in advanced mode and value is a variable
    if (fieldAdvancedMode && isVariable(selectedValue)) {
      setTasks([])
      return
    }

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
    }
  }, [clientId, projectId, fieldAdvancedMode, selectedValue])

  // Determine selected label and task ID
  const selectedTask = tasks.find(
    (task) =>
      task.sysId === (typeof selectedValue === 'object' ? selectedValue?.sysId : selectedValue) ||
      task.id === (typeof selectedValue === 'object' ? selectedValue?.sysId : selectedValue)
  )
  const selectedLabel =
    (typeof selectedValue === 'object' ? selectedValue?.customDisplayValue : null) ||
    selectedTask?.name ||
    'Select task...'
  const selectedTaskId =
    typeof selectedValue === 'object'
      ? selectedValue?.sysId || selectedValue?.id
      : selectedValue || ''

  // State for advanced mode autocomplete
  const [advancedModeOpen, setAdvancedModeOpen] = React.useState(false)
  const [advancedModeSearch, setAdvancedModeSearch] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const overlayRef = React.useRef<HTMLDivElement>(null)
  // Local state for input display value (separate from stored value) - must be at top level
  const [inputDisplayValue, setInputDisplayValue] = React.useState('')

  const accessiblePrefixes = useAccessibleReferencePrefixes(blockId)

  // Helper to find task by name or ID (defined at top level to avoid hook issues)
  const findTaskByNameOrId = React.useCallback(
    (value: string): Task | undefined => {
      if (!value || !tasks.length) return undefined
      const trimmed = value.trim()
      const taskId = trimmed
      return (
        tasks.find((t) => t.name.toLowerCase() === trimmed.toLowerCase()) ||
        tasks.find((t) => t.sysId === taskId || t.id === taskId) ||
        tasks.find((t) => t.name.toLowerCase().includes(trimmed.toLowerCase()))
      )
    },
    [tasks]
  )

  // When switching to advanced mode, show the NAME instead of ID
  // When switching back to basic mode, convert ID string to object
  React.useEffect(() => {
    if (fieldAdvancedMode) {
      // In advanced mode, keep the object if we have it (for ID extraction)
      // Only convert to string if it's a variable
      if (typeof selectedValue === 'object' && (selectedValue?.sysId || selectedValue?.id)) {
        // Already an object - keep it, just update display
        // No need to change stored value
      } else if (
        typeof selectedValue === 'string' &&
        selectedValue.trim() &&
        !selectedValue.trim().startsWith('<')
      ) {
        // String ID or name - look up and store as object (so we have ID for backend)
        const matchedTask = findTaskByNameOrId(selectedValue)
        if (matchedTask && !isPreview && !disabled) {
          setStoreValue({ ...matchedTask, customDisplayValue: matchedTask.name })
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
          const matchedTask = findTaskByNameOrId(trimmed)
          if (matchedTask && !isPreview && !disabled) {
            setStoreValue({ ...matchedTask, customDisplayValue: matchedTask.name })
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
  }, [fieldAdvancedMode, selectedValue, isPreview, disabled, setStoreValue, findTaskByNameOrId])

  // Filter tasks for autocomplete (defined at top level)
  const filteredTasks = React.useMemo(() => {
    if (!advancedModeSearch.trim()) return tasks.slice(0, 10)
    const searchLower = advancedModeSearch.toLowerCase()
    return tasks
      .filter(
        (t) =>
          t.name.toLowerCase().includes(searchLower) ||
          t.sysId?.toLowerCase().includes(searchLower) ||
          t.id?.toLowerCase().includes(searchLower)
      )
      .slice(0, 10)
  }, [tasks, advancedModeSearch])

  const handleSelect = (task: Task) => {
    if (!isPreview && !disabled) {
      setStoreValue({ ...task, customDisplayValue: task.name })
      setOpen(false)
      setIsEditing(false)
    }
  }

  // Convert tasks to combobox options
  const comboboxOptions = React.useMemo(
    () =>
      tasks.map((task) => ({
        label: task.name,
        value: task.sysId || task.id || '',
      })),
    [tasks]
  )

  // Get display value: name if object, look up name if ID string, otherwise the string value
  const currentValue =
    typeof selectedValue === 'object'
      ? selectedValue?.name || selectedValue?.customDisplayValue || ''
      : typeof selectedValue === 'string' &&
          selectedValue.trim() &&
          !selectedValue.trim().startsWith('<')
        ? findTaskByNameOrId(selectedValue)?.name || selectedValue
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
      <div className={cn('flex flex-col gap-2 pt-1', layout === 'half' ? 'max-w-md' : 'w-full')}>
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
                setAdvancedModeOpen(newValue.trim().length > 0 && tasks.length > 0)
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
                      if (e.key === 'Enter' && advancedModeOpen && filteredTasks.length > 0) {
                        e.preventDefault()
                        const firstMatch = filteredTasks[0]
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
                      if (value.trim().length > 0 && !value.trim().startsWith('<')) {
                        setAdvancedModeOpen(true)
                      }
                    }}
                    onBlur={() => {
                      if (
                        !isPreview &&
                        !disabled &&
                        inputDisplayValue &&
                        !inputDisplayValue.trim().startsWith('<')
                      ) {
                        const matchedTask = findTaskByNameOrId(inputDisplayValue)
                        if (matchedTask) {
                          // Store the full object so basic mode can display it correctly
                          setStoreValue({ ...matchedTask, customDisplayValue: matchedTask.name })
                          setInputDisplayValue(matchedTask.name)
                        } else {
                          // If no match, keep the typed value (might be an ID or invalid)
                          setStoreValue(inputDisplayValue)
                        }
                      }
                      setTimeout(() => setAdvancedModeOpen(false), 200)
                    }}
                    placeholder='Enter task name, ID, or variable like <block.task_id>'
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
          {advancedModeOpen && filteredTasks.length > 0 && (
            <div className='absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md'>
              <Command>
                <CommandList>
                  <CommandEmpty>No task found.</CommandEmpty>
                  <CommandGroup>
                    {filteredTasks.map((task) => {
                      const taskId = task.sysId || task.id
                      return (
                        <CommandItem
                          key={taskId}
                          value={taskId}
                          onSelect={() => {
                            if (!isPreview && !disabled) {
                              // Store the full object so basic mode can display it correctly
                              setStoreValue({ ...task, customDisplayValue: task.name })
                              setInputDisplayValue(task.name)
                              setAdvancedModeSearch('')
                              setAdvancedModeOpen(false)
                              inputRef.current?.blur()
                            }
                          }}
                          className='max-w-full whitespace-normal break-words'
                          style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                        >
                          <span className='whitespace-normal break-words'>{task.name}</span>
                        </CommandItem>
                      )
                    })}
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
    <div className={cn('flex flex-col gap-2 pt-1', layout === 'half' ? 'max-w-md' : 'w-full')}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            role='combobox'
            aria-expanded={open}
            id={`task-${subBlockId}`}
            className={cn(
              comboboxVariants(),
              'relative h-[32px] w-full cursor-pointer items-center justify-between',
              layout === 'half' ? 'max-w-md' : 'w-full'
            )}
            disabled={disabled || (!fieldAdvancedMode && !projectId)}
          >
            <span className='block flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left'>
              {selectedLabel}
            </span>
            <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-[var(--radix-popover-trigger-width)] rounded-[4px] p-0'>
          <Command
            filter={(value, search) => {
              // `value` is from CommandItem's "value" prop (sysId or id here)
              // We want to match by task name too
              const task = tasks.find((t) => t.sysId === value || t.id === value)
              if (!task) return 0

              // Custom matching: case-insensitive substring
              return task.name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }}
          >
            <CommandInput placeholder='Search tasks...' className='h-9' />
            <CommandList>
              <CommandEmpty>No task found.</CommandEmpty>
              <CommandGroup>
                {tasks.map((task) => {
                  const taskId = task.sysId || task.id
                  const isSelected =
                    typeof selectedValue === 'object'
                      ? selectedValue?.sysId === taskId || selectedValue?.id === taskId
                      : selectedValue === taskId
                  return (
                    <CommandItem
                      key={taskId}
                      value={taskId}
                      onSelect={() => handleSelect(task)}
                      className='max-w-full whitespace-normal break-words'
                      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    >
                      <span className='whitespace-normal break-words'>{task.name}</span>
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
