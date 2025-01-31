import { useState } from 'react'

interface JSONViewProps {
  data: any
  level?: number
}

export const JSONView = ({ data, level = 0 }: JSONViewProps) => {
  const [isCollapsed, setIsCollapsed] = useState(true)

  if (data === null) return <span className="text-muted-foreground">null</span>
  if (typeof data !== 'object') {
    return (
      <span
        className={`${
          typeof data === 'string' ? 'text-success' : 'text-info'
        } break-all`}
      >
        {JSON.stringify(data)}
      </span>
    )
  }

  const isArray = Array.isArray(data)
  const items = isArray ? data : Object.entries(data)
  const isEmpty = items.length === 0

  if (isEmpty) {
    return <span>{isArray ? '[]' : '{}'}</span>
  }

  return (
    <div className="relative">
      <span
        className="cursor-pointer select-none"
        onClick={(e) => {
          e.stopPropagation()
          setIsCollapsed(!isCollapsed)
        }}
      >
        {isCollapsed ? '▶' : '▼'} {isArray ? '[' : '{'}
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
      <span>{isArray ? ']' : '}'}</span>
    </div>
  )
}
