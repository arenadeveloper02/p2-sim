'use client'

interface ToolbarTabsProps {
  activeTab: 'basic' | 'advanced'
  onTabChange: (tab: 'basic' | 'advanced') => void
}

export function ToolbarTabs({ activeTab, onTabChange }: ToolbarTabsProps) {
  return (
    <div className="relative pt-5">
      <div className="flex gap-8 px-6">
        <button
          onClick={() => onTabChange('basic')}
          className={`text-sm font-medium transition-colors hover:text-black ${
            activeTab === 'basic' ? 'text-black' : 'text-gray-500'
          }`}
        >
          Basic
        </button>
        <button
          onClick={() => onTabChange('advanced')}
          className={`text-sm font-medium transition-colors hover:text-black ${
            activeTab === 'advanced' ? 'text-black' : 'text-gray-500'
          }`}
        >
          Advanced
        </button>
      </div>

      <div className="relative mt-2">
        <div className="absolute bottom-0 h-[1px] w-full bg-gray-200" />
        <div
          className="absolute bottom-0 h-[1.5px] bg-black transition-transform duration-200"
          style={{
            width: activeTab === 'advanced' ? '68px' : '38px',
            transform: `translateX(${
              activeTab === 'advanced' ? '91px' : '23.75px'
            })`,
          }}
        />
      </div>
    </div>
  )
}
