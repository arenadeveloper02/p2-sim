export const SHARE_RESULTS = [
  'created',
  'updated',
  'skipped_edited',
  'skipped_name_clash',
  'skipped_source',
  'error',
] as const

export type ShareResultStatus = (typeof SHARE_RESULTS)[number]

export type ShareDecision = 'create' | 'update' | 'skip_edited' | 'skip_name_clash' | 'skip_source'

export interface ShareDecisionInput {
  isSourceWorkspace: boolean
  copyExists: boolean
  copyUnedited: boolean
  nameClash: boolean
  overwriteEdited?: boolean
}

/**
 * Pure share rule: create when absent, overwrite when the copy still matches
 * the last synced hash, skip locally edited copies unless overwrite is on,
 * skip independent same-name skills, never write the origin workspace.
 */
export function decideShareAction(input: ShareDecisionInput): ShareDecision {
  if (input.isSourceWorkspace) return 'skip_source'
  if (input.copyExists) {
    if (input.copyUnedited || input.overwriteEdited) return 'update'
    return 'skip_edited'
  }
  if (input.nameClash) return 'skip_name_clash'
  return 'create'
}

export function shareDecisionToResult(decision: ShareDecision): ShareResultStatus {
  switch (decision) {
    case 'create':
      return 'created'
    case 'update':
      return 'updated'
    case 'skip_edited':
      return 'skipped_edited'
    case 'skip_name_clash':
      return 'skipped_name_clash'
    case 'skip_source':
      return 'skipped_source'
  }
}
