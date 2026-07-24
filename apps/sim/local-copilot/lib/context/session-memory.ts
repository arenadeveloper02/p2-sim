import { db } from '@sim/db'
import { copilotChats } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { sleep } from '@sim/utils/helpers'
import { truncate } from '@sim/utils/string'
import { and, eq } from 'drizzle-orm'
import {
  resolveEngagementModel,
  resolveEngagementProvider,
} from '@/local-copilot/lib/agent/engagement-status'
import { getLocalCopilotConfig } from '@/local-copilot/lib/config'
import { estimateChatMessagesTokens } from '@/local-copilot/lib/context/context-budget'
import { collectCompletionText } from '@/local-copilot/lib/providers/collect-text'
import { getMessageContentText } from '@/local-copilot/lib/providers/message-content'
import type { ChatMessage, LocalCopilotProvider } from '@/local-copilot/lib/providers/types'
import type { LocalCopilotConfig } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotSessionMemory')

export const SESSION_MEMORY_VERSION = 1 as const

/** Align with `LOCAL_COPILOT_RECENT_TURNS_FULL` in context-budget (kept local to avoid mock coupling). */
export const SESSION_MEMORY_RECENT_TURNS_FULL = 6

/** Refresh when prior history has more than this many user turns. */
export const SESSION_MEMORY_REFRESH_AFTER_TURNS = SESSION_MEMORY_RECENT_TURNS_FULL

/** Soft history token budget that also triggers a refresh. */
export const SESSION_MEMORY_SOFT_HISTORY_TOKEN_BUDGET = 24_000

/** Hard timeout for the summarizer call. */
export const SESSION_MEMORY_TIMEOUT_MS = 2_000

/** Max tokens for summarizer output. */
export const SESSION_MEMORY_MAX_TOKENS = 900

/** Cap on rendered session-memory JSON injected into the prompt (~1–2k tokens). */
export const SESSION_MEMORY_PROMPT_TOKEN_CAP = 1_800

export const SESSION_MEMORY_NOTES_MAX_CHARS = 500

export const SESSION_MEMORY_SYSTEM_PREFIX = 'Session memory (authoritative for earlier turns):'

const SUMMARIZER_SYSTEM_PROMPT = `You maintain a compact structured session memory for a workflow-automation assistant.
Return ONLY valid JSON matching this shape (no markdown fences):
{
  "goals": string[],
  "decisions": string[],
  "entities": { "workflows": string[], "blocks": string[], "files": string[], "runs": string[] },
  "progress": string[],
  "openQuestions": string[],
  "notes": string
}
Rules:
- Merge the previous memory with NEW turns only — do not drop important goals/decisions unless contradicted.
- Prefer IDs, names, and outcomes over raw tool dumps.
- Keep arrays short (≤8 items each). Cap notes at ~500 characters.
- Never store secrets (API keys, passwords, tokens, credentials).
- openQuestions = unresolved user asks; progress = work already done.`

export interface SessionMemoryEntities {
  workflows: string[]
  blocks: string[]
  files: string[]
  runs: string[]
}

export interface SessionMemory {
  version: typeof SESSION_MEMORY_VERSION
  updatedAt: string
  coveredThroughMessageId: string
  goals: string[]
  decisions: string[]
  entities: SessionMemoryEntities
  progress: string[]
  openQuestions: string[]
  notes: string
}

export interface SessionMemoryTurn {
  messageId: string
  role: 'user' | 'assistant'
  text: string
}

interface ChatConfigRecord {
  sessionMemory?: unknown
  [key: string]: unknown
}

/**
 * Marker used by fitPromptToTokenBudget callers — session memory is a system
 * message and is already retained with other system rows.
 */
export function isSessionMemorySystemMessage(message: ChatMessage): boolean {
  if (message.role !== 'system') return false
  const text = getMessageContentText(message.content)
  return text.startsWith(SESSION_MEMORY_SYSTEM_PREFIX)
}

/**
 * Parses unknown JSON into SessionMemory, or null if invalid.
 */
