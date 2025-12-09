'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/core/utils/cn'

interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string
  children: React.ReactNode
}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, placeholder, children, ...props }, ref) => {
    return (
      <div className='relative'>
        <select
          ref={ref}
          className={cn(
            'h-[34px] w-full appearance-none rounded-[6px] border-none bg-[var(--surface-6)] px-[10px] pr-[30px] text-left text-[13px] text-[var(--text-primary)] shadow-none focus:border-none focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60',
            className
          )}
          style={{
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            appearance: 'none',
          }}
          {...props}
        >
          {placeholder && (
            <option value='' disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <div className='-translate-y-1/2 pointer-events-none absolute top-1/2 right-[10px]'>
          <ChevronDown className='h-4 w-4 text-[var(--text-tertiary)] opacity-50' />
        </div>
      </div>
    )
  }
)

NativeSelect.displayName = 'NativeSelect'

export { NativeSelect }
