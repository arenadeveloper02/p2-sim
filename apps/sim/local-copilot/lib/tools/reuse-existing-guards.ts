import { createLogger } from '@sim/logger'
import type { LocalCopilotStructuredContext } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotReuseExistingGuards')

interface ReuseGuardContext {
  structuredContext: LocalCopilotStructuredContext
}

interface ReuseGuardResult {
  toolName: string
  success: false
  error: string
  result: Record<string, unknown>
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase()
}

function findNamedMatch<T extends { name: string }>(
  items: T[],
  requestedName: string
): T | undefined {
  if (!requestedName) return undefined
  const exact = items.find((item) => normalizeName(item.name) === requestedName)
  if (exact) return exact
  const partial = items.filter(
    (item) =>
      normalizeName(item.name).includes(requestedName) ||
      requestedName.includes(normalizeName(item.name))
  )
  return partial.length === 1 ? partial[0] : undefined
}

function blockedResult(
  toolName: string,
  error: string,
  result: Record<string, unknown>
): ReuseGuardResult {
  return {
    toolName,
    success: false,
    error,
    result: {
      ...result,
      reuseExistingRequired: true,
    },
  }
}

/**
 * Soft-blocks create_file when a similar workspace file already exists.
 */
export function guardCreateFileWhenExistingAvailable(
  args: Record<string, unknown>,
  ctx: ReuseGuardContext
): ReuseGuardResult | null {
  if (args.confirmCreateNew === true) return null

  const files = ctx.structuredContext.workspaceFiles ?? []
  if (files.length === 0) return null

  const fileName =
    (typeof args.fileName === 'string' && args.fileName.trim()) ||
    (typeof args.path === 'string' && args.path.trim()) ||
    ''
  if (!fileName) return null

  const basename = fileName.split('/').filter(Boolean).pop() ?? fileName
  const requested = normalizeName(basename)
  const match = files.find((file) => {
    const name = normalizeName(file.name)
    const path = normalizeName(file.path)
    return name === requested || path.endsWith(`/${requested}`) || path === requested
  })

  if (!match) return null

  logger.info('Blocked create_file in favor of existing file', {
    existingPath: match.path,
    requested: fileName,
  })

  return blockedResult(
    'create_file',
    `A workspace file already exists at "${match.path}". Prefer read / workspace_file + edit_content instead of creating a duplicate.`,
    {
      existingFile: { id: match.id, name: match.name, path: match.path },
      followUpHint:
        'If the user explicitly wants a brand-new file with a different path, retry create_file with confirmCreateNew: true. Otherwise read the existing file and update it.',
    }
  )
}

/**
 * Soft-blocks knowledge_base create when a similar KB already exists.
 */
export function guardCreateKnowledgeBaseWhenExistingAvailable(
  args: Record<string, unknown>,
  ctx: ReuseGuardContext
): ReuseGuardResult | null {
  if (args.confirmCreateNew === true) return null
  if (args.operation !== 'create') return null

  const knowledgeBases = ctx.structuredContext.knowledgeBases ?? []
  if (knowledgeBases.length === 0) return null

  const requestedName = typeof args.name === 'string' ? normalizeName(args.name) : ''
  const match =
    findNamedMatch(knowledgeBases, requestedName) ??
    (knowledgeBases.length === 1 ? knowledgeBases[0] : undefined)

  if (!match) {
    return blockedResult(
      'knowledge_base',
      `This workspace already has ${knowledgeBases.length} knowledge base(s). Reuse one instead of creating another.`,
      {
        existingKnowledgeBases: knowledgeBases.map((item) => ({
          id: item.id,
          name: item.name,
        })),
        followUpHint:
          'Call knowledge_base get / list / query on an existing entry first. Only retry create with confirmCreateNew: true when the user explicitly wants a brand-new knowledge base.',
      }
    )
  }

  logger.info('Blocked knowledge_base create in favor of existing KB', {
    existingId: match.id,
    requestedName: requestedName || null,
  })

  return blockedResult(
    'knowledge_base',
    `A knowledge base named "${match.name}" already exists. Prefer get / query / add_file on it instead of creating a duplicate.`,
    {
      existingKnowledgeBase: { id: match.id, name: match.name },
      followUpHint:
        'Reuse this knowledge base. Retry create with confirmCreateNew: true only if the user explicitly asked for a brand-new one.',
    }
  )
}

/**
 * Soft-blocks user_table create when a similar table already exists.
 */
export function guardCreateTableWhenExistingAvailable(
  args: Record<string, unknown>,
  ctx: ReuseGuardContext
): ReuseGuardResult | null {
  if (args.confirmCreateNew === true) return null
  if (args.operation !== 'create' && args.operation !== 'create_from_file') return null

  const tables = ctx.structuredContext.tables ?? []
  if (tables.length === 0) return null

  const requestedName = typeof args.name === 'string' ? normalizeName(args.name) : ''
  const match =
    findNamedMatch(tables, requestedName) ?? (tables.length === 1 ? tables[0] : undefined)

  if (!match) {
    return blockedResult(
      'user_table',
      `This workspace already has ${tables.length} table(s). Reuse one instead of creating another.`,
      {
        existingTables: tables.map((item) => ({ id: item.id, name: item.name })),
        followUpHint:
          'Call user_table get / get_schema / query_rows on an existing table first. Only retry create with confirmCreateNew: true when the user explicitly wants a brand-new table.',
      }
    )
  }

  logger.info('Blocked user_table create in favor of existing table', {
    existingId: match.id,
    requestedName: requestedName || null,
  })

  return blockedResult(
    'user_table',
    `A table named "${match.name}" already exists. Prefer get / get_schema / query_rows / insert_row on it instead of creating a duplicate.`,
    {
      existingTable: { id: match.id, name: match.name },
      followUpHint:
        'Reuse this table. Retry create with confirmCreateNew: true only if the user explicitly asked for a brand-new one.',
    }
  )
}

/**
 * Runs soft reuse guards for mothership-delegated create tools.
 */
export function guardDelegatedCreateWhenExistingAvailable(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ReuseGuardContext
): ReuseGuardResult | null {
  if (toolName === 'create_file') {
    return guardCreateFileWhenExistingAvailable(args, ctx)
  }
  if (toolName === 'knowledge_base') {
    return guardCreateKnowledgeBaseWhenExistingAvailable(args, ctx)
  }
  if (toolName === 'user_table') {
    return guardCreateTableWhenExistingAvailable(args, ctx)
  }
  return null
}
