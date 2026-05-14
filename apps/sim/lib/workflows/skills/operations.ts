import { db } from '@sim/db'
import { skill, skillNode } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { generateShortId } from '@sim/utils/id'
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { generateRequestId } from '@/lib/core/utils/request'

const logger = createLogger('SkillsOperations')

export type SkillNodeType = 'folder' | 'skill' | 'file'
export type SkillSelectionType = 'pack' | 'folder' | 'skill' | 'file'

export interface SkillNodeInput {
  path: string
  type: SkillNodeType
  name: string
  description?: string | null
  content?: string | null
  allowedTools?: string[] | null
  sortOrder?: number
}

export interface SkillPackInput {
  name: string
  description: string
  content?: string
  sourceUrl?: string | null
  sourceType?: string | null
  rootPath?: string | null
  nodes: SkillNodeInput[]
}

export interface SkillNodeSummary {
  id: string
  skillId: string
  parentId: string | null
  path: string
  type: SkillNodeType
  name: string
  description: string | null
  allowedTools: string[] | null
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface SkillWithNodes {
  id: string
  workspaceId: string | null
  userId: string | null
  name: string
  description: string
  content: string
  sourceUrl: string | null
  sourceType: string | null
  rootPath: string | null
  createdAt: Date
  updatedAt: Date
  nodes: SkillNodeSummary[]
  nodeCount: number
}

export interface SkillSelection {
  skillId: string
  nodeId?: string
  path?: string
  selectionType?: SkillSelectionType
}

const FLAT_SKILL_PATH = 'SKILL.md'

function normalizeSkillPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').trim()

  if (!normalized || normalized === '.' || normalized.includes('\0')) {
    throw new Error('Invalid skill path')
  }

  const parts = normalized.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Invalid skill path')
  }

  return normalized
}

function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

function dirname(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx)
}

function isWithinPath(path: string, parentPath: string): boolean {
  return path === parentPath || path.startsWith(`${parentPath}/`)
}

function serializeSearchText(node: SkillNodeInput): string {
  return [node.name, node.description, node.content].filter(Boolean).join('\n')
}

function toNodeSummary(row: typeof skillNode.$inferSelect): SkillNodeSummary {
  return {
    id: row.id,
    skillId: row.skillId,
    parentId: row.parentId,
    path: row.path,
    type: row.type,
    name: row.name,
    description: row.description,
    allowedTools: row.allowedTools ?? null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toSkillWithNodes(
  row: typeof skill.$inferSelect,
  nodes: SkillNodeSummary[] = []
): SkillWithNodes {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    name: row.name,
    description: row.description,
    content: row.content,
    sourceUrl: row.sourceUrl,
    sourceType: row.sourceType,
    rootPath: row.rootPath,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    nodes,
    nodeCount: nodes.length,
  }
}

async function upsertFlatSkillNode(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    skillId: string
    workspaceId: string
    name: string
    description: string
    content: string
    nowTime: Date
  }
) {
  const existingNodes = await tx
    .select({ id: skillNode.id })
    .from(skillNode)
    .where(and(eq(skillNode.skillId, params.skillId), eq(skillNode.path, FLAT_SKILL_PATH)))
    .limit(1)

  const values = {
    workspaceId: params.workspaceId,
    parentId: null,
    path: FLAT_SKILL_PATH,
    type: 'skill' as const,
    name: params.name,
    description: params.description,
    content: params.content,
    allowedTools: null,
    searchText: [params.name, params.description, params.content].join('\n'),
    sortOrder: 0,
    updatedAt: params.nowTime,
  }

  if (existingNodes.length > 0) {
    await tx.update(skillNode).set(values).where(eq(skillNode.id, existingNodes[0].id))
    return
  }

  await tx.insert(skillNode).values({
    id: generateShortId(),
    skillId: params.skillId,
    ...values,
    createdAt: params.nowTime,
  })
}

/**
 * List all skills for a workspace, ordered by createdAt desc.
 */
export async function listSkills(params: { workspaceId: string }): Promise<SkillWithNodes[]> {
  const skillRows = await db
    .select()
    .from(skill)
    .where(eq(skill.workspaceId, params.workspaceId))
    .orderBy(desc(skill.createdAt))

  if (skillRows.length === 0) return []

  const nodes = await db
    .select()
    .from(skillNode)
    .where(
      and(
        eq(skillNode.workspaceId, params.workspaceId),
        inArray(
          skillNode.skillId,
          skillRows.map((s) => s.id)
        )
      )
    )
    .orderBy(asc(skillNode.sortOrder), asc(skillNode.path))

  const nodesBySkillId = new Map<string, SkillNodeSummary[]>()
  for (const node of nodes) {
    const summary = toNodeSummary(node)
    const existing = nodesBySkillId.get(node.skillId) ?? []
    existing.push(summary)
    nodesBySkillId.set(node.skillId, existing)
  }

  return skillRows.map((row) => toSkillWithNodes(row, nodesBySkillId.get(row.id) ?? []))
}

