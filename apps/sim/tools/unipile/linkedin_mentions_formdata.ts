import { z } from 'zod'

const mentionEntrySchema = z.object({
  name: z.string().min(1),
  profile_id: z.string().min(1),
  is_company: z.boolean().optional(),
})

export type UnipileLinkedinMentionEntry = z.infer<typeof mentionEntrySchema>

/** Payload shape Unipile expects for each LinkedIn mention (see PostsController_sendComment). */
export type UnipileMentionApiJson = {
  name: string
  profile_id: string
  is_company?: boolean
}

export type ParseLinkedinMentionsResult =
  | { ok: true; entries: UnipileLinkedinMentionEntry[] }
  | { ok: false; error: string }

/**
 * Parses and validates a JSON array string for LinkedIn @mentions (Unipile comment/create post).
 */
export function parseLinkedinMentionsJson(json: string): ParseLinkedinMentionsResult {
  const trimmed = json.trim()
  if (trimmed === '') {
    return { ok: false, error: 'mentions is empty' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed) as unknown
  } catch {
    return { ok: false, error: 'mentions must be valid JSON' }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { ok: false, error: 'mentions must be a non-empty JSON array' }
  }
  const entries: UnipileLinkedinMentionEntry[] = []
  for (const entry of parsed) {
    const r = mentionEntrySchema.safeParse(entry)
    if (!r.success) {
      return {
        ok: false,
        error: 'Each mentions[] entry needs name and profile_id (optional is_company boolean)',
      }
    }
    entries.push(r.data)
  }
  return { ok: true, entries }
}

/**
 * Maps validated mention rows to the JSON objects Unipile documents (`name`, `profile_id`,
 * optional `is_company` only when tagging a company).
 *
 * @see https://developer.unipile.com/reference/postscontroller_sendcomment
 */
export function mentionsToUnipileApiJson(
  entries: UnipileLinkedinMentionEntry[]
): UnipileMentionApiJson[] {
  return entries.map((m) => {
    const o: UnipileMentionApiJson = { name: m.name, profile_id: m.profile_id }
    if (m.is_company === true) {
      o.is_company = true
    }
    return o
  })
}

/**
 * Appends a single multipart field `mentions` whose body is JSON with `Content-Type:
 * application/json`, so parsers treat it as an array (not a quoted string). Use when the
 * request must stay `multipart/form-data` (e.g. file attachments).
 */
export function appendUnipileLinkedinMentionsMultipartPart(
  form: FormData,
  entries: UnipileLinkedinMentionEntry[]
): void {
  if (entries.length === 0) {
    return
  }
  const json = JSON.stringify(mentionsToUnipileApiJson(entries))
  form.append('mentions', new Blob([json], { type: 'application/json' }))
}
