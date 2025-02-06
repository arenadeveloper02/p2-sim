import { useState } from 'react'
import { PlusIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TagDropdown, checkTagTrigger } from '@/components/ui/tag-dropdown'
import { cn } from '@/lib/utils'
import { useSubBlockValue } from '../hooks/use-sub-block-value'
import { Code } from './code'

interface ConditionInputProps {
  blockId: string
  subBlockId: string
  isConnecting: boolean
}

interface Condition {
  id: string
  type: 'if' | 'else if' | 'else'
  code: string
}

export function ConditionInput({ blockId, subBlockId, isConnecting }: ConditionInputProps) {
  const [value, setValue] = useSubBlockValue(blockId, subBlockId)
  const [showTags, setShowTags] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [activeSourceBlockId, setActiveSourceBlockId] = useState<string | null>(null)
  const [activeConditionId, setActiveConditionId] = useState<string | null>(null)

  // Initialize with default if/else conditions if no value exists
  const conditions: Condition[] =
    Array.isArray(value) && value.length > 0 && 'type' in value[0]
      ? (value as unknown as Condition[])
      : [
          { id: crypto.randomUUID(), type: 'if', code: '' },
          { id: crypto.randomUUID(), type: 'else', code: '' },
        ]

  const addCondition = (afterId: string) => {
    const index = conditions.findIndex((c) => c.id === afterId)
    const newCondition: Condition = {
      id: crypto.randomUUID(),
      type: 'else if',
      code: '',
    }
    const newConditions = [
      ...conditions.slice(0, index + 1),
      newCondition,
      ...conditions.slice(index + 1),
    ]
    setValue(newConditions)
  }

  const removeCondition = (id: string) => {
    setValue(conditions.filter((c) => c.id !== id))
  }

  const updateCode = (id: string, code: string) => {
    setValue(conditions.map((c) => (c.id === id ? { ...c, code } : c)))
  }

  // Handle tag selection
  const handleTagSelect = (newValue: string) => {
    if (activeConditionId) {
      const condition = conditions.find((c) => c.id === activeConditionId)
      if (condition) {
        updateCode(activeConditionId, newValue)
      }
    }
    setShowTags(false)
    setActiveSourceBlockId(null)
    setActiveConditionId(null)
  }

  // Handle code changes and tag triggers
  const handleCodeChange = (conditionId: string, newCode: string) => {
    updateCode(conditionId, newCode)

    // Check for tag trigger
    const trigger = checkTagTrigger(newCode, cursorPosition)
    if (trigger.show) {
      setShowTags(true)
      setActiveConditionId(conditionId)
    } else {
      setShowTags(false)
      setActiveSourceBlockId(null)
      setActiveConditionId(null)
    }
  }

  return (
    <div className="space-y-4">
      {conditions.map((condition) => (
        <div key={condition.id} className="group flex flex-col w-full relative">
          <div className="rounded-md border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b bg-background">
              <span className="text-sm font-medium text-muted-foreground">{condition.type}</span>
              <div className="flex items-center gap-2">
                {condition.type !== 'else' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addCondition(condition.id)}
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <PlusIcon className="w-3 h-3 mr-1" />
                    Add
                  </Button>
                )}
                {condition.type !== 'if' && (
                  <button
                    onClick={() => removeCondition(condition.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <Code
              blockId={blockId}
              subBlockId={condition.id}
              isConnecting={isConnecting}
              inConditionSubBlock={true}
              value={condition.code}
              onChange={(newCode) => handleCodeChange(condition.id, newCode)}
              controlled={true}
              onSourceBlockIdChange={setActiveSourceBlockId}
            />
          </div>

          {showTags && activeConditionId === condition.id && (
            <div className="absolute left-0 right-0 top-full z-50">
              <TagDropdown
                visible={showTags}
                onSelect={handleTagSelect}
                blockId={blockId}
                activeSourceBlockId={activeSourceBlockId}
                inputValue={condition.code}
                cursorPosition={cursorPosition}
                onClose={() => {
                  setShowTags(false)
                  setActiveSourceBlockId(null)
                  setActiveConditionId(null)
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
