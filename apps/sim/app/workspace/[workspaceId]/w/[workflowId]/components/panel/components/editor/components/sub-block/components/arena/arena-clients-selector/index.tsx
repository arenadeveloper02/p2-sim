'use client'

import * as React from 'react'
import axios from 'axios'
import { Combobox, type ComboboxOption } from '@/components/emcn'
import { getArenaToken } from '@/lib/arena-utils/cookie-utils'
import { env } from '@/lib/core/config/env'
import { cn } from '@/lib/core/utils/cn'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'
import { mergeArenaComboboxOptions } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/arena/arena-combobox-utils'

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
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    const fetchClients = async () => {
      setIsLoading(true)
      try {
        setClients([])
        const v2Token = await getArenaToken()
        const arenaBackendBaseUrl = env.NEXT_PUBLIC_ARENA_BACKEND_BASE_URL
        const response = await axios.get(
          `${arenaBackendBaseUrl}/list/userservice/getclientbyuser`,
          {
            headers: {
              Authorisation: v2Token || '',
            },
          }
        )
        const clientsData = response.data?.response
        const clientsArray = Array.isArray(clientsData) ? clientsData : []
        if (!cancelled) setClients(clientsArray)
      } catch (error) {
        console.error('Error fetching clients:', error)
        if (!cancelled) setClients([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchClients()

    return () => {
      cancelled = true
    }
  }, [])

  const selectedId =
    selectedValue && typeof selectedValue === 'object' && 'clientId' in selectedValue
      ? (selectedValue as Client).clientId
      : ''

  const fallbackLabel =
    selectedValue && typeof selectedValue === 'object' && 'clientId' in selectedValue
      ? (selectedValue as Client & { customDisplayValue?: string }).customDisplayValue ||
        (selectedValue as Client).name
      : undefined

  const options: ComboboxOption[] = React.useMemo(
    () =>
      mergeArenaComboboxOptions(
        clients.map((c) => ({ label: c.name, value: c.clientId })),
        selectedId || undefined,
        fallbackLabel
      ),
    [clients, selectedId, fallbackLabel]
  )

  return (
    <div
      className={cn('w-full pt-1', layout === 'half' && 'max-w-md')}
      id={`client-${subBlockId}`}
    >
      <Combobox
        options={options}
        value={selectedId}
        selectedValue={selectedId}
        onChange={(v) => {
          if (isPreview || disabled) return
          const fromList = clients.find((cl) => cl.clientId === v)
          const fromOpt = options.find((o) => o.value === v)
          if (fromList) {
            setStoreValue({ ...fromList, customDisplayValue: fromList.name })
          } else if (fromOpt) {
            setStoreValue({ clientId: v, name: fromOpt.label, customDisplayValue: fromOpt.label })
          }
        }}
        placeholder='Select client...'
        disabled={disabled}
        searchable
        searchPlaceholder='Search clients...'
        emptyMessage='No client found.'
        isLoading={isLoading}
        maxHeight={240}
        dropdownWidth='trigger'
      />
    </div>
  )
}
