/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getThreadDateGroup,
  groupThreadsByDate,
} from '@/app/(interfaces)/chat/utils/thread-date-groups'

function localDay(offsetDays: number, hour = 12): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, hour)
}

describe('thread-date-groups', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 22, 15, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('groups pinned threads separately', () => {
    const now = new Date()
    const groups = groupThreadsByDate([
      {
        chatId: '1',
        title: 'Pinned',
        updatedAt: now.toISOString(),
        pinnedAt: now.toISOString(),
      },
      {
        chatId: '2',
        title: 'Today',
        updatedAt: now.toISOString(),
        pinnedAt: null,
      },
    ])

    expect(groups[0]?.label).toBe('Pinned')
    expect(groups[0]?.threads).toHaveLength(1)
    expect(groups[1]?.label).toBe('Today')
    expect(getThreadDateGroup(now)).toBe('Today')
  })

  it('classifies Yesterday / Previous 7 days / Older buckets', () => {
    expect(getThreadDateGroup(localDay(-1))).toBe('Yesterday')
    expect(getThreadDateGroup(localDay(-4))).toBe('Previous 7 days')
    expect(getThreadDateGroup(localDay(-10))).toBe('Older')
  })

  it('returns date groups in order and omits empty buckets', () => {
    const groups = groupThreadsByDate([
      {
        chatId: 'older',
        title: 'Older',
        updatedAt: localDay(-10).toISOString(),
      },
      {
        chatId: 'yesterday',
        title: 'Yesterday',
        updatedAt: localDay(-1).toISOString(),
      },
      {
        chatId: 'week',
        title: 'Week',
        updatedAt: localDay(-4).toISOString(),
      },
      {
        chatId: 'today',
        title: 'Today',
        updatedAt: localDay(0).toISOString(),
      },
    ])

    expect(groups.map((group) => group.label)).toEqual([
      'Today',
      'Yesterday',
      'Previous 7 days',
      'Older',
    ])
    expect(groups.every((group) => group.threads.length === 1)).toBe(true)
  })

  it('returns an empty list for no threads', () => {
    expect(groupThreadsByDate([])).toEqual([])
  })
})
