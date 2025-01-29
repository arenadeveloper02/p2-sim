'use client'

import { useState } from 'react'
import { ToolbarTabs } from './components/toolbar-tabs/toolbar-tabs'
import { ToolbarBlock } from './components/toolbar-block/toolbar-block'
import { getBlocksByCategory } from '../../../../blocks'
import { BlockCategory } from '../../../../blocks/types'

export function Toolbar() {
  const [activeTab, setActiveTab] = useState<BlockCategory>('basic')

  return (
    <div className="fixed left-14 top-0 z-1 hidden h-full w-64 border-r bg-background sm:block">
      <ToolbarTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="p-4">
        <div className="flex flex-col gap-3">
          {getBlocksByCategory(activeTab).map((block) => (
            <ToolbarBlock key={block.type} config={block} />
          ))}
        </div>
      </div>
    </div>
  )
}
