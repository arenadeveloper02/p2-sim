'use client'

import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { useParams } from 'next/navigation'
import {
  Sparkles,
  Send,
  Trash2,
  X,
  Loader2,
  User,
  Wrench,
  ChevronDown,
  ChevronRight,
  Check,
  XCircle,
  PlusCircle,
  MinusCircle,
  Link2,
  Unlink2,
  Pencil,
  MessageSquare,
  Bot,
} from 'lucide-react'
import { cn } from '@/lib/core/utils/cn'
import {
  useSimCopilotStore,
  type CopilotMessage,
  type ToolCallInfo,
  type PendingEdit,
  type EditOperation,
  type CopilotMode,
} from '@/stores/sim-copilot/store'
import {
  PROVIDER_ID_TO_LABEL,
  PROVIDER_MODELS,
  type ProviderId,
} from '@/lib/sim-copilot/ai-models'

// ── Tool call display ────────────────────────────────────────────────────────

const ToolCallBadge = memo(function ToolCallBadge({
  toolCall,
}: {
  toolCall: ToolCallInfo
}) {
  const [expanded, setExpanded] = useState(false)

  const toolLabels: Record<string, string> = {
    get_workflow: 'Inspected workflow',
    get_available_blocks: 'Listed available blocks',
    get_block_details: 'Got block details',
    edit_workflow: 'Edited workflow',
    run_workflow: 'Ran workflow',
    explain_block: 'Explained block',
  }

  return (
    <div className='my-1'>
      <button
        onClick={() => setExpanded(!expanded)}
        className='flex items-center gap-1.5 rounded-lg bg-secondary/60 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-all'
      >
        <Wrench className='h-3 w-3' />
        <span>{toolLabels[toolCall.name] ?? toolCall.name}</span>
        {expanded ? (
          <ChevronDown className='h-3 w-3' />
        ) : (
          <ChevronRight className='h-3 w-3' />
        )}
      </button>
      {expanded && (
        <div className='mt-1 ml-2 rounded-lg bg-secondary/30 p-2 text-[10px] font-mono text-muted-foreground max-h-[120px] overflow-y-auto'>
          {toolCall.result ? (
            <pre className='whitespace-pre-wrap break-all'>
              {formatToolResult(toolCall.result)}
            </pre>
          ) : (
            <pre className='whitespace-pre-wrap break-all'>
              {toolCall.arguments}
            </pre>
          )}
        </div>
      )}
    </div>
  )
})

function formatToolResult(result: string): string {
  try {
    const parsed = JSON.parse(result)
    return JSON.stringify(parsed, null, 2).slice(0, 500)
  } catch {
    return result.slice(0, 500)
  }
}

// ── Operation label helpers ──────────────────────────────────────────────────

const OP_ICONS: Record<string, React.ReactNode> = {
  add_block: <PlusCircle className='h-3.5 w-3.5 text-emerald-500' />,
  remove_block: <MinusCircle className='h-3.5 w-3.5 text-red-500' />,
  add_connection: <Link2 className='h-3.5 w-3.5 text-blue-500' />,
  remove_connection: <Unlink2 className='h-3.5 w-3.5 text-orange-500' />,
  update_block: <Pencil className='h-3.5 w-3.5 text-violet-500' />,
}

function opLabel(op: EditOperation): string {
  switch (op.action) {
    case 'add_block':
      return `Add ${op.block_type ?? 'block'}${op.values ? ` (${Object.keys(op.values).join(', ')})` : ''}`
    case 'remove_block':
      return `Remove block "${op.block_id}"`
    case 'add_connection':
      return `Connect "${op.source_id}" → "${op.target_id}"`
    case 'remove_connection':
      return `Remove connection "${op.connection_id}"`
    case 'update_block':
      return `Update "${op.block_id}" — ${op.values ? Object.keys(op.values).join(', ') : ''}`
    default:
      return op.action
  }
}

// ── Pending approval card ───────────────────────────────────────────────────

