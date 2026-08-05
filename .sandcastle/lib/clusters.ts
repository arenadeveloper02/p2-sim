/**
 * Hierarchical conflict clustering for upstream-sync child agents.
 *
 * Coarse 3-segment buckets (`apps/sim/app/`) previously produced $40+ mega-agents.
 * This module:
 * 1. Buckets by a deeper path prefix (default 4 segments)
 * 2. Recursively splits oversized buckets into child clusters
 * 3. Chunks when path depth is exhausted
 * 4. Supports dynamic re-clustering of leftovers after an agent finishes
 */

export interface ConflictCluster {
  /** Stable id, e.g. `cluster-1`, `cluster-1.2`, `cluster-1.2.r1` */
  id: string
  /** Path prefix this cluster owns (trailing `/`, or `#chunk-N` suffix when chunked) */
  prefix: string
  /** Conflict files owned by this node. Empty when the node is structural (has children). */
  files: string[]
  /** Nesting depth (0 = top-level bucket). */
  depth: number
  parentId: string | null
  children: ConflictCluster[]
  /** Parent-plan strategy when spawned from `merge-plan.json`. */
  strategy?: ChildClusterStrategyHint
  /** Parent-plan notes passed through to the child prompt. */
  notes?: string
}

/** Strategy string from the merge plan; fallback clustering leaves this unset. */
export type ChildClusterStrategyHint = string

export interface ClusterOptions {
  /** Minimum path segments for the first bucket key. Default 4 (`apps/sim/app/workspace/`). */
  minPrefixSegments?: number
  /** Max files on a leaf before splitting/chunking. Default 12. */
  maxFilesPerCluster?: number
  /** Max nesting depth for path-based splits (not counting chunk nodes). Default 5. */
  maxDepth?: number
  /** Prefix for generated ids. Default `cluster`. */
  idPrefix?: string
}

export interface ResolvedClusterOptions {
  minPrefixSegments: number
  maxFilesPerCluster: number
  maxDepth: number
  idPrefix: string
}

const DEFAULTS: ResolvedClusterOptions = {
  minPrefixSegments: 4,
  maxFilesPerCluster: 12,
  maxDepth: 5,
  idPrefix: 'cluster',
}

function readPositiveInt(envName: string, fallback: number): number {
  const raw = process.env[envName]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.floor(n)
}

/** Resolve cluster knobs from options + env (`UPSTREAM_SYNC_CLUSTER_*`). */
export function resolveClusterOptions(options?: ClusterOptions): ResolvedClusterOptions {
  return {
    minPrefixSegments:
      options?.minPrefixSegments ??
      readPositiveInt('UPSTREAM_SYNC_CLUSTER_MIN_SEGMENTS', DEFAULTS.minPrefixSegments),
    maxFilesPerCluster:
      options?.maxFilesPerCluster ??
      readPositiveInt('UPSTREAM_SYNC_CLUSTER_MAX_FILES', DEFAULTS.maxFilesPerCluster),
    maxDepth:
      options?.maxDepth ?? readPositiveInt('UPSTREAM_SYNC_CLUSTER_MAX_DEPTH', DEFAULTS.maxDepth),
    idPrefix: options?.idPrefix ?? DEFAULTS.idPrefix,
  }
}

/** Path prefix of `segmentCount` segments, always trailing `/`. */
export function pathPrefix(filePath: string, segmentCount: number): string {
  const parts = filePath.split('/').filter(Boolean)
  if (parts.length === 0) return './'
  if (parts.length <= segmentCount) {
    // File lives at/above the segment budget — use its directory (or the file itself).
    if (parts.length === 1) return `${parts[0]}/`
    return `${parts.slice(0, -1).join('/')}/`
  }
  return `${parts.slice(0, segmentCount).join('/')}/`
}

function bucketByPrefix(files: string[], segmentCount: number): Map<string, string[]> {
  const buckets = new Map<string, string[]>()
  for (const file of files) {
    const prefix = pathPrefix(file, segmentCount)
    const existing = buckets.get(prefix) ?? []
    existing.push(file)
    buckets.set(prefix, existing)
  }
  for (const [, list] of buckets) {
    list.sort()
  }
  return buckets
}

function chunkFiles(files: string[], size: number): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < files.length; i += size) {
    chunks.push(files.slice(i, i + size))
  }
  return chunks
}

