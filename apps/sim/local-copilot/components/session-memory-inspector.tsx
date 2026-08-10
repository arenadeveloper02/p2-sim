'use client'

import { useState } from 'react'
import {
  Chip,
  ChipModal,
  ChipModalBody,
  ChipModalFooter,
  ChipModalHeader,
  cn,
} from '@sim/emcn'
import { Brain } from 'lucide-react'
import type { LocalCopilotSessionMemoryResponse } from '@/local-copilot/contracts/local-copilot'
import { useLocalCopilotSessionMemory } from '@/local-copilot/hooks/use-local-copilot'

/** Show the inspector affordance once a chat has enough turns to matter. */
export const SESSION_MEMORY_INSPECTOR_MIN_MESSAGES = 8

interface SessionMemoryInspectorProps {
  chatId?: string
  /**
   * Approximate message count in the current thread (user + assistant).
   * When omitted, the affordance is shown whenever `chatId` is present (mothership path).
   */
  messageCount?: number
  className?: string
}

interface MemorySectionProps {
  title: string
  items: string[]
}

/**
 * Read-only inspector for Local Copilot session memory on long threads.
 */
export function SessionMemoryInspector({
  chatId,
  messageCount = 0,
  className,
}: SessionMemoryInspectorProps) {
  const [open, setOpen] = useState(false)
  const longEnough =
    messageCount === undefined || messageCount >= SESSION_MEMORY_INSPECTOR_MIN_MESSAGES
  const enabled = Boolean(chatId) && longEnough
  const query = useLocalCopilotSessionMemory(enabled && open ? chatId : undefined)
  const memory = query.data?.memory ?? null

  if (!enabled) return null

  return (
    <>
      <Chip
        className={className}
        onClick={() => setOpen(true)}
        leftIcon={Brain}
        aria-label='Inspect session memory'
      >
        Memory
      </Chip>
      <ChipModal open={open} onOpenChange={setOpen} srTitle='Session memory'>
        <ChipModalHeader onClose={() => setOpen(false)}>Session memory</ChipModalHeader>
        <ChipModalBody>
          {query.isLoading ? (
            <p className='px-2 text-[13px] text-[var(--text-muted)]'>Loading…</p>
          ) : null}
          {query.isError ? (
            <p className='px-2 text-[13px] text-[var(--text-error)]'>
              Could not load session memory.
            </p>
          ) : null}
          {!query.isLoading && !query.isError && !memory ? (
            <p className='px-2 text-[13px] text-[var(--text-muted)]'>
              No session memory yet. It appears after longer Local Copilot threads are summarized.
            </p>
          ) : null}
          {memory ? <SessionMemoryBody memory={memory} /> : null}
          <p className='px-2 text-[12px] text-[var(--text-muted)]'>
            Read-only view of this chat&apos;s rolling memory. Durable preferences may also be saved
            to user memory.
          </p>
        </ChipModalBody>
        <ChipModalFooter
          onCancel={() => setOpen(false)}
          hideCancel
          primaryAction={{ label: 'Close', onClick: () => setOpen(false) }}
        />
      </ChipModal>
    </>
  )
}

function SessionMemoryBody({ memory }: { memory: LocalCopilotSessionMemoryResponse }) {
  return (
    <div className='flex flex-col gap-4 px-2'>
      <p className='text-[12px] text-[var(--text-muted)]'>
        Updated {formatTimestamp(memory.updatedAt)}
      </p>
      {memory.activeDirective ? (
        <section className='flex flex-col gap-1'>
          <h3 className='font-medium text-[12px] text-[var(--text-muted)] uppercase tracking-wide'>
            Active directive
          </h3>
          <p className='text-[13px] text-[var(--text-body)]'>{memory.activeDirective}</p>
        </section>
      ) : null}
      <MemorySection title='Goals' items={memory.goals} />
      <MemorySection title='Decisions' items={memory.decisions} />
      <MemorySection title='Constraints' items={memory.constraints} />
      <MemorySection title='Progress' items={memory.progress} />
      <MemorySection title='Open questions' items={memory.openQuestions} />
      <MemorySection title='Workflows' items={memory.entities.workflows} />
      <MemorySection title='Blocks' items={memory.entities.blocks} />
      <MemorySection title='Files' items={memory.entities.files} />
      <MemorySection title='Runs' items={memory.entities.runs} />
      <MemorySection title='Failures' items={memory.failures} />
      {memory.notes ? (
        <section className='flex flex-col gap-1'>
          <h3 className='font-medium text-[12px] text-[var(--text-muted)] uppercase tracking-wide'>
            Notes
          </h3>
          <p className='text-[13px] text-[var(--text-body)]'>{memory.notes}</p>
        </section>
      ) : null}
    </div>
  )
}

function MemorySection({ title, items }: MemorySectionProps) {
  if (items.length === 0) return null
  return (
    <section className='flex flex-col gap-1'>
      <h3 className='font-medium text-[12px] text-[var(--text-muted)] uppercase tracking-wide'>
        {title}
      </h3>
      <ul className={cn('flex flex-col gap-1')}>
        {items.map((item) => (
          <li key={`${title}:${item}`} className='text-[13px] text-[var(--text-body)]'>
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
