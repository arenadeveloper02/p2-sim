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

interface Project {
  sysId: string
  name: string
}

interface ArenaProjectSelectorProps {
  blockId: string
  subBlockId: string
  title: string
  clientId?: string // <-- IMPORTANT: We need clientId to fetch projects
  layout?: 'full' | 'half'
  isPreview?: boolean
  subBlockValues?: Record<string, any>
  disabled?: boolean
}

export function ArenaProjectSelector({
  blockId,
  subBlockId,
  title,
  layout,
  isPreview = false,
  subBlockValues,
  disabled = false,
}: ArenaProjectSelectorProps) {
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlockId, true)

  const activeWorkflowId = useWorkflowRegistry((state) => state.activeWorkflowId)
  const values = useSubBlockStore((state) => state.workflowValues)
  // Determine the client key based on the project subBlockId
  const clientKey =
    subBlockId === 'task-project'
      ? 'task-client'
      : subBlockId === 'comment-project'
        ? 'comment-client'
        : 'search-task-client'
  const clientValue = values?.[activeWorkflowId ?? '']?.[blockId]?.[clientKey]
  // Extract clientId - could be object (from selector) or string (from advanced mode/variable)
  const clientId = typeof clientValue === 'object' ? clientValue?.clientId : clientValue || ''

  // Check if advanced mode is enabled for this field
  const fieldAdvancedMode = useWorkflowStore((state) =>
    state.getFieldAdvancedMode(blockId, subBlockId)
  )

  const previewValue = isPreview && subBlockValues ? subBlockValues[subBlockId]?.value : undefined
  const selectedValue = isPreview ? previewValue : storeValue

  const [projects, setProjects] = React.useState<Project[]>([])
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [inputValue, setInputValue] = React.useState('')
  const [isEditing, setIsEditing] = React.useState(false)

  React.useEffect(() => {
    if (!clientId) return // No clientId, don't fetch projects

    // Skip fetch if clientId is a variable (won't be resolved in UI)
    if (isVariable(clientId)) {
      setProjects([])
      return
    }

    // Skip fetch if project field is in advanced mode and value is a variable
    if (fieldAdvancedMode && isVariable(selectedValue)) {
      setProjects([])
      return
    }

    const fetchProjects = async () => {
      setProjects([])
      try {
        const v2Token = await getArenaToken()

        const arenaBackendBaseUrl = env.NEXT_PUBLIC_ARENA_BACKEND_BASE_URL
        const url = `${arenaBackendBaseUrl}/sol/v1/projects?cid=${clientId}&projectType=STATUS&name=${''}`
        const response = await axios.get(url, {
          headers: {
            Authorisation: v2Token || '',
          },
        })

        setProjects(response.data.projectList || [])
      } catch (error) {
        console.error('Error fetching projects:', error)
        setProjects([])
      }
    }

    fetchProjects()

    return () => {
      setProjects([])
    }
  }, [clientId, fieldAdvancedMode, selectedValue, searchQuery])

  // Determine selected label and project ID
  const selectedProject = projects.find(
    (proj) =>
      proj.sysId === (typeof selectedValue === 'string' ? selectedValue : selectedValue?.sysId)
  )
  const selectedLabel =
    selectedValue?.customDisplayValue || selectedProject?.name || 'Select project...'
  const selectedProjectId =
    typeof selectedValue === 'string' ? selectedValue : selectedValue?.sysId || ''

  // State for advanced mode autocomplete
  const [advancedModeOpen, setAdvancedModeOpen] = React.useState(false)
  const [advancedModeSearch, setAdvancedModeSearch] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const overlayRef = React.useRef<HTMLDivElement>(null)
  // Local state for input display value (separate from stored value) - must be at top level
  const [inputDisplayValue, setInputDisplayValue] = React.useState('')

  const accessiblePrefixes = useAccessibleReferencePrefixes(blockId)

  // Helper to find project by name or ID (defined at top level to avoid hook issues)
  const findProjectByNameOrId = React.useCallback(
    (value: string): Project | undefined => {
      if (!value || !projects.length) return undefined
      const trimmed = value.trim()
      // Try exact name match first
      return (
        projects.find((p) => p.name.toLowerCase() === trimmed.toLowerCase()) ||
        projects.find((p) => p.sysId === trimmed) ||
        projects.find((p) => p.name.toLowerCase().includes(trimmed.toLowerCase()))
      )
    },
    [projects]
  )

  // When switching to advanced mode, keep the object but display the name
  // When switching back to basic mode, ensure we have the object
  React.useEffect(() => {
    if (fieldAdvancedMode) {
      // In advanced mode, keep the object if we have it (for ID extraction)
      // Only convert to string if it's a variable
      if (typeof selectedValue === 'object' && selectedValue?.sysId) {
        // Already an object - keep it, just update display
        // No need to change stored value
      } else if (
        typeof selectedValue === 'string' &&
        selectedValue.trim() &&
        !selectedValue.trim().startsWith('<')
      ) {
        // String ID or name - look up and store as object (so we have ID for backend)
        const matchedProject = findProjectByNameOrId(selectedValue)
        if (matchedProject && !isPreview && !disabled) {
          setStoreValue({ ...matchedProject, customDisplayValue: matchedProject.name })
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
        const matchedProject = findProjectByNameOrId(selectedValue)
        if (matchedProject && !isPreview && !disabled) {
          setStoreValue({ ...matchedProject, customDisplayValue: matchedProject.name })
        }
      }
    }
  }, [fieldAdvancedMode, selectedValue, isPreview, disabled, setStoreValue, findProjectByNameOrId])

  // Filter projects for autocomplete (defined at top level)
  const filteredProjects = React.useMemo(() => {
    if (!advancedModeSearch.trim()) return projects.slice(0, 10)
    const searchLower = advancedModeSearch.toLowerCase()
    return projects
      .filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) || p.sysId.toLowerCase().includes(searchLower)
      )
      .slice(0, 10)
  }, [projects, advancedModeSearch])

  const handleSelect = (project: Project) => {
    if (!isPreview && !disabled) {
      setStoreValue({ ...project, customDisplayValue: project.name })
      setOpen(false)
      setIsEditing(false)
    }
  }

  // Convert projects to combobox options
  const comboboxOptions = React.useMemo(
    () =>
      projects.map((project) => ({
        label: project.name,
        value: project.sysId,
      })),
    [projects]
  )

  // Get display value: name if object, look up name if ID string, otherwise the string value
  const currentValue =
    typeof selectedValue === 'object'
      ? selectedValue?.name || selectedValue?.customDisplayValue || ''
      : typeof selectedValue === 'string' &&
          selectedValue.trim() &&
          !selectedValue.trim().startsWith('<')
        ? findProjectByNameOrId(selectedValue)?.name || selectedValue
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
                setAdvancedModeOpen(newValue.trim().length > 0 && projects.length > 0)
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
                      if (e.key === 'Enter' && advancedModeOpen && filteredProjects.length > 0) {
                        e.preventDefault()
                        const firstMatch = filteredProjects[0]
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
                      if (!isPreview && !disabled && inputDisplayValue) {
                        // If it's a variable, store as string (backend will resolve it)
                        if (inputDisplayValue.trim().startsWith('<')) {
                          setStoreValue(inputDisplayValue.trim())
                        } else {
                          // Try to match name or ID and store as object (so we have ID for backend)
                          const matchedProject = findProjectByNameOrId(inputDisplayValue)
                          if (matchedProject) {
                            // Store the full object with ID (backend will extract sysId)
                            setStoreValue({
                              ...matchedProject,
                              customDisplayValue: matchedProject.name,
                            })
                            setInputDisplayValue(matchedProject.name)
                          } else {
                            // If no match, might be an ID - store as string, backend will handle it
                            setStoreValue(inputDisplayValue.trim())
                          }
                        }
                      }
                      setTimeout(() => setAdvancedModeOpen(false), 200)
                    }}
                    placeholder='Enter project name, ID, or variable like <block.project_id>'
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
          {advancedModeOpen && filteredProjects.length > 0 && (
            <div className='absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md'>
              <Command>
                <CommandList>
                  <CommandEmpty>No projects found.</CommandEmpty>
                  <CommandGroup>
                    {filteredProjects.map((project) => (
                      <CommandItem
                        key={project.sysId}
                        value={project.sysId}
                        onSelect={() => {
                          if (!isPreview && !disabled) {
                            // Store the full object so basic mode can display it correctly
                            setStoreValue({ ...project, customDisplayValue: project.name })
                            setInputDisplayValue(project.name)
                            setAdvancedModeSearch('')
                            setAdvancedModeOpen(false)
                            inputRef.current?.blur()
                          }
                        }}
                        className='whitespace-normal break-words'
                        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                      >
                        <span className='flex-1 whitespace-normal break-words'>{project.name}</span>
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
            id={`project-${subBlockId}`}
            className={cn(
              comboboxVariants(),
              'relative h-[32px] w-full cursor-pointer items-center justify-between'
            )}
            disabled={disabled || (!fieldAdvancedMode && !clientId)} // Disable if no client selected (unless in advanced mode)
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
              const project = projects.find((p) => p.sysId === value)
              if (!project) return 0
              return project.name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }}
          >
            <CommandInput placeholder='Search projects...' className='h-9' />
            <CommandList>
              <CommandEmpty>No project found.</CommandEmpty>
              <CommandGroup>
                {projects.map((project) => {
                  const isSelected =
                    typeof selectedValue === 'string'
                      ? selectedValue === project.sysId
                      : selectedValue?.sysId === project.sysId
                  return (
                    <CommandItem
                      key={project.sysId}
                      value={project.sysId}
                      onSelect={() => handleSelect(project)}
                      className='whitespace-normal break-words'
                      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    >
                      <span className='flex-1 whitespace-normal break-words'>{project.name}</span>
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