/**
 * Delete a skill by ID within a workspace.
 * Returns true if the skill was found and deleted, false otherwise.
 */
export async function deleteSkill(params: {
  skillId: string
  workspaceId: string
}): Promise<boolean> {
  const existing = await db
    .select({ id: skill.id })
    .from(skill)
    .where(and(eq(skill.id, params.skillId), eq(skill.workspaceId, params.workspaceId)))
    .limit(1)

  if (existing.length === 0) return false

  await db
    .delete(skill)
    .where(and(eq(skill.id, params.skillId), eq(skill.workspaceId, params.workspaceId)))

  logger.info(`Deleted skill ${params.skillId}`)
  return true
}

/**
 * Internal function to create/update skills.
 * Can be called from API routes or internal services.
 */
export async function upsertSkills(params: {
  skills: Array<{
    id?: string
    name: string
    description: string
    content: string
    sourceUrl?: string | null
    sourceType?: string | null
    rootPath?: string | null
  }>
  workspaceId: string
  userId: string
  requestId?: string
}) {
  const { skills, workspaceId, userId, requestId = generateRequestId() } = params

  return await db.transaction(async (tx) => {
    for (const s of skills) {
      const nowTime = new Date()

      if (s.id) {
        const existingSkill = await tx
          .select()
          .from(skill)
          .where(and(eq(skill.id, s.id), eq(skill.workspaceId, workspaceId)))
          .limit(1)

        if (existingSkill.length > 0) {
          if (s.name !== existingSkill[0].name) {
            const nameConflict = await tx
              .select({ id: skill.id })
              .from(skill)
              .where(
                and(eq(skill.workspaceId, workspaceId), eq(skill.name, s.name), ne(skill.id, s.id))
              )
              .limit(1)

            if (nameConflict.length > 0) {
              throw new Error(`A skill with the name "${s.name}" already exists in this workspace`)
            }
          }

          await tx
            .update(skill)
            .set({
              name: s.name,
              description: s.description,
              content: s.content,
              sourceUrl: s.sourceUrl ?? existingSkill[0].sourceUrl,
              sourceType: s.sourceType ?? existingSkill[0].sourceType,
              rootPath: s.rootPath ?? existingSkill[0].rootPath ?? FLAT_SKILL_PATH,
              updatedAt: nowTime,
            })
            .where(and(eq(skill.id, s.id), eq(skill.workspaceId, workspaceId)))

          await upsertFlatSkillNode(tx, {
            skillId: s.id,
            workspaceId,
            name: s.name,
            description: s.description,
            content: s.content,
            nowTime,
          })

          logger.info(`[${requestId}] Updated skill ${s.id}`)
          continue
        }
      }

      const duplicateName = await tx
        .select()
        .from(skill)
        .where(and(eq(skill.workspaceId, workspaceId), eq(skill.name, s.name)))
        .limit(1)

      if (duplicateName.length > 0) {
        throw new Error(`A skill with the name "${s.name}" already exists in this workspace`)
      }

      const skillId = generateShortId()

      await tx.insert(skill).values({
        id: skillId,
        workspaceId,
        userId,
        name: s.name,
        description: s.description,
        content: s.content,
        sourceUrl: s.sourceUrl ?? null,
        sourceType: s.sourceType ?? null,
        rootPath: s.rootPath ?? FLAT_SKILL_PATH,
        createdAt: nowTime,
        updatedAt: nowTime,
      })

      await upsertFlatSkillNode(tx, {
        skillId,
        workspaceId,
        name: s.name,
        description: s.description,
        content: s.content,
        nowTime,
      })

      logger.info(`[${requestId}] Created skill "${s.name}"`)
    }

    const resultSkills = await tx
      .select()
      .from(skill)
      .where(eq(skill.workspaceId, workspaceId))
      .orderBy(desc(skill.createdAt))

    return resultSkills.map((row) => toSkillWithNodes(row))
  })
}

/**
 * Persist a hierarchical skill pack and all of its normalized nodes.
 */
