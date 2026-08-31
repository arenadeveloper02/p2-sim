'use client'

import { useState } from 'react'
import { Button, Chip, ChipInput, toast } from '@sim/emcn'
import { getErrorMessage } from '@sim/utils/errors'
import {
  useCreateSkillService,
  useSkillServices,
  useUpdateSkillService,
} from '@/hooks/queries/skill-share'

export function SkillServicesPanel() {
  const { data: services = [], isLoading, error } = useSkillServices()
  const createService = useCreateSkillService()
  const updateService = useUpdateSkillService()

  const [name, setName] = useState('')
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    createService.mutate(trimmed, {
      onSuccess: () => {
        setName('')
        toast.success('Service added')
      },
    })
  }

  const handleRename = () => {
    if (!renameId || !renameValue.trim()) return
    updateService.mutate(
      { id: renameId, name: renameValue.trim() },
      {
        onSuccess: () => {
          setRenameId(null)
          setRenameValue('')
          toast.success('Service renamed')
        },
      }
    )
  }

  return (
    <div className='flex flex-col gap-3'>
      <p className='text-[var(--text-secondary)] text-sm'>
        Labels for service-level skills (PPC, Ads, and others you add). General skills do not use
        these.
      </p>
      <div className='flex gap-2'>
        <ChipInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && handleCreate()}
          placeholder='New service name'
          disabled={createService.isPending}
          className='min-w-0 flex-1'
        />
        <Button
          variant='primary'
          onClick={handleCreate}
          disabled={createService.isPending || !name.trim()}
        >
          {createService.isPending ? 'Adding...' : 'Add'}
        </Button>
      </div>
      {(error || createService.error) && (
        <p className='text-[var(--text-error)] text-small'>
          {getErrorMessage(createService.error ?? error, 'Failed to load services')}
        </p>
      )}
      {isLoading && <p className='text-[var(--text-secondary)] text-small'>Loading services…</p>}
      {services.length > 0 && (
        <div className='flex flex-col gap-1'>
          {services.map((service) => (
            <div key={service.id} className='flex items-center gap-2 px-1'>
              {renameId === service.id ? (
                <>
                  <ChipInput
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && handleRename()}
                    className='min-w-0 flex-1'
                  />
                  <Chip onClick={handleRename}>Save</Chip>
                  <Chip
                    onClick={() => {
                      setRenameId(null)
                      setRenameValue('')
                    }}
                  >
                    Cancel
                  </Chip>
                </>
              ) : (
                <>
                  <span className='min-w-0 flex-1 truncate text-[var(--text-body)] text-small'>
                    {service.name}
                  </span>
                  <Chip
                    onClick={() => {
                      setRenameId(service.id)
                      setRenameValue(service.name)
                    }}
                  >
                    Rename
                  </Chip>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {updateService.error && (
        <p className='text-[var(--text-error)] text-small'>{updateService.error.message}</p>
      )}
    </div>
  )
}
