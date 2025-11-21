'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface ControlsProps {
  isRefetching?: boolean
  resetToNow?: () => void
  live?: boolean
  setLive?: (value: boolean) => void
  viewMode?: string
  setViewMode?: (mode: 'logs' | 'dashboard') => void
  searchComponent?: React.ReactNode
  showExport?: boolean
  onExport?: () => void
}

export default function Controls({
  isRefetching = false,
  resetToNow,
  live = false,
  setLive,
  viewMode,
  setViewMode,
  searchComponent,
  showExport = false,
  onExport,
}: ControlsProps) {
  return (
    <div className='mb-4 flex items-center justify-between gap-4'>
      <div className='flex flex-1 items-center gap-4'>
        {searchComponent}
        <div className='flex items-center gap-2'>
          <Switch id='live-mode' checked={live} onCheckedChange={setLive} />
          <Label htmlFor='live-mode' className='text-sm'>
            Live
          </Label>
        </div>
        {resetToNow && (
          <Button variant='outline' size='sm' onClick={resetToNow} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        )}
        {showExport && onExport && (
          <Button variant='outline' size='sm' onClick={onExport}>
            Export
          </Button>
        )}
      </div>
      {viewMode && setViewMode && (
        <div className='flex gap-2'>
          <Button
            variant={viewMode === 'logs' ? 'default' : 'outline'}
            size='sm'
            onClick={() => setViewMode('logs')}
          >
            Logs
          </Button>
          <Button
            variant={viewMode === 'dashboard' ? 'default' : 'outline'}
            size='sm'
            onClick={() => setViewMode('dashboard')}
          >
            Dashboard
          </Button>
        </div>
      )}
    </div>
  )
}
