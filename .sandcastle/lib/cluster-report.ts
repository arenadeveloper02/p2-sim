import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureLedgerRunDir, ledgerRunDir } from './config'

export const CLUSTER_REPORTS_DIRNAME = 'clusters'

export type ClusterFileResolution = 'ours' | 'theirs' | 'manual' | 'deleted'
export type PolicyProposalKind = 'forkFirst' | 'upstreamFirst' | 'manualReview' | 'unionPaths'

export interface ClusterFileReport {
  path: string
  resolution: ClusterFileResolution
  notes?: string
}

export interface ClusterPolicyProposal {
  kind: PolicyProposalKind
  prefix: string
  notes?: string
}

export interface ClusterReport {
  clusterId: string
  runId: string
  files: ClusterFileReport[]
  policyProposals?: ClusterPolicyProposal[]
  notes?: string
}

export type ClusterReportParseResult =
  | { ok: true; report: ClusterReport }
  | { ok: false; error: string }

const RESOLUTIONS = new Set<ClusterFileResolution>(['ours', 'theirs', 'manual', 'deleted'])
const POLICY_KINDS = new Set<PolicyProposalKind>([
  'forkFirst',
  'upstreamFirst',
  'manualReview',
  'unionPaths',
])

export function clusterReportsDir(runId: string): string {
  return join(ledgerRunDir(runId), CLUSTER_REPORTS_DIRNAME)
}

export function clusterReportPath(runId: string, clusterId: string): string {
  return join(clusterReportsDir(runId), `${clusterId}.json`)
}

export function validateClusterReport(value: unknown): ClusterReportParseResult {
  if (!isRecord(value)) return fail('cluster report must be an object')
  if (typeof value.clusterId !== 'string' || value.clusterId.trim() === '') {
    return fail('clusterId must be a non-empty string')
  }
  if (typeof value.runId !== 'string' || value.runId.trim() === '') {
    return fail('runId must be a non-empty string')
  }
  if (!Array.isArray(value.files)) return fail('files must be an array')

  const files: ClusterFileReport[] = []
  const seenPaths = new Set<string>()
  for (const [index, entry] of value.files.entries()) {
    if (!isRecord(entry)) return fail(`files[${index}] must be an object`)
    if (typeof entry.path !== 'string' || entry.path.trim() === '') {
      return fail(`files[${index}].path must be a non-empty string`)
    }
    if (seenPaths.has(entry.path)) {
      return fail(`files path "${entry.path}" is duplicated`)
    }
    seenPaths.add(entry.path)
    if (!isResolution(entry.resolution)) {
      return fail(`files[${index}].resolution must be ours|theirs|manual|deleted`)
    }
    if (entry.notes !== undefined && typeof entry.notes !== 'string') {
      return fail(`files[${index}].notes must be a string`)
    }
    files.push({
      path: entry.path,
      resolution: entry.resolution,
      notes: entry.notes,
    })
  }

  let policyProposals: ClusterPolicyProposal[] | undefined
  if (value.policyProposals !== undefined) {
    if (!Array.isArray(value.policyProposals)) return fail('policyProposals must be an array')
    policyProposals = []
    for (const [index, entry] of value.policyProposals.entries()) {
      if (!isRecord(entry)) return fail(`policyProposals[${index}] must be an object`)
      if (!isPolicyKind(entry.kind)) {
        return fail(`policyProposals[${index}].kind is invalid`)
      }
      if (typeof entry.prefix !== 'string' || entry.prefix.trim() === '') {
        return fail(`policyProposals[${index}].prefix must be a non-empty string`)
      }
      if (entry.notes !== undefined && typeof entry.notes !== 'string') {
        return fail(`policyProposals[${index}].notes must be a string`)
      }
      policyProposals.push({
        kind: entry.kind,
        prefix: entry.prefix,
        notes: entry.notes,
      })
    }
  }

  if (value.notes !== undefined && typeof value.notes !== 'string') {
    return fail('notes must be a string')
  }

  return {
    ok: true,
    report: {
      clusterId: value.clusterId,
      runId: value.runId,
      files,
      policyProposals,
      notes: value.notes,
    },
  }
}

export function parseClusterReport(value: unknown): ClusterReport {
  const parsed = validateClusterReport(value)
  if (!parsed.ok) throw new Error(`Invalid cluster report: ${parsed.error}`)
  return parsed.report
}

export function writeClusterReport(runId: string, report: ClusterReport): string {
  const parsed = parseClusterReport({ ...report, runId })
  ensureLedgerRunDir(runId)
  const dir = clusterReportsDir(runId)
  mkdirSync(dir, { recursive: true })
  const path = clusterReportPath(runId, parsed.clusterId)
  writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`)
  return path
}

export function readClusterReport(runId: string, clusterId: string): ClusterReport | null {
  try {
    const parsed = validateClusterReport(
      JSON.parse(readFileSync(clusterReportPath(runId, clusterId), 'utf8'))
    )
    return parsed.ok ? parsed.report : null
  } catch {
    return null
  }
}

export function listClusterReports(runId: string): ClusterReport[] {
  try {
    const files = readdirSync(clusterReportsDir(runId)).filter((name) => name.endsWith('.json'))
    return files
      .map((name) => readClusterReport(runId, name.slice(0, -'.json'.length)))
      .filter((report): report is ClusterReport => report !== null)
      .sort((a, b) => a.clusterId.localeCompare(b.clusterId))
  } catch {
    return []
  }
}

export function formatClusterReportTable(report: ClusterReport): string {
  const rows = report.files.map(
    (file) =>
      `| \`${file.path}\` | ${file.resolution} | ${file.notes?.replaceAll('|', '\\|') ?? ''} |`
  )
  const lines = [
    `| File | Resolution | Notes |`,
    `| --- | --- | --- |`,
    ...(rows.length > 0 ? rows : ['| _none_ | | |']),
  ]
  if (report.policyProposals?.length) {
    lines.push('', 'Policy proposals:', '')
    for (const proposal of report.policyProposals) {
      const note = proposal.notes ? ` — ${proposal.notes}` : ''
      lines.push(`- \`${proposal.kind}\` \`${proposal.prefix}\`${note}`)
    }
  }
  if (report.notes) {
    lines.push('', report.notes)
  }
  return lines.join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isResolution(value: unknown): value is ClusterFileResolution {
  return typeof value === 'string' && RESOLUTIONS.has(value as ClusterFileResolution)
}

function isPolicyKind(value: unknown): value is PolicyProposalKind {
  return typeof value === 'string' && POLICY_KINDS.has(value as PolicyProposalKind)
}

function fail(error: string): ClusterReportParseResult {
  return { ok: false, error }
}
