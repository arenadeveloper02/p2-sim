'use client'

import * as React from 'react'
import axios from 'axios'
import { Check, ChevronsUpDown } from 'lucide-react'
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
import { getArenaServiceBaseUrl } from '@/lib/arena-utils/arena-utils'
import { useSubBlockStore, useWorkflowRegistry } from '@/stores'
import { env } from '@/lib/env'
import { getArenaToken } from '@/lib/arena-utils/cookie-utils'

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
  const clientKey = subBlockId === 'task-project' ? 'task-client' : 'search-task-client'
  const clientId = values?.[activeWorkflowId ?? '']?.[blockId]?.[clientKey]

  const previewValue = isPreview && subBlockValues ? subBlockValues[subBlockId]?.value : undefined
  const selectedValue = isPreview ? previewValue : storeValue

  const [projects, setProjects] = React.useState<Project[]>([])
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')

  React.useEffect(() => {
    if (!clientId) return // No clientId, don't fetch projects

    const fetchProjects = async () => {
      setProjects([])
      try {
        const v2Token = await getArenaToken()
        const baseUrl = getArenaServiceBaseUrl()

        const arenaBackendBaseUrl = env.NEXT_PUBLIC_ARENA_BACKEND_BASE_URL
        const url = `${arenaBackendBaseUrl}/sol/v1/projects?clientId=${clientId}&projectType=STATUS&name=${''}`
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
      setStoreValue('')
    }
  }, [clientId, searchQuery])

  const selectedLabel =
    projects.find((proj) => proj.sysId === selectedValue)?.name || 'Select project...'

  const handleSelect = (projectId: string) => {
    if (!isPreview && !disabled) {
      setStoreValue(projectId)
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
            id={`project-${subBlockId}`}
            className='w-full justify-between'
            disabled={disabled || !clientId} // Disable if no client selected
          >
            {selectedLabel}
            <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-full p-0'>
          <Command
            filter={(value, search) => {
              // `value` is from CommandItem's "value" prop (sysId here)
              // We want to match by project name too
              const project = projects.find((p) => p.sysId === value)
              if (!project) return 0

              // Custom matching: case-insensitive substring
              return project.name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }}
          >
            <CommandInput placeholder='Search projects...' className='h-9' />
            <CommandList>
              <CommandEmpty>No project found.</CommandEmpty>
              <CommandGroup>
                {projects.map((project) => (
                  <CommandItem
                    key={project.sysId}
                    value={project.sysId}
                    onSelect={() => handleSelect(project.sysId)}
                  >
                    {project.name}
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4',
                        selectedValue === project.sysId ? 'opacity-100' : 'opacity-0'
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
