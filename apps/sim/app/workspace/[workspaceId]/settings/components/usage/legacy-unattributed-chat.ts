import { sortByBillableCostDesc } from '@/lib/workspaces/usage/ledger-utils'

/** Sentinel chat id for ledger rows that cannot be joined to a copilot chat. */
export const LEGACY_UNATTRIBUTED_CHAT_ID = '__legacy_unattributed__'

export const LEGACY_UNATTRIBUTED_CHAT_TITLE = 'No chats identified (legacy)'

export interface MissingChatIdCostBucket {
  billableCost: number
  rawCost: number
  count: number
}

export function hasMissingChatIdAttribution(bucket: MissingChatIdCostBucket): boolean {
  return bucket.billableCost > 0 || bucket.count > 0 || bucket.rawCost > 0
}

export function isLegacyUnattributedChatId(chatId: string): boolean {
  return chatId === LEGACY_UNATTRIBUTED_CHAT_ID
}

/**
 * Appends a synthetic "No chats identified (legacy)" row when mothership/copilot
 * ledger spend is missing `chat_id`, so the expensive-chats table still accounts
 * for that cost after exact attribution backfills.
 */
export function withLegacyUnattributedChatRow<T extends { chatId: string; billableCost: number }>(
  byChat: T[],
  missingChatId: MissingChatIdCostBucket,
  buildRow: (bucket: MissingChatIdCostBucket) => T
): T[] {
  const sorted = sortByBillableCostDesc(byChat)

  if (!hasMissingChatIdAttribution(missingChatId)) {
    return sorted
  }
  if (sorted.some((row) => isLegacyUnattributedChatId(row.chatId))) {
    return sorted
  }
  return sortByBillableCostDesc([...sorted, buildRow(missingChatId)])
}
