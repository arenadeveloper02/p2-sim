'use client'

import * as React from 'react'
import axios from 'axios'
import { Check, ChevronsUpDown } from 'lucide-react'
import Cookies from 'js-cookie'

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
import { Label } from '@/components/ui/label'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-sub-block-value'
import { getArenaServiceBaseUrl } from '@/lib/arena-utils'

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

  const [clients, setClients] = React.useState<Client[]>([])
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const fetchClients = async () => {
      try {
        setClients([])
        const v2Token = Cookies.get('v2Token')
        const baseUrl = getArenaServiceBaseUrl()
        const response = await axios.get(`${baseUrl}/list/userservice/getclientbyuser`, {
          headers: {
            Authorisation: v2Token || '',
          },
        })
        setClients(response.data.response || [])
      } catch (error) {
        console.error('Error fetching clients:', error)
      }
    }

    fetchClients()
  }, [])

  const selectedLabel =
    clients?.find((cl) => cl.clientId === selectedValue)?.name || 'Select client...'

  const handleSelect = (clientId: string) => {
    console.log('Selected client:', clientId)
    if (!isPreview && !disabled) {
      setStoreValue(clientId)
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
            id={`client-${subBlockId}`}
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
                {clients.map((client) => (
                  <CommandItem
                    key={client.clientId}
                    value={client.clientId}
                    onSelect={() => handleSelect(client.clientId)}
                  >
                    {client.name}
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4',
                        selectedValue === client.clientId ? 'opacity-100' : 'opacity-0'
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
