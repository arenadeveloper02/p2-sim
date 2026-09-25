import { generateShortId } from '@sim/utils/id'
import { truncate } from '@sim/utils/string'
import {
  loadCopilotChatConfig,
  mergeCopilotChatConfig,
} from '@/local-copilot/lib/context/chat-config'

/** Inline tool-result size before offloading to an artifact. */
export const ARTIFACT_INLINE_MAX_CHARS = 8_000

/**
 * Hard cap when `load_copilot_artifact` rehydrates a body into the model
 * transcript. Full HTML dashboards often exceed this; dumping them back into
 * Claude + thinking stalls the next round on empty "Thinking…".
 */
export const ARTIFACT_LOAD_MAX_CHARS = 24_000

export const ARTIFACT_MAX_COUNT = 20
export const ARTIFACT_MAX_TOTAL_BYTES = 500_000

export const LOAD_COPILOT_ARTIFACT_TOOL_NAME = 'load_copilot_artifact'

const ARTIFACT_LOAD_TRUNCATION_HINT =
  '\n…[truncated: artifact exceeds model budget — use grep/read with a narrower path or offset instead of reloading the full body]'

/**
 * Caps an artifact body for model consumption so huge file reads cannot
 * stall the next Claude thinking round.
 */
export function truncateArtifactBodyForModel(body: unknown): unknown {
  if (typeof body === 'string') {
    if (body.length <= ARTIFACT_LOAD_MAX_CHARS) return body
    return truncate(body, ARTIFACT_LOAD_MAX_CHARS, ARTIFACT_LOAD_TRUNCATION_HINT)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const serialized = serializeForSize(body)
    if (serialized.length <= ARTIFACT_LOAD_MAX_CHARS) return body
    return {
      truncated: true,
      preview: truncate(serialized, ARTIFACT_LOAD_MAX_CHARS, ARTIFACT_LOAD_TRUNCATION_HINT),
      hint: 'Use grep/read with a narrower range instead of loading the full artifact.',
    }
  }

  const record = { ...(body as Record<string, unknown>) }
  for (const key of ['content', 'text', 'body', 'data', 'result'] as const) {
    const value = record[key]
    if (typeof value === 'string' && value.length > ARTIFACT_LOAD_MAX_CHARS) {
      record[key] = truncate(value, ARTIFACT_LOAD_MAX_CHARS, ARTIFACT_LOAD_TRUNCATION_HINT)
      record.truncated = true
      record.truncationHint =
        'Artifact body truncated for the model. Prefer grep/read with a narrower range.'
      return record
    }
  }

  const serialized = serializeForSize(record)
  if (serialized.length <= ARTIFACT_LOAD_MAX_CHARS) return record
  return {
    truncated: true,
    preview: truncate(serialized, ARTIFACT_LOAD_MAX_CHARS, ARTIFACT_LOAD_TRUNCATION_HINT),
    hint: 'Use grep/read with a narrower range instead of loading the full artifact.',
  }
}

function serializeForSize(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '{"error":"unserializable"}'
  }
}

export interface CopilotArtifact {
  id: string
  toolName: string
  createdAt: string
  summary: string
  bytes: number
  body: unknown
}

export interface ArtifactStub {
  artifactId: string
  toolName: string
  summary: string
  bytes: number
  truncated: true
  hint: string
}

export interface ArtifactStore {
  artifacts: Map<string, CopilotArtifact>
}

/**
 * Creates an empty in-memory artifact store for a turn.
 */
export function createArtifactStore(): ArtifactStore {
  return { artifacts: new Map() }
}

/**
 * Builds a short summary for an offloaded tool result.
 */
export function summarizeArtifactBody(toolName: string, body: unknown): string {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  const candidates = [record?.summary, record?.message, record?.content, record?.error]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return truncate(candidate.trim(), 180, '…')
    }
  }
  return truncate(`${toolName} result`, 180, '…')
}

/**
 * Parses a single artifact from chat config.
 */
