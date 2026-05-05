/**
 * Prepares a user-provided post identifier for Unipile `{post_id}` URL path segments.
 *
 * @remarks
 * LinkedIn **list comments / reactions / comment** expect `social_id` from GET post / list posts
 * (often `urn:li:activity:…`), not the bare numeric id from the URL alone — that id is accepted for
 * **retrieve post**, but follow-on routes can return `invalid post_id` without the URN. This helper
 * strips paste artifacts, extracts URNs, maps LinkedIn URL slugs (`-activity-`, `-ugcPost-`,
 * `-share-`), and coerces bare long numeric ids to `urn:li:activity:…` (typical activity `social_id`).
 * For **Instagram** list comments, Unipile expects `provider_id`; if yours is numeric-only and not
 * a LinkedIn activity id, pass a value that includes `instagram.com` context or the exact id Unipile
 * returns from list posts. See
 * [Posts and comments](https://developer.unipile.com/docs/posts-and-comments).
 */
export function normalizeUnipilePostPathId(raw: string): string {
  let s = raw
    .replace(/\u200b/g, '')
    .replace(/\u200c/g, '')
    .replace(/\u200d/g, '')
    .replace(/\ufeff/g, '')
    .trim()
  if (s.length >= 2) {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1).trim()
    }
  }
  if (/%[0-9A-Fa-f]{2}/.test(s)) {
    try {
      s = decodeURIComponent(s).trim()
    } catch {
      /* keep s */
    }
  }

  const urnUgc = s.match(/urn:li:ugcPost:[^\s?#/]+/i)
  if (urnUgc) {
    return urnUgc[0]!
  }
  const urnShare = s.match(/urn:li:share:[^\s?#/]+/i)
  if (urnShare) {
    return urnShare[0]!
  }
  const urnActivity = s.match(/urn:li:activity:[^\s?#/]+/i)
  if (urnActivity) {
    return urnActivity[0]!
  }

  const slugUgc = s.match(/-ugcPost-(\d{10,})/i)
  if (slugUgc) {
    return `urn:li:ugcPost:${slugUgc[1]}`
  }
  const slugShare = s.match(/-share-(\d{10,})/i)
  if (slugShare) {
    return `urn:li:share:${slugShare[1]}`
  }
  const slugActivity = s.match(/-activity-(\d{10,})/i)
  if (slugActivity) {
    return `urn:li:activity:${slugActivity[1]}`
  }

  const activity = s.match(/activity[-_:](\d{10,})/i)
  if (activity) {
    return `urn:li:activity:${activity[1]}`
  }

  if (/^\d{10,}$/.test(s)) {
    return `urn:li:activity:${s}`
  }

  return s
}