function PendingApprovalCard({
  pendingEdit,
  onAccept,
  onReject,
}: {
  pendingEdit: PendingEdit
  onAccept: () => void
  onReject: () => void
}) {
  return (
    <div className='mx-4 rounded-xl border-2 border-violet-500/40 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 p-3'>
      <div className='flex items-center gap-2 mb-2'>
        <div className='flex h-6 w-6 items-center justify-center rounded-lg bg-violet-500/15'>
          <Wrench className='h-3 w-3 text-violet-500' />
        </div>
        <span className='text-xs font-semibold text-foreground'>
          Proposed changes ({pendingEdit.operations.length})
        </span>
      </div>

      <div className='space-y-1 mb-3 max-h-[200px] overflow-y-auto'>
        {pendingEdit.operations.map((op, i) => (
          <div
            key={i}
            className='flex items-center gap-2 rounded-lg bg-background/60 px-2.5 py-1.5 text-[11px] text-foreground'
          >
            {OP_ICONS[op.action] ?? <Wrench className='h-3.5 w-3.5 text-muted-foreground' />}
            <span>{opLabel(op)}</span>
          </div>
        ))}
      </div>

      <div className='flex items-center gap-2'>
        <button
          onClick={onAccept}
          className='flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium py-2 transition-all shadow-sm hover:shadow-md'
        >
          <Check className='h-3.5 w-3.5' />
          Accept
        </button>
        <button
          onClick={onReject}
          className='flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-medium py-2 transition-all border border-red-500/20'
        >
          <XCircle className='h-3.5 w-3.5' />
          Reject
        </button>
      </div>
    </div>
  )
}

// ── Message bubble ───────────────────────────────────────────────────────────

const MessageBubble = memo(function MessageBubble({
  message,
}: {
  message: CopilotMessage
}) {
  if (message.role === 'system' || message.role === 'tool') return null

  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-2.5 px-4', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 mt-0.5'>
          <Sparkles className='h-3.5 w-3.5 text-white' />
        </div>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-br-md'
            : 'bg-secondary/80 text-foreground rounded-bl-md'
        )}
      >
        <div className='whitespace-pre-wrap break-words'>{message.content}</div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className='mt-2 space-y-1'>
            {message.toolCalls.map((tc) => (
              <ToolCallBadge key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
      </div>
      {isUser && (
        <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary border border-border mt-0.5'>
          <User className='h-3.5 w-3.5 text-muted-foreground' />
        </div>
      )}
    </div>
  )
})

// ── Welcome state ────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Build a workflow with Start → Agent → Output',
  'Explain my current workflow',
  'Add an API block that fetches data',
  'What blocks are available?',
]

function WelcomeState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <div className='flex flex-col items-center justify-center h-full text-center px-6'>
      <div className='flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 mb-4'>
        <Sparkles className='h-7 w-7 text-violet-500' />
      </div>
      <p className='text-sm font-medium text-foreground mb-1'>
        Sim Copilot
      </p>
      <p className='text-xs text-muted-foreground leading-relaxed mb-4'>
        I can build workflows, explain blocks, and help you configure your automations.
      </p>
      <div className='flex flex-col gap-2 w-full'>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className='text-left rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs text-foreground hover:bg-secondary/80 transition-all'
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Mode selector ─────────────────────────────────────────────────────────────

