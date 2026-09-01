import { generateId } from '@sim/utils/id'
import {
  isChatInputPrefixName,
  isReservedStartInputName,
} from '@/lib/arena-generative-ui/input-schema'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'
import { START_BLOCK_RESERVED_FIELDS } from '@/lib/workflows/types'

export const ARENA_GENERATIVE_CHAT_CONVERSATION_KEY = 'conversationId'

export const ARENA_GENERATIVE_ACTION_SURFACES = ['form', 'chat'] as const

export type ArenaGenerativeActionSurface = (typeof ARENA_GENERATIVE_ACTION_SURFACES)[number]

export interface ArenaGenerativeChatProtocol {
  input?: boolean
  conversationId?: boolean
  files?: boolean
}

const CHAT_PROTOCOL_KEYS = ['input', 'conversationId', 'files'] as const

const CONVERSATION_STORAGE_PREFIX = 'arena-gui-conversation:'

/**
 * Reserved Start names present on a workflow's inputFormat. HTTP/curl never
 * sets this — a JSON key named `input` stays a normal form field.
 */
export function chatProtocolFromWorkflowFields(
  fields: Array<{ name?: string }> | undefined
): ArenaGenerativeChatProtocol | undefined {
  if (!fields || fields.length === 0) return undefined
  const protocol: ArenaGenerativeChatProtocol = {}
  for (const field of fields) {
    const name = field.name?.trim().toLowerCase()
    if (name === 'input') protocol.input = true
    if (name === 'conversationid') protocol.conversationId = true
    if (name === 'files') protocol.files = true
  }
  if (protocol.input) protocol.conversationId = true
  return Object.keys(protocol).length > 0 ? protocol : undefined
}

/**
 * Allowlisted `chatProtocol` from stored binding JSON. Unknown keys dropped.
 */
export function parseChatProtocol(raw: unknown): ArenaGenerativeChatProtocol | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const protocol: ArenaGenerativeChatProtocol = {}
  for (const key of CHAT_PROTOCOL_KEYS) {
    if (record[key] === true) protocol[key] = true
  }
  if (protocol.input) protocol.conversationId = true
  return Object.keys(protocol).length > 0 ? protocol : undefined
}

export function hasChatProtocolInput(protocol: ArenaGenerativeChatProtocol | undefined): boolean {
  return protocol?.input === true
}

/**
 * Form and Chat both stamp a thread id when the binding collects `input`.
 */
export function chatProtocolWantsConversationId(
  protocol: ArenaGenerativeChatProtocol | undefined
): boolean {
  return protocol?.input === true || protocol?.conversationId === true
}

/**
 * Form collect / query must never forward reserved Start names.
 */
export function omitReservedStartInputValues(
  values: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (isReservedStartInputName(key)) continue
    next[key] = value
  }
  return next
}

/**
 * First form CTA: optional Add-an-API prefix plus `name: value` for each
 * filled declared field. Chat later uses the composer text as-is.
 */
export function composeFormChatInput(
  values: Record<string, unknown>,
  binding: Pick<ArenaGenerativeApiBinding, 'inputSchema'>
): string | undefined {
  const prefixField = binding.inputSchema?.find((field) => isChatInputPrefixName(field.name))
  const prefix = typeof prefixField?.value === 'string' ? prefixField.value : ''
  const parts: string[] = []
  for (const field of binding.inputSchema ?? []) {
    const name = field.name.trim()
    if (!name || isReservedStartInputName(name)) continue
    const raw = values[name]
    if (raw === undefined || raw === null) continue
    const text = typeof raw === 'string' ? raw.trim() : String(raw)
    if (!text) continue
    parts.push(`${name}: ${text}`)
  }
  if (!prefix && parts.length === 0) return undefined
  if (!prefix) return parts.join(' ')
  if (parts.length === 0) return prefix
  const joiner = /\s$/.test(prefix) ? '' : ' '
  return `${prefix}${joiner}${parts.join(' ')}`
}

/**
 * Form / omitted + chatProtocol.input composes `input` and keeps a host
 * `conversationId`. Chat keeps composer `input` and does not re-compose.
 * `files` stay Chat-only.
 */
export function applyChatProtocolToActionValues(
  values: Record<string, unknown>,
  binding: Pick<ArenaGenerativeApiBinding, 'chatProtocol' | 'inputSchema'>,
  surface?: ArenaGenerativeActionSurface
): Record<string, unknown> {
  const protocol = binding.chatProtocol
  if (!hasChatProtocolInput(protocol)) {
    return omitReservedStartInputValues(values)
  }

  const next = omitReservedStartInputValues(values)
  if (surface === 'chat') {
    if (values.input !== undefined) {
      next.input = values.input
    }
  } else {
    const composed = composeFormChatInput(values, binding)
    if (composed !== undefined) {
      next.input = composed
    }
  }
  const conversationId = conversationIdFrom(values)
  if (conversationId) {
    next.conversationId = conversationId
  }
  if (surface === 'chat' && protocol?.files && values.files !== undefined) {
    next.files = values.files
  }
  return next
}

export function conversationIdFrom(values: Record<string, unknown>): string | undefined {
  const raw = values[ARENA_GENERATIVE_CHAT_CONVERSATION_KEY]
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed || undefined
}

export function chatProtocolReservedKeys(
  protocol: ArenaGenerativeChatProtocol | undefined
): string[] {
  if (!protocol) return []
  return START_BLOCK_RESERVED_FIELDS.filter((name) => {
    if (name === 'input') return protocol.input === true
    if (name === 'conversationId') {
      return protocol.conversationId === true || protocol.input === true
    }
    if (name === 'files') return protocol.files === true
    return false
  })
}

/**
 * Per-app thread id, same lifecycle as canvas chat: create once, persist until
 * storage is cleared. SSR / tests get a fresh id and do not persist.
 */
export function getGenerativeAppConversationId(appKey: string): string {
  const storageKey = `${CONVERSATION_STORAGE_PREFIX}${appKey.trim()}`
  if (typeof window === 'undefined' || !appKey.trim()) {
    return generateId()
  }
  try {
    const existing = window.localStorage.getItem(storageKey)?.trim()
    if (existing) return existing
    const id = generateId()
    window.localStorage.setItem(storageKey, id)
    return id
  } catch {
    return generateId()
  }
}

/**
 * Declared form snapshot (`state.inputs`) plus the chat composer. Reserved
 * names in `inputs` are dropped so a prior Chat submit cannot restamp them.
 */
export function chatActionValues(options: {
  hostInputs: unknown
  input: string
  files?: unknown
  conversationId?: string
  protocol?: ArenaGenerativeChatProtocol
}): Record<string, unknown> {
  const declared =
    options.hostInputs &&
    typeof options.hostInputs === 'object' &&
    !Array.isArray(options.hostInputs)
      ? omitReservedStartInputValues(options.hostInputs as Record<string, unknown>)
      : {}
  const next: Record<string, unknown> = { ...declared, input: options.input }
  if (options.protocol?.files && options.files !== undefined) {
    next.files = options.files
  }
  if (chatProtocolWantsConversationId(options.protocol) && options.conversationId) {
    next.conversationId = options.conversationId
  }
  return next
}