export function parseArtifactRecord(value: unknown): CopilotArtifact | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || !record.id.trim()) return null
  if (typeof record.toolName !== 'string' || !record.toolName.trim()) return null
  if (typeof record.createdAt !== 'string' || !record.createdAt.trim()) return null
  if (typeof record.summary !== 'string') return null
  if (typeof record.bytes !== 'number' || !Number.isFinite(record.bytes)) return null
  return {
    id: record.id.trim(),
    toolName: record.toolName.trim(),
    createdAt: record.createdAt.trim(),
    summary: truncate(record.summary, 180, '…'),
    bytes: Math.max(0, Math.floor(record.bytes)),
    body: record.body,
  }
}

/**
 * Loads one artifact from a persisted record map.
 */
export function loadArtifactFromRecord(
  record: Record<string, unknown> | null | undefined,
  artifactId: string
): CopilotArtifact | null {
  if (!record || !artifactId.trim()) return null
  return parseArtifactRecord(record[artifactId.trim()])
}

/**
 * Evicts oldest artifacts until count/byte caps are satisfied.
 */
export function evictArtifactsToCaps(
  artifacts: Map<string, CopilotArtifact>,
  caps: { maxCount?: number; maxTotalBytes?: number } = {}
): Map<string, CopilotArtifact> {
  const maxCount = caps.maxCount ?? ARTIFACT_MAX_COUNT
  const maxTotalBytes = caps.maxTotalBytes ?? ARTIFACT_MAX_TOTAL_BYTES
  const ordered = [...artifacts.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  while (ordered.length > maxCount) ordered.shift()
  let total = ordered.reduce((sum, item) => sum + item.bytes, 0)
  while (ordered.length > 0 && total > maxTotalBytes) {
    const removed = ordered.shift()
    if (removed) total -= removed.bytes
  }
  return new Map(ordered.map((item) => [item.id, item]))
}

/**
 * Offloads oversized tool results into the turn artifact store.
 */
export function maybeOffloadToolResult(
  toolName: string,
  body: unknown,
  store: ArtifactStore,
  maxInlineChars: number = ARTIFACT_INLINE_MAX_CHARS
): { offloaded: false; body: unknown } | { offloaded: true; stub: ArtifactStub } {
  const serialized = serializeForSize(body)
  if (serialized.length <= maxInlineChars) {
    return { offloaded: false, body }
  }

  const id = generateShortId(12)
  const summary = summarizeArtifactBody(toolName, body)
  const artifact: CopilotArtifact = {
    id,
    toolName,
    createdAt: new Date().toISOString(),
    summary,
    bytes: serialized.length,
    body,
  }
  store.artifacts.set(id, artifact)
  store.artifacts = evictArtifactsToCaps(store.artifacts)

  return {
    offloaded: true,
    stub: {
      artifactId: id,
      toolName,
      summary,
      bytes: serialized.length,
      truncated: true,
      hint: `Call ${LOAD_COPILOT_ARTIFACT_TOOL_NAME} with artifactId "${id}" to load the full result.`,
    },
  }
}

/**
 * Loads artifacts map from chat config.
 */
export async function loadArtifacts(
  chatId: string,
  userId: string
): Promise<Map<string, CopilotArtifact>> {
  const config = await loadCopilotChatConfig(chatId, userId)
  const raw = config?.artifacts
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return new Map()
  const next = new Map<string, CopilotArtifact>()
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = parseArtifactRecord(value)
    if (parsed) next.set(key, parsed)
  }
  return evictArtifactsToCaps(next)
}

/**
 * Persists artifacts into chat config (merged with existing, then capped).
 */
export async function persistArtifacts(
  chatId: string,
  userId: string,
  store: ArtifactStore
): Promise<void> {
  const existing = await loadArtifacts(chatId, userId)
  for (const [id, artifact] of store.artifacts) {
    existing.set(id, artifact)
  }
  const capped = evictArtifactsToCaps(existing)
  const record: Record<string, CopilotArtifact> = {}
  for (const [id, artifact] of capped) record[id] = artifact
  await mergeCopilotChatConfig(chatId, userId, { artifacts: record })
}
