import { createHash } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConflictCluster } from './clusters'
import {
  ensureLedgerRunDir,
  ledgerRunDir,
  MERGE_POLICY_PATH,
  readQaHistory,
  runGit,
} from './config'
import { wipGrillAnswerKeys } from './wip-stability'

export const MERGE_PLAN_DRAFT_FILENAME = 'merge-plan.draft.json'
export const MERGE_PLAN_FINAL_FILENAME = 'merge-plan.json'
export const MERGE_DIRECTIVES_FILENAME = 'merge-directives.json'

export type MergeSideStrategy = 'ours' | 'theirs' | 'union' | 'delete' | 'mustEdit'
export type ChildClusterStrategy = MergeSideStrategy | 'manual'

export interface MergeDirectives {
  delete: string[]
  checkoutTheirs: string[]
  checkoutOurs: string[]
  mustEdit: string[]
  overrideForkFirst: string[]
  notes: string
}

export interface SelfResolution {
  decision: string
  paths: string[]
  prefixes?: string[]
  strategy: MergeSideStrategy
  rationale: string
  cite?: string
}

export interface OpenQuestionRef {
  id: string
  question?: string
}

export interface PlannedChildCluster {
  id: string
  prefix: string
  files: string[]
  strategy: ChildClusterStrategy
  notes: string
}

export interface MergePlanDraft {
  version: 1
  runId: string
  kind: 'draft'
  selfResolutions: SelfResolution[]
  openQuestions: OpenQuestionRef[]
  childClusters: PlannedChildCluster[]
  proposedDirectives?: Record<string, MergeDirectives>
  notes?: string
}

export interface MergePlanFinal {
  version: 1
  runId: string
  kind: 'final'
  selfResolutions: SelfResolution[]
  openQuestions: OpenQuestionRef[]
  childClusters: PlannedChildCluster[]
  directives: MergeDirectives
  notes?: string
}