export async function createSkillPack(params: {
  pack: SkillPackInput
  workspaceId: string
  userId: string
  requestId?: string
}): Promise<SkillWithNodes> {
  const { pack, workspaceId, userId, requestId = generateRequestId() } = params

  return db.transaction(async (tx) => {
    const duplicateName = await tx
      .select({ id: skill.id })
      .from(skill)
      .where(and(eq(skill.workspaceId, workspaceId), eq(skill.name, pack.name)))
      .limit(1)

    if (duplicateName.length > 0) {
      throw new Error(`A skill with the name "${pack.name}" already exists in this workspace`)
    }

    const nowTime = new Date()
    const skillId = generateShortId()
    const content =
      pack.content ??
      pack.nodes.find((node) => node.type === 'skill' && node.content)?.content ??
      `# ${pack.name}\n\n${pack.description}`

    await tx.insert(skill).values({
      id: skillId,
      workspaceId,
      userId,
      name: pack.name,
      description: pack.description,
      content,
      sourceUrl: pack.sourceUrl ?? null,
      sourceType: pack.sourceType ?? null,
      rootPath: pack.rootPath ?? null,
      createdAt: nowTime,
      updatedAt: nowTime,
    })

    const normalizedNodes = pack.nodes
      .map((node, index) => ({
        ...node,
        path: normalizeSkillPath(node.path),
        sortOrder: node.sortOrder ?? index,
      }))
      .sort(
        (a, b) =>
          a.path.split('/').length - b.path.split('/').length ||
          a.path.localeCompare(b.path) ||
          a.type.localeCompare(b.type)
      )

    const parentByPath = new Map<string, string | null>()
    const insertedNodes: SkillNodeSummary[] = []

    for (const node of normalizedNodes) {
      const nodeId = generateShortId()
      const parentPath = dirname(node.path)
      const parentId = parentPath ? (parentByPath.get(parentPath) ?? null) : null

      await tx.insert(skillNode).values({
        id: nodeId,
        skillId,
        parentId,
        workspaceId,
        path: node.path,
        type: node.type,
        name: node.name || basename(node.path),
        description: node.description ?? null,
        content: node.content ?? null,
        allowedTools: node.allowedTools ?? null,
        searchText: serializeSearchText(node),
        sortOrder: node.sortOrder,
        createdAt: nowTime,
        updatedAt: nowTime,
      })

      parentByPath.set(node.path, nodeId)
      insertedNodes.push({
        id: nodeId,
        skillId,
        parentId,
        path: node.path,
        type: node.type,
        name: node.name || basename(node.path),
        description: node.description ?? null,
        allowedTools: node.allowedTools ?? null,
        sortOrder: node.sortOrder,
        createdAt: nowTime,
        updatedAt: nowTime,
      })
    }

    logger.info(`[${requestId}] Created skill pack "${pack.name}"`)

    return {
      id: skillId,
      workspaceId,
      userId,
      name: pack.name,
      description: pack.description,
      content,
      sourceUrl: pack.sourceUrl ?? null,
      sourceType: pack.sourceType ?? null,
      rootPath: pack.rootPath ?? null,
      createdAt: nowTime,
      updatedAt: nowTime,
      nodes: insertedNodes,
      nodeCount: insertedNodes.length,
    }
  })
}

export async function getSkillNode(params: {
  skillId: string
  nodeId: string
  workspaceId: string
}) {
  const rows = await db
    .select()
    .from(skillNode)
    .where(
      and(
        eq(skillNode.id, params.nodeId),
        eq(skillNode.skillId, params.skillId),
        eq(skillNode.workspaceId, params.workspaceId)
      )
    )
    .limit(1)

  return rows[0] ?? null
}

export async function listSkillChildren(params: {
  skillId: string
  workspaceId: string
  path?: string
}): Promise<SkillNodeSummary[]> {
  let parentId: string | null = null

  if (params.path) {
    const path = normalizeSkillPath(params.path)
    const parentRows = await db
      .select({ id: skillNode.id })
      .from(skillNode)
      .where(
        and(
          eq(skillNode.skillId, params.skillId),
          eq(skillNode.workspaceId, params.workspaceId),
          eq(skillNode.path, path)
        )
      )
      .limit(1)

    if (parentRows.length === 0) return []
    parentId = parentRows[0].id
  }

  const rows = await db
    .select()
    .from(skillNode)
    .where(
      and(
        eq(skillNode.skillId, params.skillId),
        eq(skillNode.workspaceId, params.workspaceId),
        parentId ? eq(skillNode.parentId, parentId) : isNull(skillNode.parentId)
      )
    )
    .orderBy(asc(skillNode.sortOrder), asc(skillNode.path))

  return rows.map(toNodeSummary)
}

