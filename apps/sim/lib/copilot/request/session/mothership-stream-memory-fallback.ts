import { createLogger } from '@sim/logger'
import type { PersistedStreamEventEnvelope } from './contract'
import { parsePersistedStreamEventEnvelopeJson } from './contract'

const logger = createLogger('MothershipStreamMemoryFallback')

let loggedFallback = false

/**
 * Logs once when Redis is unavailable so mothership stream/preview use process-local memory.
 * Suitable for local development only; production should set `REDIS_URL`.
 */
export function logMothershipMemoryFallbackOnce(): void {
  if (loggedFallback) return
  loggedFallback = true
  logger.info(
    'Redis unavailable: mothership stream buffer and file preview use in-memory fallback (not durable across restarts)'
  )
}

type StreamBufferState = {
  /** Mirrors Redis `seq` key: last value from incr or appendEvents */
  seqValue: number
  eventsBySeq: Map<number, string>
  abortMarker: boolean
}

const streamBuffers = new Map<string, StreamBufferState>()

function getOrCreateBuffer(streamId: string): StreamBufferState {
  let s = streamBuffers.get(streamId)
  if (!s) {
    s = { seqValue: 0, eventsBySeq: new Map(), abortMarker: false }
    streamBuffers.set(streamId, s)
  }
  return s
}

export function memoryClearStreamBuffer(streamId: string): void {
  streamBuffers.delete(streamId)
}

export function memoryAllocateCursor(streamId: string): { seq: number; cursor: string } {
  const s = getOrCreateBuffer(streamId)
  s.seqValue += 1
  const seq = s.seqValue
  return { seq, cursor: String(seq) }
}

export function memoryAppendEvents(streamId: string, envelopes: PersistedStreamEventEnvelope[]): void {
  if (envelopes.length === 0) return
  const s = getOrCreateBuffer(streamId)
  for (const e of envelopes) {
    s.eventsBySeq.set(e.seq, JSON.stringify(e))
  }
  s.seqValue = envelopes[envelopes.length - 1].seq
}

export function memoryReadEvents(
  streamId: string,
  afterSeqExclusive: number
): PersistedStreamEventEnvelope[] {
  const s = streamBuffers.get(streamId)
  if (!s) return []
  const minScore = afterSeqExclusive + 1
  const out: PersistedStreamEventEnvelope[] = []
  const keys = [...s.eventsBySeq.keys()].filter((k) => k >= minScore).sort((a, b) => a - b)
  for (const k of keys) {
    const raw = s.eventsBySeq.get(k)
    if (!raw) continue
    const parsed = parsePersistedStreamEventEnvelopeJson(raw)
    if (!parsed.ok) {
      logger.warn('Skipping corrupt in-memory outbox entry', {
        streamId,
        reason: parsed.reason,
      })
      continue
    }
    out.push(parsed.event)
  }
  return out
}

export function memoryGetOldestSeq(streamId: string): number | null {
  const s = streamBuffers.get(streamId)
  if (!s || s.eventsBySeq.size === 0) return null
  return Math.min(...s.eventsBySeq.keys())
}

export function memoryGetLatestSeq(streamId: string): number | null {
  const s = streamBuffers.get(streamId)
  if (!s || s.seqValue <= 0) return null
  return s.seqValue
}

export function memoryWriteAbortMarker(streamId: string): void {
  getOrCreateBuffer(streamId).abortMarker = true
}

export function memoryHasAbortMarker(streamId: string): boolean {
  return streamBuffers.get(streamId)?.abortMarker ?? false
}

export function memoryClearAbortMarker(streamId: string): void {
  const s = streamBuffers.get(streamId)
  if (s) s.abortMarker = false
}

const previewSessionsByStream = new Map<string, Map<string, string>>()

export function memoryClearFilePreviewSessions(streamId: string): void {
  previewSessionsByStream.delete(streamId)
}

export function memoryUpsertFilePreviewSession(streamId: string, sessionId: string, json: string): void {
  let m = previewSessionsByStream.get(streamId)
  if (!m) {
    m = new Map()
    previewSessionsByStream.set(streamId, m)
  }
  m.set(sessionId, json)
}

export function memoryHgetallFilePreviewSessions(streamId: string): Record<string, string> {
  const m = previewSessionsByStream.get(streamId)
  if (!m) return {}
  return Object.fromEntries(m)
}
