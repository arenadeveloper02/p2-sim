'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/core/utils/cn'

interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string
  children: React.ReactNode
}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, placeholder, children, disabled, ...props }, ref) => {
    return (
      <div className='relative overflow-hidden rounded-[8px]'>
        <select
          ref={ref}
          className={cn(
            'native-select-custom flex h-10 w-full appearance-none rounded-[8px] border border-input bg-background px-3 py-2 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          style={{
            WebkitAppearance: 'none',
            WebkitBorderRadius: '8px',
            MozAppearance: 'none',
            appearance: 'none',
            backgroundImage: 'none',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 0.7em center',
            backgroundSize: '0',
            paddingRight: '2.5rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          disabled={disabled}
          {...props}
        >
          {placeholder && (
            <option value='' disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <div className='pointer-events-none absolute top-3 right-3 z-10'>
          <ChevronDown className='h-4 w-4 text-muted-foreground' />
        </div>
      </div>
    )
  }
)

NativeSelect.displayName = 'NativeSelect'

export { NativeSelect }
