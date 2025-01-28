import * as React from 'react'

import { cn } from '@/lib/utils'

interface InputProps
  extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> {
  className?: string
  value?: string
  connections?: string[]
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, type, value = '', connections = [], onChange, ...props },
    ref
  ) => {
    // Create a hidden input for maintaining focus and handling keyboard events
    const hiddenInputRef = React.useRef<HTMLInputElement>(null)

    const renderContent = () => {
      if (!connections?.length) {
        return (
          <input
            type={type}
            className={cn(
              'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
              className
            )}
            value={value}
            onChange={onChange}
            ref={ref}
            {...props}
          />
        )
      }

      // Split text by connection patterns
      const parts = []
      let lastIndex = 0

      connections.forEach((connection) => {
        const pattern = `<${connection}>`
        const index = value.indexOf(pattern, lastIndex)

        if (index !== -1) {
          // Add text before connection
          if (index > lastIndex) {
            parts.push({
              type: 'text',
              content: value.slice(lastIndex, index),
            })
          }
          // Add connection
          parts.push({
            type: 'connection',
            content: connection,
          })
          lastIndex = index + pattern.length
        }
      })

      // Add remaining text
      if (lastIndex < value.length) {
        parts.push({
          type: 'text',
          content: value.slice(lastIndex),
        })
      }

      return (
        <div
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
            className
          )}
          onClick={() => hiddenInputRef.current?.focus()}
        >
          <div className="flex flex-wrap gap-1 items-center w-full">
            {parts.map((part, index) =>
              part.type === 'connection' ? (
                <span
                  key={index}
                  className="bg-blue-100 text-blue-800 px-1 rounded text-sm"
                >
                  {part.content}
                </span>
              ) : (
                <span key={index}>{part.content}</span>
              )
            )}
            <input
              ref={hiddenInputRef}
              type="text"
              className="w-px opacity-0 absolute"
              value={value}
              onChange={onChange}
              {...props}
            />
          </div>
        </div>
      )
    }

    return renderContent()
  }
)
Input.displayName = 'Input'

export { Input }
