import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/core/utils/cn'

interface SelectOption {
  value: string
  label: string
}

interface CustomSelectProps {
  value?: string
  onChange?: (value: string) => void
  disabled?: boolean
  placeholder?: string
  options: SelectOption[]
  className?: string
}

const CustomSelect = React.forwardRef<HTMLButtonElement, CustomSelectProps>(
  ({ className, placeholder, options, disabled, value, onChange, ...props }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false)
    const [selectedValue, setSelectedValue] = React.useState(value || '')
    const [highlightedIndex, setHighlightedIndex] = React.useState(-1)
    const containerRef = React.useRef<HTMLDivElement>(null)
    const dropdownRef = React.useRef<HTMLDivElement>(null)
    const optionRefs = React.useRef<(HTMLDivElement | null)[]>([])

    const selectedOption = options.find((opt) => opt.value === selectedValue)

    React.useEffect(() => {
      if (value !== undefined) {
        setSelectedValue(value)
      }
    }, [value])

    React.useEffect(() => {
      if (isOpen) {
        const currentIndex = options.findIndex((opt) => opt.value === selectedValue)
        setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0)
      } else {
        setHighlightedIndex(-1)
      }
    }, [isOpen, options, selectedValue])

    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false)
        }
      }

      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
      }
    }, [isOpen])

    const handleSelect = (optionValue: string) => {
      setSelectedValue(optionValue)
      onChange?.(optionValue)
      setIsOpen(false)
    }

    React.useEffect(() => {
      if (isOpen && highlightedIndex >= 0 && optionRefs.current[highlightedIndex]) {
        optionRefs.current[highlightedIndex]?.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        })
      }
    }, [highlightedIndex, isOpen])

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (isOpen && highlightedIndex >= 0) {
          handleSelect(options[highlightedIndex].value)
        } else {
          setIsOpen(!isOpen)
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
        } else {
          setHighlightedIndex((prev) => Math.min(prev + 1, options.length - 1))
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
        } else {
          setHighlightedIndex((prev) => Math.max(prev - 1, 0))
        }
      }
    }

    return (
      <div ref={containerRef} className='relative w-full'>
        <button
          ref={ref}
          type='button'
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={cn(
            'flex h-[34px] w-full items-center justify-between rounded-[8px] border border-input bg-gray-100 px-2 py-[6px] font-medium font-sans text-base md:text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'cursor-pointer',
            !selectedValue && 'text-muted-foreground',
            className
          )}
          aria-haspopup='listbox'
          aria-expanded={isOpen}
          {...props}
        >
          <span className='truncate font-medium font-sans text-base md:text-sm'>
            {selectedOption ? selectedOption.label : placeholder || 'Select...'}
          </span>
          <ChevronDown
            className={cn(
              'ml-2 h-4 w-4 flex-shrink-0 opacity-50 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>

        {isOpen && (
          <div
            ref={dropdownRef}
            className={cn(
              'absolute z-50 mt-1 w-full overflow-hidden rounded-[8px] border bg-popover text-popover-foreground shadow-md',
              'fade-in-0 zoom-in-95 animate-in'
            )}
            role='listbox'
          >
            <div className='max-h-[300px] overflow-y-auto p-1'>
              {options.map((option, index) => (
                <div
                  key={option.value}
                  ref={(el) => {
                    optionRefs.current[index] = el
                  }}
                  onClick={() => handleSelect(option.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSelect(option.value)
                    }
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  role='option'
                  aria-selected={selectedValue === option.value}
                  tabIndex={-1}
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-[4px] px-2 py-1.5 font-medium font-sans text-base outline-none hover:bg-accent hover:text-accent-foreground md:text-sm',
                    index === highlightedIndex && 'bg-accent text-accent-foreground',
                    selectedValue === option.value && 'bg-accent/50'
                  )}
                >
                  <span className='flex-1 truncate'>{option.label}</span>
                  {selectedValue === option.value && (
                    <Check className='ml-2 h-4 w-4 flex-shrink-0' />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }
)

CustomSelect.displayName = 'CustomSelect'

export { CustomSelect }
export type { SelectOption }
