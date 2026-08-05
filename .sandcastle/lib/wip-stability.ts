import { createHash } from 'node:crypto'

/**
 * Grill-answer keys that gate WIP overlay reuse.
 * Operational `/upstream-sync resume` comments are ignored unless they still
 * name a grill question (`Q1`, …).
 */
export function wipGrillAnswerKeys(
  entries: ReadonlyArray<{ id: string; answer?: string; source?: string }>
): string[] {
  const keys: string[] = []
  for (const entry of entries) {
    const answer = entry.answer?.trim()
    if (!answer) continue
    if (entry.source === 'resume') {
      const body = answer.replace(/\/upstream-sync\s+resume/gi, '').trim()
      if (!body || !/\bQ\d+\b/i.test(body)) continue
      keys.push(`resume:${body}`)
      continue
    }
    keys.push(entry.id)
  }
  return [...new Set(keys)]
}

/**
 * Overlay validity for a run: grill answers + merge-policy only.
 * Finalize directives must not participate — they change between draft and
 * locked plan on the same run and would skip a still-valid WIP overlay.
 */
export function computeWipStabilityHash(input: {
  grillAnswerIds: readonly string[]
  mergePolicyContents: string
}): string {
  const payload = {
    grillAnswerIds: [...input.grillAnswerIds]
      .map((id) => id.trim())
      .filter(Boolean)
      .sort(),
    mergePolicyContents: input.mergePolicyContents,
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export function parseQaHistoryJsonl(raw: string): Array<{
  id: string
  answer?: string
  source?: string
}> {
  const entries: Array<{ id: string; answer?: string; source?: string }> = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as { id?: unknown; answer?: unknown; source?: unknown }
      if (typeof parsed.id !== 'string') continue
      entries.push({
        id: parsed.id,
        answer: typeof parsed.answer === 'string' ? parsed.answer : undefined,
        source: typeof parsed.source === 'string' ? parsed.source : undefined,
      })
    } catch {
      // skip malformed lines
    }
  }
  return entries
}