function buildNode(options: {
  id: string
  prefix: string
  files: string[]
  depth: number
  parentId: string | null
  segmentCount: number
  opts: ResolvedClusterOptions
}): ConflictCluster {
  const { id, prefix, files, depth, parentId, segmentCount, opts } = options
  const sorted = [...files].sort()

  if (sorted.length <= opts.maxFilesPerCluster) {
    return {
      id,
      prefix,
      files: sorted,
      depth,
      parentId,
      children: [],
    }
  }

  if (depth >= opts.maxDepth) {
    const chunks = chunkFiles(sorted, opts.maxFilesPerCluster)
    if (chunks.length === 1) {
      return {
        id,
        prefix,
        files: sorted,
        depth,
        parentId,
        children: [],
      }
    }
    return {
      id,
      prefix,
      files: [],
      depth,
      parentId,
      children: chunks.map((chunk, index) => ({
        id: `${id}.${index + 1}`,
        prefix: `${prefix.replace(/\/$/, '')}#chunk-${index + 1}/`,
        files: chunk,
        depth: depth + 1,
        parentId: id,
        children: [],
      })),
    }
  }

  const nextSegments = segmentCount + 1
  const subBuckets = bucketByPrefix(sorted, nextSegments)
  // If every file lands in the same sub-prefix, path split cannot progress — chunk instead.
  if (subBuckets.size <= 1) {
    const chunks = chunkFiles(sorted, opts.maxFilesPerCluster)
    if (chunks.length === 1) {
      return {
        id,
        prefix,
        files: sorted,
        depth,
        parentId,
        children: [],
      }
    }
    return {
      id,
      prefix,
      files: [],
      depth,
      parentId,
      children: chunks.map((chunk, index) => ({
        id: `${id}.${index + 1}`,
        prefix: `${prefix.replace(/\/$/, '')}#chunk-${index + 1}/`,
        files: chunk,
        depth: depth + 1,
        parentId: id,
        children: [],
      })),
    }
  }

  const children: ConflictCluster[] = []
  let childIndex = 0
  for (const [subPrefix, subFiles] of [...subBuckets.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    childIndex += 1
    children.push(
      buildNode({
        id: `${id}.${childIndex}`,
        prefix: subPrefix,
        files: subFiles,
        depth: depth + 1,
        parentId: id,
        segmentCount: nextSegments,
        opts,
      })
    )
  }

  return {
    id,
    prefix,
    files: [],
    depth,
    parentId,
    children,
  }
}

/**
 * Build a forest of conflict clusters (roots may contain nested children).
 * Leaves hold the files; internal nodes are structural grouping only.
 */
export function groupConflictClusters(
  conflictFiles: string[],
  options?: ClusterOptions
): ConflictCluster[] {
  const opts = resolveClusterOptions(options)
  const unique = [...new Set(conflictFiles.filter(Boolean))].sort()
  if (unique.length === 0) return []

  const topBuckets = bucketByPrefix(unique, opts.minPrefixSegments)
  const roots: ConflictCluster[] = []
  let rootIndex = 0
  for (const [prefix, files] of [...topBuckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    rootIndex += 1
    roots.push(
      buildNode({
        id: `${opts.idPrefix}-${rootIndex}`,
        prefix,
        files,
        depth: 0,
        parentId: null,
        segmentCount: opts.minPrefixSegments,
        opts,
      })
    )
  }
  return roots
}

/** Depth-first list of every node (structural + leaf). */
export function walkConflictClusters(clusters: ConflictCluster[]): ConflictCluster[] {
  const out: ConflictCluster[] = []
  const visit = (node: ConflictCluster) => {
    out.push(node)
    for (const child of node.children) visit(child)
  }
  for (const root of clusters) visit(root)
  return out
}

/** Leaves only — nodes that agents should run against. */
export function leafConflictClusters(clusters: ConflictCluster[]): ConflictCluster[] {
  return walkConflictClusters(clusters).filter((c) => c.children.length === 0)
}

/** Total file count across leaves. */
export function countClusterFiles(clusters: ConflictCluster[]): number {
  return leafConflictClusters(clusters).reduce((sum, c) => sum + c.files.length, 0)
}

/**
 * Re-cluster leftovers under a finished leaf as dynamic child clusters.
 * Returns [] when splitting would not help (same single leaf, or empty).
 */
export function splitLeftoverCluster(
  parent: ConflictCluster,
  leftoverFiles: string[],
  options?: ClusterOptions & { round?: number }
): ConflictCluster[] {
  const leftovers = [...new Set(leftoverFiles.filter((f) => parent.files.includes(f)))].sort()
  if (leftovers.length === 0) return []

  const round = options?.round ?? 1
  const opts = resolveClusterOptions({
    ...options,
    // Dig at least one segment deeper than the parent prefix when possible.
    minPrefixSegments: Math.max(
      options?.minPrefixSegments ??
        readPositiveInt('UPSTREAM_SYNC_CLUSTER_MIN_SEGMENTS', DEFAULTS.minPrefixSegments),
      parent.prefix
        .replace(/#chunk-\d+\/$/, '/')
        .split('/')
        .filter(Boolean).length + 1
    ),
    idPrefix: `${parent.id}.r${round}`,
  })

  // groupConflictClusters with idPrefix `cluster-1.r1` yields `cluster-1.r1-1` — rewrite to
  // `cluster-1.r1.1` for readable nesting.
  const raw = groupConflictClusters(leftovers, opts)
  const relabeled = relabelRoots(raw, `${parent.id}.r${round}`, parent.id, parent.depth + 1)

  // No useful split: single leaf with the same file set.
  const leaves = leafConflictClusters(relabeled)
  if (leaves.length === 1 && leaves[0].files.length === leftovers.length) {
    // Still allow chunking when over max — groupConflictClusters already chunked if needed.
    if (leaves[0].files.length <= opts.maxFilesPerCluster) {
      return []
    }
  }

  return relabeled
}

function relabelRoots(
  roots: ConflictCluster[],
  idBase: string,
  parentId: string,
  depthBase: number
): ConflictCluster[] {
  return roots.map((root, index) =>
    relabelNode(root, `${idBase}.${index + 1}`, parentId, depthBase)
  )
}

function relabelNode(
  node: ConflictCluster,
  id: string,
  parentId: string | null,
  depth: number
): ConflictCluster {
  return {
    ...node,
    id,
    parentId,
    depth,
    children: node.children.map((child, index) =>
      relabelNode(child, `${id}.${index + 1}`, id, depth + 1)
    ),
  }
}

/** JSON-safe tree for the ledger manifest (strips nothing — full hierarchy). */
export function serializeClusterForest(clusters: ConflictCluster[]): ConflictCluster[] {
  return clusters
}