export interface ApplyMergeDirectivesResult {
  deleted: string[]
  checkoutTheirs: string[]
  checkoutOurs: string[]
  failed: Array<{ path: string; action: string; error: string }>
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

const MERGE_SIDE_STRATEGIES = new Set<MergeSideStrategy>([
  'ours',
  'theirs',
  'union',
  'delete',
  'mustEdit',
])

const CHILD_CLUSTER_STRATEGIES = new Set<ChildClusterStrategy>([
  'ours',
  'theirs',
  'union',
  'delete',
  'mustEdit',
  'manual',
])

/** True when `filePath` matches any prefix (same `startsWith` rule as merge-policy). */
export function pathMatchesPrefixes(
  filePath: string,
  prefixes: readonly string[] | undefined
): boolean {
  return Boolean(prefixes?.some((prefix) => filePath.startsWith(prefix)))
}

export function emptyMergeDirectives(): MergeDirectives {
  return {
    delete: [],
    checkoutTheirs: [],
    checkoutOurs: [],
    mustEdit: [],
    overrideForkFirst: [],
    notes: '',
  }
}

/**
 * Drop checkout/delete/mustEdit/override entries for paths that are no longer
 * unmerged. Prevents Phase B resume from overwriting child/WIP resolutions.
 */
export function restrictMergeDirectivesToUnmerged(
  directives: MergeDirectives,
  unmergedFiles: readonly string[]
): { directives: MergeDirectives; dropped: string[] } {
  const unmerged = new Set(unmergedFiles)
  const dropped: string[] = []

  const keep = (paths: readonly string[]): string[] =>
    paths.filter((path) => {
      if (unmerged.has(path)) return true
      dropped.push(path)
      return false
    })

  return {
    directives: {
      delete: keep(directives.delete),
      checkoutTheirs: keep(directives.checkoutTheirs),
      checkoutOurs: keep(directives.checkoutOurs),
      mustEdit: keep(directives.mustEdit),
      overrideForkFirst: keep(directives.overrideForkFirst),
      notes: directives.notes,
    },
    dropped: [...new Set(dropped)].sort(),
  }
}

export function mergePlanDraftPath(runId: string): string {
  return join(ledgerRunDir(runId), MERGE_PLAN_DRAFT_FILENAME)
}

export function mergePlanFinalPath(runId: string): string {
  return join(ledgerRunDir(runId), MERGE_PLAN_FINAL_FILENAME)
}

export function mergeDirectivesPath(runId: string): string {
  return join(ledgerRunDir(runId), MERGE_DIRECTIVES_FILENAME)
}

export function validateMergeDirectives(value: unknown): ParseResult<MergeDirectives> {
  if (!isRecord(value)) return fail('directives must be an object')
  const deletePaths = parseStringArray(value.delete, 'delete')
  if (!deletePaths.ok) return deletePaths
  const checkoutTheirs = parseStringArray(value.checkoutTheirs, 'checkoutTheirs')
  if (!checkoutTheirs.ok) return checkoutTheirs
  const checkoutOurs = parseStringArray(value.checkoutOurs, 'checkoutOurs')
  if (!checkoutOurs.ok) return checkoutOurs
  const mustEdit = parseStringArray(value.mustEdit, 'mustEdit')
  if (!mustEdit.ok) return mustEdit
  const overrideForkFirst = parseStringArray(value.overrideForkFirst, 'overrideForkFirst')
  if (!overrideForkFirst.ok) return overrideForkFirst
  if (value.notes !== undefined && typeof value.notes !== 'string') {
    return fail('directives.notes must be a string')
  }
  return {
    ok: true,
    value: {
      delete: deletePaths.value,
      checkoutTheirs: checkoutTheirs.value,
      checkoutOurs: checkoutOurs.value,
      mustEdit: mustEdit.value,
      overrideForkFirst: overrideForkFirst.value,
      notes: value.notes ?? '',
    },
  }
}

export function parseMergeDirectives(value: unknown): MergeDirectives {
  return unwrap(validateMergeDirectives(value), 'Invalid merge directives')
}

export function validateMergePlanDraft(value: unknown): ParseResult<MergePlanDraft> {
  if (!isRecord(value)) return fail('draft plan must be an object')
  if (value.version !== 1) return fail('draft plan.version must be 1')
  if (typeof value.runId !== 'string' || value.runId.trim() === '') {
    return fail('draft plan.runId must be a non-empty string')
  }
  if (value.kind !== 'draft') return fail('draft plan.kind must be "draft"')

  const selfResolutions = parseSelfResolutions(value.selfResolutions)
  if (!selfResolutions.ok) return selfResolutions
  const openQuestions = parseOpenQuestionRefs(value.openQuestions)
  if (!openQuestions.ok) return openQuestions
  const childClusters = parseChildClusters(value.childClusters, { allowEmptyFiles: true })
  if (!childClusters.ok) return childClusters

  let proposedDirectives: Record<string, MergeDirectives> | undefined
  if (value.proposedDirectives !== undefined) {
    if (!isRecord(value.proposedDirectives)) {
      return fail('draft plan.proposedDirectives must be an object')
    }
    proposedDirectives = {}
    for (const [key, entry] of Object.entries(value.proposedDirectives)) {
      if (key.trim() === '') return fail('proposedDirectives keys must be non-empty')
      const parsed = validateMergeDirectives(entry)
      if (!parsed.ok) return fail(`proposedDirectives.${key}: ${parsed.error}`)
      proposedDirectives[key] = parsed.value
    }
  }

  if (value.notes !== undefined && typeof value.notes !== 'string') {
    return fail('draft plan.notes must be a string')
  }

  return {
    ok: true,
    value: {
      version: 1,
      runId: value.runId,
      kind: 'draft',
      selfResolutions: selfResolutions.value,
      openQuestions: openQuestions.value,
      childClusters: childClusters.value,
      proposedDirectives,
      notes: value.notes,
    },
  }
}

export function parseMergePlanDraft(value: unknown): MergePlanDraft {
  return unwrap(validateMergePlanDraft(value), 'Invalid merge-plan draft')
}

export function validateMergePlanFinal(value: unknown): ParseResult<MergePlanFinal> {
  if (!isRecord(value)) return fail('final plan must be an object')
  if (value.version !== 1) return fail('final plan.version must be 1')
  if (typeof value.runId !== 'string' || value.runId.trim() === '') {
    return fail('final plan.runId must be a non-empty string')
  }
  if (value.kind !== 'final') return fail('final plan.kind must be "final"')

  const selfResolutions = parseSelfResolutions(value.selfResolutions)
  if (!selfResolutions.ok) return selfResolutions
  const openQuestions = parseOpenQuestionRefs(value.openQuestions)
  if (!openQuestions.ok) return openQuestions
  const childClusters = parseChildClusters(value.childClusters, { allowEmptyFiles: true })
  if (!childClusters.ok) return childClusters
  const directives = validateMergeDirectives(value.directives)
  if (!directives.ok) return fail(`final plan.directives: ${directives.error}`)
  if (value.notes !== undefined && typeof value.notes !== 'string') {
    return fail('final plan.notes must be a string')
  }

  return {
    ok: true,
    value: {
      version: 1,
      runId: value.runId,
      kind: 'final',
      selfResolutions: selfResolutions.value,
      openQuestions: openQuestions.value,
      childClusters: childClusters.value,
      directives: directives.value,
      notes: value.notes,
    },
  }
}

export function parseMergePlanFinal(value: unknown): MergePlanFinal {
  return unwrap(validateMergePlanFinal(value), 'Invalid merge-plan final')
}

export function writeMergePlanDraft(runId: string, plan: MergePlanDraft): string {
  const parsed = parseMergePlanDraft({ ...plan, runId, kind: 'draft' })
  const path = mergePlanDraftPath(runId)
  ensureLedgerRunDir(runId)
  writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`)
  return path
}

export function writeMergePlanFinal(runId: string, plan: MergePlanFinal): string {
  const parsed = parseMergePlanFinal({ ...plan, runId, kind: 'final' })
  ensureLedgerRunDir(runId)
  const path = mergePlanFinalPath(runId)
  writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`)
  writeMergeDirectives(runId, parsed.directives)
  return path
}

