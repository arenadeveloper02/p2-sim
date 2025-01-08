'use client'

import { useState } from 'react'
import { ToolbarTabs } from './toolbar-tabs'
import { Block } from './block'

const BLOCK_COLORS = {
  agent: '#7F2FFF',
  api: '#2F55FF',
  conditional: '#FF972F',
} as const

const BASIC_BLOCKS = [
  {
    type: 'agent',
    title: 'Agent',
    description: 'Use any LLM',
    bgColor: BLOCK_COLORS.agent,
  },
  {
    type: 'api',
    title: 'API',
    description: 'Connect to any API',
    bgColor: BLOCK_COLORS.api,
  },
  {
    type: 'conditional',
    title: 'Conditional',
    description: 'Create branching logic',
    bgColor: BLOCK_COLORS.conditional,
  },
] as const

export function DesktopToolbar() {
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic')

  return (
    <div className="fixed left-14 top-0 z-1 hidden h-full w-72 border-r bg-background sm:block">
      <ToolbarTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="p-4">
        {activeTab === 'basic' ? (
          <div className="flex flex-col gap-3">
            {BASIC_BLOCKS.map((block) => (
              <Block key={block.type} {...block} />
            ))}
          </div>
        ) : (
          <div>
            {/* Advanced tab content */}
            Advanced Content Here
          </div>
        )}
      </div>
    </div>
  )
}