export function parseSessionMemory(value: unknown): SessionMemory | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.version !== SESSION_MEMORY_VERSION) return null
  if (typeof record.updatedAt !== 'string' || !record.updatedAt.trim()) return null
  if (typeof record.coveredThroughMessageId !== 'string' || !record.coveredThroughMessageId.trim()) {
    return null
  }

  const entitiesRaw =
    record.entities && typeof record.entities === 'object' && !Array.isArray(record.entities)
      ? (record.entities as Record<string, unknown>)
      : {}

  return {
    version: SESSION_MEMORY_VERSION,
    updatedAt: record.updatedAt,
    coveredThroughMessageId: record.coveredThroughMessageId.trim(),
    goals: toStringArray(record.goals),
    decisions: toStringArray(record.decisions),
    entities: {
      workflows: toStringArray(entitiesRaw.workflows),
      blocks: toStringArray(entitiesRaw.blocks),
      files: toStringArray(entitiesRaw.files),
      runs: toStringArray(entitiesRaw.runs),
    },
    progress: toStringArray(record.progress),
    openQuestions: toStringArray(record.openQuestions),
    notes: typeof record.notes === 'string' ? truncate(record.notes.trim(), SESSION_MEMORY_NOTES_MAX_CHARS, '') : '',
  }
}

/**
 * Parses the summarizer JSON body (partial fields allowed) into a SessionMemory.
 */
export function parseSummarizerSessionMemory(
  raw: string,
  previous: SessionMemory | null,
  coveredThroughMessageId: string
): SessionMemory | null {
  const jsonText = extractJsonObject(raw)
  if (!jsonText) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  const entitiesRaw =
    record.entities && typeof record.entities === 'object' && !Array.isArray(record.entities)
      ? (record.entities as Record<string, unknown>)
      : previous?.entities

  const memory: SessionMemory = {
    version: SESSION_MEMORY_VERSION,
    updatedAt: new Date().toISOString(),
    coveredThroughMessageId,
    goals: toStringArray(record.goals, previous?.goals),
    decisions: toStringArray(record.decisions, previous?.decisions),
    entities: {
      workflows: toStringArray(entitiesRaw?.workflows, previous?.entities.workflows),
      blocks: toStringArray(entitiesRaw?.blocks, previous?.entities.blocks),
      files: toStringArray(entitiesRaw?.files, previous?.entities.files),
      runs: toStringArray(entitiesRaw?.runs, previous?.entities.runs),
    },
    progress: toStringArray(record.progress, previous?.progress),
    openQuestions: toStringArray(record.openQuestions, previous?.openQuestions),
    notes:
      typeof record.notes === 'string'
        ? truncate(record.notes.trim(), SESSION_MEMORY_NOTES_MAX_CHARS, '')
        : (previous?.notes ?? ''),
  }

  return clampSessionMemory(memory)
}

/**
 * Enforces array length and notes size caps.
 */
export function clampSessionMemory(memory: SessionMemory): SessionMemory {
  return {
    ...memory,
    goals: memory.goals.slice(-8),
    decisions: memory.decisions.slice(-8),
    entities: {
      workflows: memory.entities.workflows.slice(-8),
      blocks: memory.entities.blocks.slice(-8),
      files: memory.entities.files.slice(-8),
      runs: memory.entities.runs.slice(-8),
    },
    progress: memory.progress.slice(-8),
    openQuestions: memory.openQuestions.slice(-8),
    notes: truncate(memory.notes, SESSION_MEMORY_NOTES_MAX_CHARS, ''),
  }
}

/**
 * Formats session memory as a system chat message for the prompt.
 */
export function formatSessionMemorySystemMessage(memory: SessionMemory): ChatMessage {
  const payload = {
    goals: memory.goals,
    decisions: memory.decisions,
    entities: memory.entities,
    progress: memory.progress,
    openQuestions: memory.openQuestions,
    notes: memory.notes,
  }
  let json = JSON.stringify(payload, null, 2)
  // Approximate token guard without requiring a model id here.
  while (json.length > SESSION_MEMORY_PROMPT_TOKEN_CAP * 4 && payload.progress.length > 0) {
    payload.progress.shift()
    json = JSON.stringify(payload, null, 2)
  }
  while (json.length > SESSION_MEMORY_PROMPT_TOKEN_CAP * 4 && payload.notes.length > 80) {
    payload.notes = truncate(payload.notes, Math.floor(payload.notes.length * 0.7), '')
    json = JSON.stringify(payload, null, 2)
  }
  return {
    role: 'system',
    content: `${SESSION_MEMORY_SYSTEM_PREFIX}\n${json}`,
  }
}

