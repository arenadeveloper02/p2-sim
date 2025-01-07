'use client'

import { useState } from 'react'
import { ToolbarTabs } from './toolbar-tabs'

export function DesktopToolbar() {
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic')

  return (
    <div className="fixed left-14 top-0 z-1 hidden h-full w-72 border-r bg-background sm:block">
      <ToolbarTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="p-4">
        {activeTab === 'basic' ? (
          <div>
            {/* Basic tab content */}
            Basic Content Here
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