function ModeSelector() {
  const mode = useSimCopilotStore((s) => s.mode)
  const setMode = useSimCopilotStore((s) => s.setMode)

  return (
    <div className='flex items-center rounded-lg border border-border bg-background/50 p-0.5'>
      <button
        onClick={() => setMode('ask')}
        className={cn(
          'flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all',
          mode === 'ask'
            ? 'bg-violet-500 text-white'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <MessageSquare className='h-3 w-3' />
        Ask
      </button>
      <button
        onClick={() => setMode('agent')}
        className={cn(
          'flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all',
          mode === 'agent'
            ? 'bg-violet-500 text-white'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Bot className='h-3 w-3' />
        Agent
      </button>
    </div>
  )
}

// ── Model selector ───────────────────────────────────────────────────────────

function ModelSelector() {
  const provider = useSimCopilotStore((s) => s.provider)
  const model = useSimCopilotStore((s) => s.model)
  const setProvider = useSimCopilotStore((s) => s.setProvider)
  const setModel = useSimCopilotStore((s) => s.setModel)

  const models = PROVIDER_MODELS[provider] ?? []

  return (
    <div className='flex items-center gap-1.5'>
      <select
        value={provider}
        onChange={(e) => {
          const p = e.target.value as ProviderId
          setProvider(p)
        }}
        className='rounded-lg border border-border bg-background/50 px-2 py-1 text-[10px] font-medium focus:outline-none focus:ring-1 focus:ring-violet-500/30'
      >
        {Object.entries(PROVIDER_ID_TO_LABEL).map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className='rounded-lg border border-border bg-background/50 px-2 py-1 text-[10px] font-medium focus:outline-none focus:ring-1 focus:ring-violet-500/30 max-w-[140px]'
      >
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function SimCopilotPanel() {
  const params = useParams()
  const workflowId = params?.workflowId as string

  const isOpen = useSimCopilotStore((s) => s.isOpen)
  const messages = useSimCopilotStore((s) => s.messages)
  const isStreaming = useSimCopilotStore((s) => s.isStreaming)
  const mode = useSimCopilotStore((s) => s.mode)
  const sendMessage = useSimCopilotStore((s) => s.sendMessage)
  const clearChat = useSimCopilotStore((s) => s.clearChat)
  const togglePanel = useSimCopilotStore((s) => s.togglePanel)
  const pendingEdit = useSimCopilotStore((s) => s.pendingEdit)
  const acceptPending = useSimCopilotStore((s) => s.acceptPending)
  const rejectPending = useSimCopilotStore((s) => s.rejectPending)

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const visibleMessages = messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant'
  )

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen && !isStreaming) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, isStreaming])

  const handleSend = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim()
      if (!msg || isStreaming) return
      setInput('')
      await sendMessage(msg, { workflowId })
    },
    [input, isStreaming, sendMessage, workflowId]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  if (!isOpen) return null

  return (
    <div
      className='h-full min-h-0 shrink-0 flex flex-col border-l border-border bg-card/95 backdrop-blur-sm relative z-20'
      style={{ width: 400 }}
      onKeyDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className='flex items-center justify-between border-b border-border px-4 py-2.5 shrink-0'>
        <div className='flex items-center gap-2'>
          <div className='flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500'>
            <Sparkles className='h-3.5 w-3.5 text-white' />
          </div>
          <span className='text-xs font-semibold text-foreground'>Sim Copilot</span>
        </div>
        <div className='flex items-center gap-1'>
          <ModeSelector />
          <button
            onClick={clearChat}
            className='rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-all'
            title='Clear chat'
          >
            <Trash2 className='h-3.5 w-3.5' />
          </button>
          <button
            onClick={togglePanel}
            className='rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-all'
            title='Close copilot'
          >
            <X className='h-3.5 w-3.5' />
          </button>
        </div>
      </div>

      {/* Model Selector Row */}
      <div className='flex items-center justify-between border-b border-border px-4 py-2 shrink-0 bg-secondary/20'>
        <ModelSelector />
        <span className='text-[10px] text-muted-foreground'>
          {mode === 'agent' ? '🤖 Agent Mode' : '💬 Ask Mode'}
        </span>
      </div>

      {/* Messages */}
      <div className='flex-1 overflow-y-auto min-h-0 py-4 space-y-3'>
        {visibleMessages.length === 0 ? (
          <WelcomeState onSuggestion={(text) => handleSend(text)} />
        ) : (
          <>
            {visibleMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {pendingEdit && (
              <PendingApprovalCard
                pendingEdit={pendingEdit}
                onAccept={acceptPending}
                onReject={rejectPending}
              />
            )}
            {isStreaming && (
              <div className='flex gap-2.5 px-4'>
                <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 mt-0.5'>
                  <Sparkles className='h-3.5 w-3.5 text-white' />
                </div>
                <div className='rounded-2xl bg-secondary/80 px-3.5 py-2.5 rounded-bl-md'>
                  <span className='inline-flex gap-0.5'>
                    <span
                      className='h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce'
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className='h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce'
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className='h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce'
                      style={{ animationDelay: '300ms' }}
                    />
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className='border-t border-border px-3 py-3 shrink-0'>
        <div className='flex items-end gap-2'>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              pendingEdit
                ? 'Accept or reject changes first...'
                : isStreaming
                  ? 'Thinking...'
                  : mode === 'agent'
                    ? 'Ask the copilot to build or edit...'
                    : 'Ask a question...'
            }
            disabled={isStreaming || !!pendingEdit}
            rows={1}
            className={cn(
              'flex-1 resize-none rounded-xl border border-border bg-background/50 px-3.5 py-2.5 text-sm',
              'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/50',
              'transition-all max-h-[120px] min-h-[40px]',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = Math.min(target.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isStreaming || !!pendingEdit}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              input.trim() && !isStreaming && !pendingEdit
                ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-105'
                : 'bg-secondary text-muted-foreground'
            )}
          >
            {isStreaming ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <Send className='h-4 w-4' />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
