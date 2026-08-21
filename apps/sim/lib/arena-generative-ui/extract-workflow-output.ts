import type { ArenaGenerativeSchemaField } from '@/lib/arena-generative-ui/output-schema'
import { outputSchemaFromSample } from '@/lib/arena-generative-ui/output-schema'
import {
  extractFieldsFromSchema,
  parseResponseFormatSafely,
} from '@/lib/core/utils/response-format'

const MAX_DEPTH = 3
const MAX_FIELDS = 40

interface WorkflowBlockRecord {
  type?: unknown
  subBlocks?: Record<string, { value?: unknown }>
}

/**
 * Reads a deployed workflow's declared output shape so a GUI-app binding can
 * save `outputSchema` without a pasted sample.
 *
 * Preference: Response block structured data, then Response JSON editor, then
 * the first Agent `responseFormat`. Returns nothing when none of those exist —
 * the importer must not invent fields.
 */
export function extractOutputSchemaFromBlocks(
  blocks: Record<string, unknown> | null | undefined
): ArenaGenerativeSchemaField[] {
  if (!blocks) return []

  for (const block of Object.values(blocks)) {
    const record = block as WorkflowBlockRecord
    if (record.type !== 'response') continue
    const fromResponse = schemaFromResponseBlock(record)
    if (fromResponse.length > 0) return fromResponse
  }

  for (const [blockId, block] of Object.entries(blocks)) {
    const record = block as WorkflowBlockRecord
    if (record.type !== 'agent') continue
    const fromAgent = schemaFromAgentBlock(record, blockId)
    if (fromAgent.length > 0) return fromAgent
  }

  return []
}

function schemaFromResponseBlock(block: WorkflowBlockRecord): ArenaGenerativeSchemaField[] {
  const subBlocks = block.subBlocks
  const dataMode = subBlocks?.dataMode?.value === 'json' ? 'json' : 'structured'

  if (dataMode === 'structured') {
    const fromBuilder = schemaFromBuilderData(subBlocks?.builderData?.value)
    if (fromBuilder.length > 0) return fromBuilder
  }

  const jsonValue = subBlocks?.data?.value
  if (jsonValue == null || jsonValue === '') return []
  if (typeof jsonValue === 'object') {
    return schemaFromParsedJson(jsonValue)
  }
  if (typeof jsonValue === 'string') {
    const parsed = parseTemplatedJson(jsonValue)
    return parsed === undefined ? [] : schemaFromParsedJson(parsed)
  }
  return []
}

function schemaFromAgentBlock(
  block: WorkflowBlockRecord,
  blockId: string
): ArenaGenerativeSchemaField[] {
  const parsed = parseResponseFormatSafely(block.subBlocks?.responseFormat?.value, blockId)
  if (!parsed) return []

  const fields: ArenaGenerativeSchemaField[] = []
  const root = jsonSchemaRoot(parsed)
  if (root) {
    collectJsonSchemaFields(root, '', 0, fields)
    if (fields.length > 0) return fields
  }

  return extractFieldsFromSchema(parsed)
    .filter((field) => field.name.trim() !== '')
    .map((field) => ({
      name: field.name.trim(),
      type: field.type?.trim() || 'string',
    }))
}

function jsonSchemaRoot(parsed: unknown): Record<string, unknown> | undefined {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const record = parsed as Record<string, unknown>
  if (record.schema && typeof record.schema === 'object' && !Array.isArray(record.schema)) {
    return record.schema as Record<string, unknown>
  }
  if (record.properties && typeof record.properties === 'object') {
    return record
  }
  return undefined
}

