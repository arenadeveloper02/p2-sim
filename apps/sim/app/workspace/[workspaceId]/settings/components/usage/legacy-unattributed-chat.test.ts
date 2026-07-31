/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  hasMissingChatIdAttribution,
  isLegacyUnattributedChatId,
  LEGACY_UNATTRIBUTED_CHAT_ID,
  LEGACY_UNATTRIBUTED_CHAT_TITLE,
  withLegacyUnattributedChatRow,
} from '@/app/workspace/[workspaceId]/settings/components/usage/legacy-unattributed-chat'

describe('withLegacyUnattributedChatRow', () => {
  it('appends a legacy row when missing chat attribution has cost', () => {
    const rows = withLegacyUnattributedChatRow(
      [
        {
          chatId: 'chat-1',
          title: 'Research',
          billableCost: 12,
          rawCost: 10,
          count: 2,
          chatType: 'mothership' as const,
          userId: 'user-1',
          runCount: 4,
        },
      ],
      { billableCost: 5, rawCost: 5, count: 12 },
      (bucket) => ({
        chatId: LEGACY_UNATTRIBUTED_CHAT_ID,
        title: LEGACY_UNATTRIBUTED_CHAT_TITLE,
        billableCost: bucket.billableCost,
        rawCost: bucket.rawCost,
        count: bucket.count,
        chatType: 'copilot' as const,
        userId: '',
        runCount: 0,
      })
    )

    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({
      chatId: LEGACY_UNATTRIBUTED_CHAT_ID,
      title: LEGACY_UNATTRIBUTED_CHAT_TITLE,
      billableCost: 5,
      count: 12,
    })
    expect(isLegacyUnattributedChatId(rows[1]!.chatId)).toBe(true)
  })

  it('skips when there is no missing chat attribution', () => {
    expect(hasMissingChatIdAttribution({ billableCost: 0, rawCost: 0, count: 0 })).toBe(false)
    expect(
      withLegacyUnattributedChatRow(
        [{ chatId: 'chat-1', billableCost: 1 }],
        { billableCost: 0, rawCost: 0, count: 0 },
        () => ({ chatId: LEGACY_UNATTRIBUTED_CHAT_ID, billableCost: 0 })
      )
    ).toEqual([{ chatId: 'chat-1', billableCost: 1 }])
  })
})
