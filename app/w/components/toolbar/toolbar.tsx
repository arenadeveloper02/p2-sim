'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { ToolbarTabs } from './components/toolbar-tabs/toolbar-tabs'
import { ToolbarBlock } from './components/toolbar-block/toolbar-block'
import { getBlocksByCategory, getAllBlocks } from '../../../../blocks'
import { BlockCategory, BlockConfig } from '../../../../blocks/types'

export function Toolbar() {
  const [activeTab, setActiveTab] = useState<BlockCategory>('basic')
  const [searchQuery, setSearchQuery] = useState('')

  const blocks = useMemo(() => {
    if (!searchQuery.trim()) {
      return getBlocksByCategory(activeTab)
    }

    const query = searchQuery.toLowerCase()
    return getAllBlocks().filter(
      (block) =>
        block.toolbar.title.toLowerCase().includes(query) ||
        block.toolbar.description.toLowerCase().includes(query)
    )
  }, [searchQuery, activeTab])

  return (
    <div className="fixed left-14 top-0 z-1 hidden h-full w-64 border-r bg-background sm:block">
      <div className="px-4 pt-4">
        <div className="relative">
          <Search className="absolute left-3 top-[50%] h-4 w-4 -translate-y-[50%] text-muted-foreground" />
          <Input
            placeholder="Search blocks..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {!searchQuery && (
        <ToolbarTabs activeTab={activeTab} onTabChange={setActiveTab} />
      )}

      <div className="p-4">
        <div className="flex flex-col gap-3">
          {blocks.map((block) => (
            <ToolbarBlock key={block.type} config={block} />
          ))}
        </div>
      </div>
    </div>
  )
}
