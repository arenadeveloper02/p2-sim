/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  getThreadDateGroup,
  groupThreadsByDate,
} from '@/app/(interfaces)/chat/utils/thread-date-groups'

describe('thread-date-groups', () => {
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
    expect(getThreadDateGroup(now)).toBe('Today')
  })
})