export async function searchSkillTree(params: {
  skillId: string
  workspaceId: string
  query: string
  limit?: number
}): Promise<SkillNodeSummary[]> {
  const query = params.query.trim().toLowerCase()
  if (!query) return []

  const rows = await db
    .select()
    .from(skillNode)
    .where(
      and(eq(skillNode.skillId, params.skillId), eq(skillNode.workspaceId, params.workspaceId))
    )

  return rows
    .map((row) => {
      const haystack = [row.path, row.name, row.description, row.searchText]
        .join('\n')
        .toLowerCase()
      const score =
        row.path.toLowerCase() === query
          ? 100
          : row.name.toLowerCase().includes(query)
            ? 75
            : row.path.toLowerCase().includes(query)
              ? 50
              : haystack.includes(query)
                ? 25
                : 0
      return { row, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.row.path.localeCompare(b.row.path))
    .slice(0, params.limit ?? 10)
    .map((item) => toNodeSummary(item.row))
}

export async function loadSkillNode(params: {
  skillId: string
  workspaceId: string
  path: string
}) {
  const path = normalizeSkillPath(params.path)
  const rows = await db
    .select()
    .from(skillNode)
    .where(
      and(
        eq(skillNode.skillId, params.skillId),
        eq(skillNode.workspaceId, params.workspaceId),
        eq(skillNode.path, path),
        eq(skillNode.type, 'skill')
      )
    )
    .limit(1)

  const node = rows[0]
  if (!node) return null

  const directory = dirname(path)
  const allNodes = await db
    .select()
    .from(skillNode)
    .where(
      and(eq(skillNode.skillId, params.skillId), eq(skillNode.workspaceId, params.workspaceId))
    )
    .orderBy(asc(skillNode.sortOrder), asc(skillNode.path))

  const nearbyFiles = allNodes
    .filter((candidate) => candidate.type === 'file')
    .filter((candidate) =>
      directory ? isWithinPath(candidate.path, directory) : !candidate.path.includes('/')
    )
    .slice(0, 30)
    .map(toNodeSummary)

  return {
    node: toNodeSummary(node),
    content: node.content ?? '',
    allowedTools: node.allowedTools ?? null,
    nearbyFiles,
  }
}

export async function loadSkillFile(params: {
  skillId: string
  workspaceId: string
  path: string
}) {
  const path = normalizeSkillPath(params.path)
  const rows = await db
    .select()
    .from(skillNode)
    .where(
      and(
        eq(skillNode.skillId, params.skillId),
        eq(skillNode.workspaceId, params.workspaceId),
        eq(skillNode.path, path),
        eq(skillNode.type, 'file')
      )
    )
    .limit(1)

  const node = rows[0]
  if (!node) return null

  return {
    node: toNodeSummary(node),
    content: node.content ?? '',
  }
}

export async function resolveSelectedSkillNodes(params: {
  selections: SkillSelection[]
  workspaceId: string
}): Promise<SkillWithNodes[]> {
  if (params.selections.length === 0) return []

  const skillIds = [...new Set(params.selections.map((selection) => selection.skillId))]
  const skillRows = await db
    .select()
    .from(skill)
    .where(and(eq(skill.workspaceId, params.workspaceId), inArray(skill.id, skillIds)))

  if (skillRows.length === 0) return []

  const allNodes = await db
    .select()
    .from(skillNode)
    .where(
      and(
        eq(skillNode.workspaceId, params.workspaceId),
        inArray(
          skillNode.skillId,
          skillRows.map((s) => s.id)
        )
      )
    )
    .orderBy(asc(skillNode.sortOrder), asc(skillNode.path))

  const nodesBySkillId = new Map<string, SkillNodeSummary[]>()
  for (const row of allNodes) {
    const selectionsForSkill = params.selections.filter(
      (selection) => selection.skillId === row.skillId
    )
    const includeNode = selectionsForSkill.some((selection) => {
      if (!selection.selectionType || selection.selectionType === 'pack') return true
      if (selection.nodeId && selection.nodeId === row.id) return true
      if (!selection.path) return false
      const selectedPath = normalizeSkillPath(selection.path)
      return selection.selectionType === 'folder'
        ? isWithinPath(row.path, selectedPath)
        : row.path === selectedPath
    })

    if (!includeNode) continue

    const existing = nodesBySkillId.get(row.skillId) ?? []
    existing.push(toNodeSummary(row))
    nodesBySkillId.set(row.skillId, existing)
  }

  return skillRows.map((row) => toSkillWithNodes(row, nodesBySkillId.get(row.id) ?? []))
}
