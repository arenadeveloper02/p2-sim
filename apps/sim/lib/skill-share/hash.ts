import { createHash } from 'node:crypto'

export interface SkillSharePayload {
  name: string
  description: string
  content: string
}

/**
 * Stable fingerprint of a skill's shareable fields. Stored on `skill_share_copy`
 * at last successful share so a later local edit is detectable without changing
 * the `skill` table.
 */
export function skillShareContentHash(payload: SkillSharePayload): string {
  return createHash('sha256')
    .update(`${payload.name}\0${payload.description}\0${payload.content}`)
    .digest('hex')
}

export function skillSharePayloadUnchanged(
  current: SkillSharePayload,
  syncedContentHash: string
): boolean {
  return skillShareContentHash(current) === syncedContentHash
}