function collectJsonSchemaFields(
  node: unknown,
  path: string,
  depth: number,
  fields: ArenaGenerativeSchemaField[]
): void {
  if (fields.length >= MAX_FIELDS || depth > MAX_DEPTH) return
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    if (path) fields.push({ name: path, type: 'string' })
    return
  }

  const schema = node as Record<string, unknown>
  const declaredType = jsonSchemaType(schema.type)
  const properties = schema.properties
  const hasProperties = Boolean(
    properties && typeof properties === 'object' && !Array.isArray(properties)
  )

  if (declaredType === 'array' || schema.items) {
    if (path) {
      fields.push({ name: path, type: 'array' })
    }
    if (schema.items) {
      collectJsonSchemaFields(schema.items, path ? `${path}[]` : '[]', depth, fields)
    }
    return
  }

  if (declaredType === 'object' || hasProperties) {
    if (path && !path.endsWith('[]')) {
      fields.push({ name: path, type: 'object' })
    }
    if (hasProperties) {
      for (const [key, nested] of Object.entries(properties as Record<string, unknown>)) {
        if (fields.length >= MAX_FIELDS) return
        collectJsonSchemaFields(
          nested,
          path ? `${path}.${key}` : key,
          path ? depth + 1 : depth,
          fields
        )
      }
    }
    return
  }

  if (path) {
    fields.push({ name: path, type: declaredType || 'string' })
  }
}

function jsonSchemaType(type: unknown): string {
  if (typeof type === 'string' && type.trim()) return type.trim()
  if (Array.isArray(type)) {
    const first = type.find((entry) => typeof entry === 'string' && entry !== 'null')
    return typeof first === 'string' ? first : ''
  }
  return ''
}

function schemaFromBuilderData(value: unknown): ArenaGenerativeSchemaField[] {
  if (!Array.isArray(value)) return []
  const fields: ArenaGenerativeSchemaField[] = []
  collectBuilderFields(value, '', 0, fields)
  return fields
}

function collectBuilderFields(
  properties: unknown[],
  prefix: string,
  depth: number,
  fields: ArenaGenerativeSchemaField[]
): void {
  if (depth > MAX_DEPTH || fields.length >= MAX_FIELDS) return

  for (const property of properties) {
    if (fields.length >= MAX_FIELDS) return
    if (!property || typeof property !== 'object') continue
    const record = property as { name?: unknown; type?: unknown; value?: unknown }
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name) continue
    const path = prefix ? `${prefix}.${name}` : name
    const type =
      typeof record.type === 'string' && record.type.trim() ? record.type.trim() : 'string'

    if (type === 'array') {
      fields.push({ name: path, type: 'array' })
      collectBuilderArrayItems(record.value, `${path}[]`, depth, fields)
      continue
    }

    if (type === 'object') {
      fields.push({ name: path, type: 'object' })
      if (Array.isArray(record.value)) {
        collectBuilderFields(record.value, path, depth + 1, fields)
      }
      continue
    }

    fields.push({ name: path, type })
  }
}

function collectBuilderArrayItems(
  value: unknown,
  itemPath: string,
  depth: number,
  fields: ArenaGenerativeSchemaField[]
): void {
  if (!Array.isArray(value) || value.length === 0 || fields.length >= MAX_FIELDS) return
  const first = value[0]
  if (!first || typeof first !== 'object') return
  const item = first as { type?: unknown; value?: unknown }
  const itemType = typeof item.type === 'string' ? item.type : ''

  if (itemType === 'object' && Array.isArray(item.value)) {
    collectBuilderFields(item.value, itemPath, depth, fields)
    return
  }

  if (itemType && itemType !== 'array') {
    fields.push({ name: itemPath, type: itemType })
  }
}

function schemaFromParsedJson(value: unknown): ArenaGenerativeSchemaField[] {
  try {
    return outputSchemaFromSample(JSON.stringify(value))
  } catch {
    return []
  }
}

/**
 * Response JSON editor values often embed `<block.ref>` tokens that are not
 * valid JSON until execution. Replace those so a sample parse can still name fields.
 */
function parseTemplatedJson(raw: string): unknown | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const sanitized = trimmed.replace(/"<[^>\n]+>"/g, '"example"').replace(/<[^>\n]+>/g, '0')
  try {
    return JSON.parse(sanitized) as unknown
  } catch {
    return undefined
  }
}
