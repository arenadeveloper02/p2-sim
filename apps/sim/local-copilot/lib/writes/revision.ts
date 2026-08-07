export interface RevisionCheckOk {
  ok: true
}

export interface RevisionCheckDenied {
  ok: false
  error: string
}

/**
 * Converts a workflow updatedAt timestamp into a CAS revision token.
 */
export function revisionFromDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString()
}

/**
 * Compare-and-swap check for workflow writes.
 */
export function assertExpectedRevision(params: {
  expectedRevision?: string
  currentRevision?: string
  requireExpected?: boolean
}): RevisionCheckOk | RevisionCheckDenied {
  const expected = params.expectedRevision?.trim()
  const current = params.currentRevision?.trim()

  if (!expected) {
    if (params.requireExpected && current) {
      return { ok: false, error: 'expectedRevision is required for this write.' }
    }
    return { ok: true }
  }

  if (!current) {
    return {
      ok: false,
      error:
        'Workflow changed since this turn loaded it (stale revision). Re-read the workflow and retry.',
    }
  }

  if (expected !== current) {
    return {
      ok: false,
      error:
        'Workflow changed since this turn loaded it (stale revision). Re-read the workflow and retry.',
    }
  }

  return { ok: true }
}
