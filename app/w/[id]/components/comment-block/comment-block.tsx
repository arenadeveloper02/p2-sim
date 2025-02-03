import { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { X } from 'lucide-react'
import { useCommentStore } from '@/stores/comments/store'
import { NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'

interface CommentBlockData {
  id: string
  text: string
}

export function CommentBlock({ data }: NodeProps<CommentBlockData>) {
  const [text, setText] = useState(data.text)
  const [isEditing, setIsEditing] = useState(!data.text)
  const [isExpanded, setIsExpanded] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { updateComment, removeComment } = useCommentStore()

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isEditing])

  const handleBlur = () => {
    setIsEditing(false)
    setIsExpanded(false)
    if (text.trim()) {
      updateComment(data.id, text)
    } else {
      removeComment(data.id)
    }
  }

  const handleClick = () => {
    setIsExpanded(true)
    if (!text) {
      setIsEditing(true)
    }
  }

  if (!isExpanded) {
    return (
      <div
        className={cn(
          'w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm cursor-pointer',
          'hover:shadow-md transition-all duration-200 ease-in-out transform scale-100',
          'flex items-center justify-center'
        )}
        onClick={handleClick}
        onMouseEnter={() => setIsExpanded(true)}
      >
        <div className="w-2 h-2 rounded-full bg-yellow-500" />
      </div>
    )
  }

  return (
    <Card
      className={cn(
        'w-[240px] shadow-md select-none relative cursor-default focus:outline-none focus-visible:ring-0',
        'bg-white hover:bg-gray-50/50',
        'border border-gray-200',
        'transition-all duration-200 ease-in-out transform scale-100',
        'animate-in fade-in-0 zoom-in-95'
      )}
      onMouseLeave={() => !isEditing && setIsExpanded(false)}
    >
      <div className="flex items-center justify-between p-2 border-b border-gray-200 cursor-grab active:cursor-grabbing">
        <div className="text-sm font-medium text-gray-600">Note</div>
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation()
            removeComment(data.id)
          }}
        >
          <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
        </button>
      </div>

      <div className="p-2.5" onClick={() => setIsEditing(true)}>
        {isEditing ? (
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={handleBlur}
            className={cn(
              'min-h-[80px] max-h-[240px] resize-none',
              'bg-transparent border-0 outline-none focus:outline-none focus-visible:ring-0 focus:ring-0 p-0',
              'text-sm text-gray-900 placeholder:text-gray-400'
            )}
            placeholder="Type your note here..."
          />
        ) : (
          <div className="text-sm text-gray-900 whitespace-pre-wrap cursor-text">
            {text}
          </div>
        )}
      </div>
    </Card>
  )
}