/**
 * Counts user-led turns in chat history (same grouping as context-budget).
 */
export function countHistoryTurns(messages: ChatMessage[]): number {
  let turns = 0
  let inTurn = false
  for (const message of messages) {
    if (message.role === 'user') {
      turns += 1
      inTurn = true
    } else if (message.role === 'system') {
      continue
    } else if (!inTurn) {
      turns += 1
      inTurn = true
    }
  }
  return turns
}

/**
 * Whether the chat is long enough to warrant (or refresh) session memory.
 */
export function shouldRefreshSessionMemory(params: {
  historyMessages: ChatMessage[]
  previous: SessionMemory | null
  uncoveredTurns: SessionMemoryTurn[]
  model?: string
}): boolean {
  if (params.uncoveredTurns.length === 0) return false

  // Incremental: new turns aged out of the recent window since last cursor.
  if (params.previous) return true

  const turnCount = countHistoryTurns(params.historyMessages)
  if (turnCount > SESSION_MEMORY_REFRESH_AFTER_TURNS) return true

  const historyTokens = estimateChatMessagesTokens(params.historyMessages, params.model)
  return historyTokens > SESSION_MEMORY_SOFT_HISTORY_TOKEN_BUDGET
}

/**
 * Returns turns that have not yet been incorporated into session memory.
 * Keeps the most recent `recentTurnsFull` turns out of the summarizer input
 * so they stay verbatim in the prompt.
 */
export function selectUncoveredTurnsForSummary(params: {
  turns: SessionMemoryTurn[]
  previous: SessionMemory | null
  recentTurnsFull?: number
}): SessionMemoryTurn[] {
  const recentTurnsFull = params.recentTurnsFull ?? SESSION_MEMORY_RECENT_TURNS_FULL
  const afterCursor = params.previous
    ? turnsAfterMessageId(params.turns, params.previous.coveredThroughMessageId)
    : params.turns

  if (afterCursor.length <= recentTurnsFull) return []

  return afterCursor.slice(0, afterCursor.length - recentTurnsFull)
}

/**
 * Loads session memory from `copilot_chats.config.sessionMemory`.
 */
export async function loadSessionMemory(chatId: string, userId: string): Promise<SessionMemory | null> {
  const [chat] = await db
    .select({ config: copilotChats.config })
    .from(copilotChats)
    .where(and(eq(copilotChats.id, chatId), eq(copilotChats.userId, userId)))
    .limit(1)

  if (!chat) return null
  const config = (chat.config ?? {}) as ChatConfigRecord
  return parseSessionMemory(config.sessionMemory)
}

/**
 * Merges session memory into `copilot_chats.config` without clobbering other keys.
 */
export async function persistSessionMemory(
  chatId: string,
  userId: string,
  memory: SessionMemory
): Promise<void> {
  const [chat] = await db
    .select({ config: copilotChats.config })
    .from(copilotChats)
    .where(and(eq(copilotChats.id, chatId), eq(copilotChats.userId, userId)))
    .limit(1)

  if (!chat) {
    logger.warn('Skipping session memory persist; chat not found', { chatId })
    return
  }

  const existing =
    chat.config && typeof chat.config === 'object' && !Array.isArray(chat.config)
      ? ({ ...(chat.config as ChatConfigRecord) } as ChatConfigRecord)
      : ({} as ChatConfigRecord)

  existing.sessionMemory = clampSessionMemory(memory)

  await db
    .update(copilotChats)
    .set({ config: existing, updatedAt: new Date() })
    .where(and(eq(copilotChats.id, chatId), eq(copilotChats.userId, userId)))
}

/**
 * Loads existing memory, optionally refreshes via a small LLM call, and persists.
 * Soft-fails: never throws to the caller for summarizer/provider errors.
 */
