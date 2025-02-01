import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface JSONViewProps {
  data: any
  level?: number
  initiallyExpanded?: boolean
}

const MAX_STRING_LENGTH = 150

const TruncatedValue = ({ value }: { value: string }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  if (value.length <= MAX_STRING_LENGTH) {
    return <span>{value}</span>
  }

  return (
    <span>
      {isExpanded ? value : `${value.slice(0, MAX_STRING_LENGTH)}...`}
      <Button
        variant="link"
        size="sm"
        className="px-1 h-auto text-xs text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation()
          setIsExpanded(!isExpanded)
        }}
      >
        {isExpanded ? 'Show less' : 'Show more'}
      </Button>
    </span>
  )
}

export const JSONView = ({
  data,
  level = 0,
  initiallyExpanded = false,
}: JSONViewProps) => {
  const [isCollapsed, setIsCollapsed] = useState(!initiallyExpanded)

  useEffect(() => {
    setIsCollapsed(!initiallyExpanded)
  }, [initiallyExpanded])

  if (data === null) return <span className="text-muted-foreground">null</span>
  if (typeof data !== 'object') {
    const stringValue = JSON.stringify(data)
    return (
      <span
        className={`${
          typeof data === 'string' ? 'text-success' : 'text-info'
        } break-all`}
      >
        {typeof data === 'string' ? (
          <TruncatedValue value={stringValue} />
        ) : (
          stringValue
        )}
      </span>
    )
  }

  const isArray = Array.isArray(data)
  const items = isArray ? data : Object.entries(data)
  const isEmpty = items.length === 0

  if (isEmpty) {
    return (
      <span className="text-muted-foreground">{isArray ? '[]' : '{}'}</span>
    )
  }

  return (
    <div className="relative">
      <span
        className="cursor-pointer select-none inline-flex items-center text-muted-foreground"
        onClick={(e) => {
          e.stopPropagation()
          setIsCollapsed(!isCollapsed)
        }}
      >
        <span className="text-xs leading-none mr-1">
          {isCollapsed ? '▶' : '▼'}
        </span>
        <span>{isArray ? '[' : '{'}</span>
        {isCollapsed ? '...' : ''}
      </span>
      {!isCollapsed && (
        <div className="ml-4 break-words">
          {isArray
            ? items.map((item, index) => (
                <div key={index} className="break-all">
                  <JSONView data={item} level={level + 1} />
                  {index < items.length - 1 && ','}
                </div>
              ))
            : (items as [string, any][]).map(([key, value], index) => (
                <div key={key} className="break-all">
                  <span className="text-muted-foreground">{key}</span>:{' '}
                  <JSONView data={value} level={level + 1} />
                  {index < items.length - 1 && ','}
                </div>
              ))}
        </div>
      )}
      <span className="text-muted-foreground">{isArray ? ']' : '}'}</span>
    </div>
  )
}
