'use client'

import { useState } from 'react'
import { ToolbarTabs } from './toolbar-tabs'
import { Block } from '../block/block'
import { BLOCKS } from '../block/blocks'

export function Toolbar() {
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic')

  return (
    <div className="fixed left-14 top-0 z-1 hidden h-full w-72 border-r bg-background sm:block">
      <ToolbarTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="p-4">
        <div className="flex flex-col gap-3">
          {BLOCKS.filter((block) => block.category === activeTab).map(
            (block) => (
              <Block key={block.type} {...block} />
            )
          )}
        </div>
      </div>
    </div>
  )
}