export async function ensureSessionMemory(params: {
  chatId?: string
  userId: string
  historyMessages: ChatMessage[]
  turns: SessionMemoryTurn[]
  signal?: AbortSignal
  deps?: {
    config?: LocalCopilotConfig
    provider?: LocalCopilotProvider
    model?: string
    load?: typeof loadSessionMemory
    persist?: typeof persistSessionMemory
    summarize?: typeof summarizeSessionMemory
  }
}): Promise<SessionMemory | null> {
  if (!params.chatId) return null

  const load = params.deps?.load ?? loadSessionMemory
  const persist = params.deps?.persist ?? persistSessionMemory
  const summarize = params.deps?.summarize ?? summarizeSessionMemory

  let previous: SessionMemory | null = null
  try {
    previous = await load(params.chatId, params.userId)
  } catch (error) {
    logger.warn('Failed to load session memory', {
      chatId: params.chatId,
      error: getErrorMessage(error),
    })
    return null
  }

  const uncovered = selectUncoveredTurnsForSummary({
    turns: params.turns,
    previous,
  })

  if (
    !shouldRefreshSessionMemory({
      historyMessages: params.historyMessages,
      previous,
      uncoveredTurns: uncovered,
    })
  ) {
    return previous
  }

  const coveredThroughMessageId = uncovered[uncovered.length - 1]?.messageId
  if (!coveredThroughMessageId) return previous

  try {
    const updated = await summarize({
      previous,
      uncoveredTurns: uncovered,
      coveredThroughMessageId,
      signal: params.signal,
      config: params.deps?.config,
      provider: params.deps?.provider,
      model: params.deps?.model,
    })

    if (!updated) return previous

    await persist(params.chatId, params.userId, updated)
    logger.info('Session memory refreshed', {
      chatId: params.chatId,
      uncoveredTurns: uncovered.length,
      coveredThroughMessageId,
    })
    return updated
  } catch (error) {
    logger.warn('Session memory refresh failed; keeping previous', {
      chatId: params.chatId,
      error: getErrorMessage(error),
    })
    return previous
  }
}

/**
 * Calls the engagement-model provider to merge session memory. Soft timeout.
 */
export async function summarizeSessionMemory(params: {
  previous: SessionMemory | null
  uncoveredTurns: SessionMemoryTurn[]
  coveredThroughMessageId: string
  signal?: AbortSignal
  config?: LocalCopilotConfig
  provider?: LocalCopilotProvider
  model?: string
}): Promise<SessionMemory | null> {
  if (params.uncoveredTurns.length === 0) return params.previous

  const config = params.config ?? getLocalCopilotConfig()
  const model = params.model ?? resolveEngagementModel(config.provider)
  const provider = params.provider ?? resolveEngagementProvider(model, config)

  const timeout = new AbortController()
  const onAbort = () => timeout.abort()
  params.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const userPayload = {
      previousMemory: params.previous
        ? {
            goals: params.previous.goals,
            decisions: params.previous.decisions,
            entities: params.previous.entities,
            progress: params.previous.progress,
            openQuestions: params.previous.openQuestions,
            notes: params.previous.notes,
          }
        : null,
      newTurns: params.uncoveredTurns.map((turn) => ({
        role: turn.role,
        text: truncate(turn.text.replace(/\s+/g, ' ').trim(), 600),
      })),
    }

    const completion = collectCompletionText({
      provider,
      model,
      messages: [
        { role: 'system', content: SUMMARIZER_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      temperature: 0.2,
      maxTokens: SESSION_MEMORY_MAX_TOKENS,
      signal: timeout.signal,
    })

    const raced = await Promise.race([
      completion.then((text) => ({ ok: true as const, text })),
      sleep(SESSION_MEMORY_TIMEOUT_MS).then(() => ({ ok: false as const })),
    ])

    timeout.abort()

    if (!raced.ok) {
      logger.info('Session memory summarizer timed out', { model })
      return null
    }

    const parsed = parseSummarizerSessionMemory(
      raced.text,
      params.previous,
      params.coveredThroughMessageId
    )
    if (!parsed) {
      logger.info('Session memory summarizer returned invalid JSON', {
        model,
        preview: raced.text.slice(0, 160),
      })
      return null
    }

    return parsed
  } finally {
    params.signal?.removeEventListener('abort', onAbort)
  }
}

function turnsAfterMessageId(
  turns: SessionMemoryTurn[],
  coveredThroughMessageId: string
): SessionMemoryTurn[] {
  const index = turns.findIndex((turn) => turn.messageId === coveredThroughMessageId)
  if (index < 0) return turns
  return turns.slice(index + 1)
}

function toStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return [...fallback]
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length > 0 ? items : [...fallback]
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    const inner = fenced[1].trim()
    if (inner.startsWith('{') && inner.endsWith('}')) return inner
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return null
}