export function writeMergeDirectives(runId: string, directives: MergeDirectives): string {
  const parsed = parseMergeDirectives(directives)
  ensureLedgerRunDir(runId)
  const path = mergeDirectivesPath(runId)
  writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`)
  return path
}

export function readMergePlanDraft(runId: string): MergePlanDraft | null {
  return readJsonFile(mergePlanDraftPath(runId), validateMergePlanDraft)
}

export function readMergePlanFinal(runId: string): MergePlanFinal | null {
  return readJsonFile(mergePlanFinalPath(runId), validateMergePlanFinal)
}

export function readMergeDirectivesFile(runId: string): MergeDirectives | null {
  return readJsonFile(mergeDirectivesPath(runId), validateMergeDirectives)
}

/**
 * Locked directives for a run: embedded on the final plan, else sibling `merge-directives.json`.
 */
export function loadFinalDirectives(runId: string): MergeDirectives | null {
  const plan = readMergePlanFinal(runId)
  if (plan) return plan.directives
  return readMergeDirectivesFile(runId)
}

/**
 * Answered grill entry ids for WIP `decisionHash`.
 * Pass `entries` in tests to avoid reading `.upstream-sync/qa-history.jsonl`.
 *
 * Resume comments are control-plane (`/upstream-sync resume`). Including every
 * new comment id would invalidate WIP after a hung-child continue. Only count a
 * resume entry when it still names a grill question (`Q1`, `Q2`, …); use the
 * stripped answer text as a stable key so a later identical resume does not
 * churn the hash.
 */
export function collectGrillAnswerIds(
  entries?: ReadonlyArray<{ id: string; answer?: string; source?: string }>
): string[] {
  return wipGrillAnswerKeys(entries ?? readQaHistory())
}

/**
 * Directives used for WIP hashing before/after finalize.
 * Prefers locked final directives; otherwise a single draft proposed map; otherwise empty.
 */
export function resolveDirectivesForDecisionHash(runId: string): MergeDirectives {
  const final = loadFinalDirectives(runId)
  if (final) return final
  const draft = readMergePlanDraft(runId)
  const proposed = draft?.proposedDirectives
  if (!proposed) return emptyMergeDirectives()
  const keys = Object.keys(proposed).sort()
  if (keys.length === 1) return proposed[keys[0]]
  return emptyMergeDirectives()
}

/** Hash of current final-or-draft directives + grill answers + merge-policy. */
export function computeRunDecisionHash(
  runId: string,
  options?: { grillAnswerIds?: readonly string[]; mergePolicyPath?: string }
): string {
  return computeDecisionHashFromDisk({
    directives: resolveDirectivesForDecisionHash(runId),
    grillAnswerIds: options?.grillAnswerIds ?? collectGrillAnswerIds(),
    mergePolicyPath: options?.mergePolicyPath,
  })
}

/** Human-readable `## Parent plan` body from a draft or final merge plan. */
export function formatParentPlanSummary(plan: MergePlanDraft | MergePlanFinal): string {
  const selfLines =
    plan.selfResolutions.length > 0
      ? plan.selfResolutions.map((resolution) => {
          const targets =
            resolution.paths.join(', ') || resolution.prefixes?.join(', ') || '_no paths_'
          const cite = resolution.cite ? ` (${resolution.cite})` : ''
          return `- **${resolution.decision}** (\`${resolution.strategy}\`): ${targets} — ${resolution.rationale}${cite}`
        })
      : ['- _None_']

  const clusterLines =
    plan.childClusters.length > 0
      ? plan.childClusters.map((cluster) => {
          const files =
            cluster.files.length > 0
              ? cluster.files.map((file) => `\`${file}\``).join(', ')
              : 'area-level (files assigned after merge)'
          return `- **${cluster.id}** \`${cluster.prefix}\` (\`${cluster.strategy}\`): ${files} — ${cluster.notes || '_no notes_'}`
        })
      : ['- _None_']

  const lines = [
    '### Self-resolutions',
    '',
    ...selfLines,
    '',
    '### Child areas',
    '',
    ...clusterLines,
  ]
  if (plan.notes?.trim()) {
    lines.push('', plan.notes.trim())
  }
  return lines.join('\n')
}

/**
 * Instantiate leaf clusters from a finalized parent plan.
 * Returns `null` when the plan is missing or has no `childClusters` (caller should fall back).
 * Still-unmerged files not listed on any cluster are appended to `unplanned`.
 */
export function clustersFromMergePlan(
  plan: Pick<MergePlanFinal, 'childClusters'> | null | undefined,
  unmergedFiles: readonly string[]
): ConflictCluster[] | null {
  if (!plan || plan.childClusters.length === 0) return null

  const stillUnmerged = new Set(unmergedFiles)
  const assigned = new Set<string>()
  const roots: ConflictCluster[] = []

  for (const planned of plan.childClusters) {
    const files = planned.files.filter((file) => stillUnmerged.has(file))
    for (const file of files) assigned.add(file)
    if (files.length === 0) continue
    roots.push({
      id: planned.id,
      prefix: planned.prefix,
      files,
      depth: 0,
      parentId: null,
      children: [],
      strategy: planned.strategy,
      notes: planned.notes,
    })
  }

  const leftovers = unmergedFiles.filter((file) => stillUnmerged.has(file) && !assigned.has(file))
  if (leftovers.length > 0) {
    const existingUnplanned = roots.find((cluster) => cluster.id === 'unplanned')
    if (existingUnplanned) {
      existingUnplanned.files.push(...leftovers)
    } else {
      roots.push({
        id: 'unplanned',
        prefix: '(unplanned)',
        files: leftovers,
        depth: 0,
        parentId: null,
        children: [],
        strategy: 'manual',
        notes: 'Unassigned leftover conflicts after merge-plan assignment.',
      })
    }
  }

  return roots
}

/** JSON slice passed to a child agent for its planned cluster. */
export function formatMergePlanSlice(cluster: ConflictCluster): string {
  return JSON.stringify(
    {
      id: cluster.id,
      prefix: cluster.prefix,
      files: cluster.files,
      strategy: cluster.strategy ?? 'manual',
      notes: cluster.notes ?? '',
    },
    null,
    2
  )
}

/**
 * Hash of final directives + grill answer ids + merge-policy file contents.
 * Used as WIP `decisionHash` so stale overlays are skipped after new answers/policy.
 */
export function computeDecisionHash(input: {
  directives: MergeDirectives
  grillAnswerIds: readonly string[]
  mergePolicyContents: string
}): string {
  const payload = {
    directives: canonicalizeDirectives(input.directives),
    grillAnswerIds: [...input.grillAnswerIds]
      .map((id) => id.trim())
      .filter(Boolean)
      .sort(),
    mergePolicyContents: input.mergePolicyContents,
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export function readMergePolicyContents(path = MERGE_POLICY_PATH): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

export function computeDecisionHashFromDisk(input: {
  directives: MergeDirectives
  grillAnswerIds: readonly string[]
  mergePolicyPath?: string
}): string {
  return computeDecisionHash({
    directives: input.directives,
    grillAnswerIds: input.grillAnswerIds,
    mergePolicyContents: readMergePolicyContents(input.mergePolicyPath),
  })
}

/**
 * Apply locked merge directives: checkout ours/theirs, then delete, then `git add`.
 * `mustEdit` / `overrideForkFirst` are not git operations — callers skip auto-resolve for those paths.
 */
export function applyMergeDirectives(directives: MergeDirectives): ApplyMergeDirectivesResult {
  const parsed = parseMergeDirectives(directives)
  const result: ApplyMergeDirectivesResult = {
    deleted: [],
    checkoutTheirs: [],
    checkoutOurs: [],
    failed: [],
  }

  for (const filePath of parsed.checkoutOurs) {
    if (tryGitAction(filePath, 'checkoutOurs', () => checkoutSide(filePath, 'ours'), result)) {
      result.checkoutOurs.push(filePath)
    }
  }

  for (const filePath of parsed.checkoutTheirs) {
    if (tryGitAction(filePath, 'checkoutTheirs', () => checkoutSide(filePath, 'theirs'), result)) {
      result.checkoutTheirs.push(filePath)
    }
  }

  for (const filePath of parsed.delete) {
    if (tryGitAction(filePath, 'delete', () => deletePath(filePath), result)) {
      result.deleted.push(filePath)
    }
  }

  return result
}

function checkoutSide(filePath: string, side: 'ours' | 'theirs'): void {
  runGit(['checkout', side === 'ours' ? '--ours' : '--theirs', '--', filePath])
  runGit(['add', '--', filePath])
}

function deletePath(filePath: string): void {
  try {
    runGit(['rm', '-f', '--', filePath])
    return
  } catch {
    // Path may be untracked or already missing from the index.
  }
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }
  try {
    runGit(['add', '-u', '--', filePath])
  } catch {
    // Ignore if git cannot stage a path that never existed.
  }
}

function tryGitAction(
  filePath: string,
  action: string,
  fn: () => void,
  result: ApplyMergeDirectivesResult
): boolean {
  try {
    fn()
    return true
  } catch (error) {
    result.failed.push({
      path: filePath,
      action,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

function canonicalizeDirectives(directives: MergeDirectives): MergeDirectives {
  return {
    delete: [...directives.delete].sort(),
    checkoutTheirs: [...directives.checkoutTheirs].sort(),
    checkoutOurs: [...directives.checkoutOurs].sort(),
    mustEdit: [...directives.mustEdit].sort(),
    overrideForkFirst: [...directives.overrideForkFirst].sort(),
    notes: directives.notes,
  }
}

function parseSelfResolutions(value: unknown): ParseResult<SelfResolution[]> {
  if (!Array.isArray(value)) return fail('selfResolutions must be an array')
  const out: SelfResolution[] = []
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) return fail(`selfResolutions[${index}] must be an object`)
    if (typeof entry.decision !== 'string' || entry.decision.trim() === '') {
      return fail(`selfResolutions[${index}].decision must be a non-empty string`)
    }
    const paths = parseStringArray(entry.paths, `selfResolutions[${index}].paths`)
    if (!paths.ok) return paths
    let prefixes: string[] | undefined
    if (entry.prefixes !== undefined) {
      const parsedPrefixes = parseStringArray(entry.prefixes, `selfResolutions[${index}].prefixes`)
      if (!parsedPrefixes.ok) return parsedPrefixes
      prefixes = parsedPrefixes.value
    }
    if (!isMergeSideStrategy(entry.strategy)) {
      return fail(`selfResolutions[${index}].strategy is invalid`)
    }
    if (typeof entry.rationale !== 'string' || entry.rationale.trim() === '') {
      return fail(`selfResolutions[${index}].rationale must be a non-empty string`)
    }
    if (entry.cite !== undefined && typeof entry.cite !== 'string') {
      return fail(`selfResolutions[${index}].cite must be a string`)
    }
    out.push({
      decision: entry.decision,
      paths: paths.value,
      prefixes,
      strategy: entry.strategy,
      rationale: entry.rationale,
      cite: entry.cite,
    })
  }
  return { ok: true, value: out }
}

function parseOpenQuestionRefs(value: unknown): ParseResult<OpenQuestionRef[]> {
  if (!Array.isArray(value)) return fail('openQuestions must be an array')
  const out: OpenQuestionRef[] = []
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) return fail(`openQuestions[${index}] must be an object`)
    if (typeof entry.id !== 'string' || entry.id.trim() === '') {
      return fail(`openQuestions[${index}].id must be a non-empty string`)
    }
    if (entry.question !== undefined && typeof entry.question !== 'string') {
      return fail(`openQuestions[${index}].question must be a string`)
    }
    out.push({ id: entry.id, question: entry.question })
  }
  return { ok: true, value: out }
}

function parseChildClusters(
  value: unknown,
  options: { allowEmptyFiles: boolean }
): ParseResult<PlannedChildCluster[]> {
  if (!Array.isArray(value)) return fail('childClusters must be an array')
  const out: PlannedChildCluster[] = []
  const seenIds = new Set<string>()
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) return fail(`childClusters[${index}] must be an object`)
    if (typeof entry.id !== 'string' || entry.id.trim() === '') {
      return fail(`childClusters[${index}].id must be a non-empty string`)
    }
    if (seenIds.has(entry.id)) return fail(`childClusters id "${entry.id}" is duplicated`)
    seenIds.add(entry.id)
    if (typeof entry.prefix !== 'string' || entry.prefix.trim() === '') {
      return fail(`childClusters[${index}].prefix must be a non-empty string`)
    }
    const filesValue = entry.files === undefined ? [] : entry.files
    const files = parseStringArray(filesValue, `childClusters[${index}].files`)
    if (!files.ok) return files
    if (!options.allowEmptyFiles && files.value.length === 0) {
      return fail(`childClusters[${index}].files must not be empty`)
    }
    if (!isChildClusterStrategy(entry.strategy)) {
      return fail(`childClusters[${index}].strategy is invalid`)
    }
    if (typeof entry.notes !== 'string') {
      return fail(`childClusters[${index}].notes must be a string`)
    }
    out.push({
      id: entry.id,
      prefix: entry.prefix,
      files: files.value,
      strategy: entry.strategy,
      notes: entry.notes,
    })
  }
  return { ok: true, value: out }
}

function parseStringArray(value: unknown, label: string): ParseResult<string[]> {
  if (!Array.isArray(value)) return fail(`${label} must be an array of strings`)
  const out: string[] = []
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      return fail(`${label}[${index}] must be a non-empty string`)
    }
    out.push(entry)
  }
  return { ok: true, value: out }
}

function readJsonFile<T>(path: string, validate: (value: unknown) => ParseResult<T>): T | null {
  try {
    const parsed = validate(JSON.parse(readFileSync(path, 'utf8')))
    return parsed.ok ? parsed.value : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isMergeSideStrategy(value: unknown): value is MergeSideStrategy {
  return typeof value === 'string' && MERGE_SIDE_STRATEGIES.has(value as MergeSideStrategy)
}

function isChildClusterStrategy(value: unknown): value is ChildClusterStrategy {
  return typeof value === 'string' && CHILD_CLUSTER_STRATEGIES.has(value as ChildClusterStrategy)
}

function fail(error: string): ParseResult<never> {
  return { ok: false, error }
}

function unwrap<T>(result: ParseResult<T>, prefix: string): T {
  if (!result.ok) throw new Error(`${prefix}: ${result.error}`)
  return result.value
}
