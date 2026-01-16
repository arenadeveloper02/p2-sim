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
import { useWorkflowStore } from '@/stores/workflows/workflow/store'
import { isVariable } from '../utils'

interface Client {
  clientId: string
  name: string
}

interface ArenaClientsSelectorProps {
  blockId: string
  subBlockId: string
  title: string
  layout?: 'full' | 'half'
  isPreview?: boolean
  subBlockValues?: Record<string, any>
  disabled?: boolean
}

export function ArenaClientsSelector({
  blockId,
  subBlockId,
  title,
  layout,
  isPreview = false,
  subBlockValues,
  disabled = false,
}: ArenaClientsSelectorProps) {
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlockId)

  const previewValue = isPreview && subBlockValues ? subBlockValues[subBlockId]?.value : undefined

  const selectedValue = isPreview ? previewValue : storeValue

  // Check if advanced mode is enabled for this field
  const fieldAdvancedMode = useWorkflowStore((state) =>
    state.getFieldAdvancedMode(blockId, subBlockId)
  )

  const [clients, setClients] = React.useState<Client[]>([])
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState('')
  const [isEditing, setIsEditing] = React.useState(false)

  React.useEffect(() => {
    // Skip fetch if in advanced mode and value is a variable
    if (fieldAdvancedMode && isVariable(selectedValue)) {
      setClients([])
      return
    }

    const fetchClients = async () => {
      try {
        setClients([])
        const v2Token = await getArenaToken()
        if (!v2Token) {
          console.warn('No Arena token available for fetching clients')
          setClients([])
          return
        }

        const arenaBackendBaseUrl = env.NEXT_PUBLIC_ARENA_BACKEND_BASE_URL
        if (!arenaBackendBaseUrl) {
          console.error('NEXT_PUBLIC_ARENA_BACKEND_BASE_URL is not set')
          setClients([])
          return
        }

        const response = await axios.get(
          `${arenaBackendBaseUrl}/list/userservice/getclientbyuser`,
          {
            headers: {
              Authorisation: v2Token || '',
            },
          }
        )

        // Log the response structure for debugging
        console.log('Clients API response:', response.data)

        // Try different possible response structures (based on patterns from other selectors)
        let responseData: Client[] | undefined

        // Pattern 1: response.data.response (original assumption)
        if (Array.isArray(response.data?.response)) {
          responseData = response.data.response
        }
        // Pattern 2: response.data directly (if it's an array)
        else if (Array.isArray(response.data)) {
          responseData = response.data
        }
        // Pattern 3: response.data.data
        else if (Array.isArray(response.data?.data)) {
          responseData = response.data.data
        }
        // Pattern 4: response.data.clientList (similar to projectList pattern)
        else if (Array.isArray(response.data?.clientList)) {
          responseData = response.data.clientList
        }
        // Pattern 5: response.data.response might be an object with a data array
        else if (response.data?.response && Array.isArray(response.data.response.data)) {
          responseData = response.data.response.data
        }
        // Pattern 6: response.data.response might be an object with a list array
        else if (response.data?.response && Array.isArray(response.data.response.list)) {
          responseData = response.data.response.list
        }

        const clientsArray = Array.isArray(responseData) ? responseData : []
        console.log('Parsed clients array:', clientsArray.length, 'clients found')

        if (clientsArray.length === 0 && response.data) {
          console.warn(
            'No clients found in response. Response structure:',
            JSON.stringify(response.data, null, 2)
          )
        }

        setClients(clientsArray)
      } catch (error: any) {
        console.error('Error fetching clients:', error)
        if (error.response) {
          console.error('API Error Response:', error.response.status, error.response.data)
        } else if (error.request) {
          console.error('API Request Error:', error.request)
        }
        setClients([])
      }
    }

    fetchClients()

    return () => {
      setClients([])
    }
  }, [fieldAdvancedMode, selectedValue])

  // Determine selected label and value
  const selectedClient = Array.isArray(clients)
    ? clients.find(
        (cl) =>
          cl.clientId ===
          (typeof selectedValue === 'object' ? selectedValue?.clientId : selectedValue)
      )
    : undefined
  const selectedLabel = selectedClient?.name || 'Select client...'
  const selectedClientId =
    typeof selectedValue === 'object' ? selectedValue?.clientId : selectedValue || ''

  // State for advanced mode autocomplete
  const [advancedModeOpen, setAdvancedModeOpen] = React.useState(false)
  const [advancedModeSearch, setAdvancedModeSearch] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const overlayRef = React.useRef<HTMLDivElement>(null)
  // Local state for input display value (separate from stored value) - must be at top level
  const [inputDisplayValue, setInputDisplayValue] = React.useState('')

  const accessiblePrefixes = useAccessibleReferencePrefixes(blockId)

  // Helper to find client by name or ID (defined at top level to avoid hook issues)
  const findClientByNameOrId = React.useCallback(
    (value: string): Client | undefined => {
      if (!value || !Array.isArray(clients) || !clients.length) return undefined
      const trimmed = value.trim()
      return (
        clients.find((c) => c.name.toLowerCase() === trimmed.toLowerCase()) ||
        clients.find((c) => c.clientId === trimmed) ||
        clients.find((c) => c.name.toLowerCase().includes(trimmed.toLowerCase()))
      )
    },
    [clients]
  )

  // When switching to advanced mode, keep the object but display the name
  // When switching back to basic mode, ensure we have the object
  React.useEffect(() => {
    if (fieldAdvancedMode) {
      // In advanced mode, keep the object if we have it (for ID extraction)
      // Only convert to string if it's a variable
      if (typeof selectedValue === 'object' && selectedValue?.clientId) {
        // Already an object - keep it, just update display
        // No need to change stored value
      } else if (
        typeof selectedValue === 'string' &&
        selectedValue.trim() &&
        !selectedValue.trim().startsWith('<')
      ) {
        // String ID or name - look up and store as object (so we have ID for backend)
        const matchedClient = findClientByNameOrId(selectedValue)
        if (matchedClient && !isPreview && !disabled) {
          setStoreValue({ ...matchedClient, customDisplayValue: matchedClient.name })
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
        const matchedClient = findClientByNameOrId(selectedValue)
        if (matchedClient && !isPreview && !disabled) {
          setStoreValue({ ...matchedClient, customDisplayValue: matchedClient.name })
        }
      }
    }
  }, [fieldAdvancedMode, selectedValue, isPreview, disabled, setStoreValue, findClientByNameOrId])

  // Filter clients for autocomplete (defined at top level)
  const filteredClients = React.useMemo(() => {
    if (!Array.isArray(clients)) return []
    if (!advancedModeSearch.trim()) return clients.slice(0, 10)
    const searchLower = advancedModeSearch.toLowerCase()
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(searchLower) ||
          c.clientId.toLowerCase().includes(searchLower)
      )
      .slice(0, 10)
  }, [clients, advancedModeSearch])

  const handleSelect = (client: Client) => {
    if (!isPreview && !disabled) {
      setStoreValue({ ...client, customDisplayValue: client.name })
      setOpen(false)
      setIsEditing(false)
    }
  }

  // Convert clients to combobox options
  const comboboxOptions = React.useMemo(
    () =>
      Array.isArray(clients)
        ? clients.map((client) => ({
            label: client.name,
            value: client.clientId,
          }))
        : [],
    [clients]
  )

  // Get display value: name if object, look up name if ID string, otherwise the string value
  const currentValue =
    typeof selectedValue === 'object'
      ? selectedValue?.name || selectedValue?.customDisplayValue || ''
      : typeof selectedValue === 'string' &&
          selectedValue.trim() &&
          !selectedValue.trim().startsWith('<')
        ? findClientByNameOrId(selectedValue)?.name || selectedValue
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
                setAdvancedModeOpen(
                  newValue.trim().length > 0 && Array.isArray(clients) && clients.length > 0
                )
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
                      if (e.key === 'Enter' && advancedModeOpen && filteredClients.length > 0) {
                        e.preventDefault()
                        const firstMatch = filteredClients[0]
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
                          const matchedClient = findClientByNameOrId(inputDisplayValue)
                          if (matchedClient) {
                            // Store the full object with ID (backend will extract clientId)
                            setStoreValue({
                              ...matchedClient,
                              customDisplayValue: matchedClient.name,
                            })
                            setInputDisplayValue(matchedClient.name)
                          } else {
                            // If no match, might be an ID - store as string, backend will handle it
                            setStoreValue(inputDisplayValue.trim())
                          }
                        }
                      }
                      setTimeout(() => setAdvancedModeOpen(false), 200)
                    }}
                    placeholder='Enter client name, ID, or variable like <block.client_id>'
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
          {advancedModeOpen && filteredClients.length > 0 && (
            <div className='absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md'>
              <Command>
                <CommandList>
                  <CommandEmpty>No clients found.</CommandEmpty>
                  <CommandGroup>
                    {filteredClients.map((client) => (
                      <CommandItem
                        key={client.clientId}
                        value={client.clientId}
                        onSelect={() => {
                          if (!isPreview && !disabled) {
                            // Store the full object so basic mode can display it correctly
                            setStoreValue({ ...client, customDisplayValue: client.name })
                            setInputDisplayValue(client.name)
                            setAdvancedModeSearch('')
                            setAdvancedModeOpen(false)
                            inputRef.current?.blur()
                          }
                        }}
                        className='max-w-full whitespace-normal break-words'
                        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                      >
                        <span className='max-w-[400px] truncate'>{client.name}</span>
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
    <div className={cn('flex flex-col gap-2 pt-1', layout === 'half' ? 'max-w-md' : 'w-full')}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            role='combobox'
            aria-expanded={open}
            id={`client-${subBlockId}`}
            className={cn(
              comboboxVariants(),
              'relative h-[32px] w-full cursor-pointer items-center justify-between'
            )}
            disabled={disabled}
          >
            <span className='max-w-[400px] truncate'>{selectedLabel}</span>
            <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-[var(--radix-popover-trigger-width)] rounded-[4px] p-0'>
          <Command
            filter={(value, search) => {
              if (!Array.isArray(clients)) return 0
              const client = clients.find((cl) => cl.clientId === value || cl.name === value)
              if (!client) return 0

              return client.name.toLowerCase().includes(search.toLowerCase()) ||
                client.clientId.toLowerCase().includes(search.toLowerCase())
                ? 1
                : 0
            }}
          >
            <CommandInput placeholder='Search clients...' className='h-9' />
            <CommandList>
              <CommandEmpty>No client found.</CommandEmpty>
              <CommandGroup>
                {Array.isArray(clients) &&
                  clients.map((client) => (
                    <CommandItem
                      key={client.clientId}
                      value={client.clientId}
                      onSelect={() => handleSelect(client)}
                      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                      className='max-w-full whitespace-normal break-words'
                    >
                      <span className='max-w-[400px] truncate'>{client.name}</span>
                      <Check
                        className={cn(
                          'ml-auto h-4 w-4',
                          selectedValue?.clientId === client.clientId ? 'opacity-100' : 'opacity-0'
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
