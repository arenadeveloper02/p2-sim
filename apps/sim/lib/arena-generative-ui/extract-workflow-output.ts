import { normalizeWorkflowBlockName } from '@sim/workflow-types/workflow'
import {
  type ArenaGenerativeSchemaField,
  hasSchemaFieldName,
  namedSchemaFields,
  outputSchemaFromSample,
  prefixOutputSchemaFields,
} from '@/lib/arena-generative-ui/output-schema'
import {
  extractFieldsFromSchema,
  parseResponseFormatSafely,
} from '@/lib/core/utils/response-format'

const MAX_DEPTH = 3
const MAX_FIELDS = 40

const BUILDER_ITEM_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array'])

interface WorkflowBlockRecord {
  type?: unknown
  name?: unknown
  subBlocks?: Record<string, { value?: unknown }>
}

/**
 * Reads a deployed workflow's declared output shape so a GUI-app binding can
 * save `outputSchema` without a pasted sample.
 *
 * Preference: Response block structured data, then Response JSON editor, then
 * the first Agent `responseFormat`. A Response that only names a wrapper object
 * (`run_data`) is filled from that Agent schema rather than hiding it.
 * Returns nothing when none of those exist — the importer must not invent fields.
 */
export function extractOutputSchemaFromBlocks(
  blocks: Record<string, unknown> | null | undefined
): ArenaGenerativeSchemaField[] {
  if (!blocks) return []
  const blockMap = blocks as Record<string, WorkflowBlockRecord>

  let fromResponse: ArenaGenerativeSchemaField[] = []
  for (const block of Object.values(blockMap)) {
    if (block.type !== 'response') continue
    fromResponse = schemaFromResponseBlock(block, blockMap)
    if (fromResponse.length > 0) break
  }

  let fromAgent: ArenaGenerativeSchemaField[] = []
  for (const [blockId, block] of Object.entries(blockMap)) {
    if (block.type !== 'agent') continue
    fromAgent = schemaFromAgentBlock(block, blockId)
    if (fromAgent.length > 0) break
  }

  if (fromResponse.length > 0 && !isShallowObjectStub(fromResponse)) {
    return fromResponse
  }
  if (fromResponse.length > 0 && fromAgent.length > 0) {
    return mergeStubResponseWithAgent(fromResponse, fromAgent)
  }
  if (fromResponse.length > 0) {
    return fromResponse
  }
  return fromAgent
}

function schemaFromResponseBlock(
  block: WorkflowBlockRecord,
  blocks: Record<string, WorkflowBlockRecord>
): ArenaGenerativeSchemaField[] {
  const subBlocks = block.subBlocks
  const dataMode = subBlocks?.dataMode?.value === 'json' ? 'json' : 'structured'

  if (dataMode === 'structured') {
    const fromBuilder = schemaFromBuilderData(subBlocks?.builderData?.value, blocks)
    if (fromBuilder.length > 0) return fromBuilder
  }

  const jsonValue = subBlocks?.data?.value
  if (jsonValue == null || jsonValue === '') return []
  if (typeof jsonValue === 'object') {
    return schemaFromParsedJson(jsonValue)
  }
  if (typeof jsonValue === 'string') {
    const parsed = parseTemplatedJson(jsonValue)
    const fields = parsed === undefined ? [] : schemaFromParsedJson(parsed)
    return expandTopLevelJsonRefs(jsonValue, fields, blocks)
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
    .filter(hasSchemaFieldName)
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

function schemaFromBuilderData(
  value: unknown,
  blocks: Record<string, WorkflowBlockRecord>
): ArenaGenerativeSchemaField[] {
  if (!Array.isArray(value)) return []
  const fields: ArenaGenerativeSchemaField[] = []
  collectBuilderFields(value, '', 0, fields, blocks)
  return fields
}

function collectBuilderFields(
  properties: unknown[],
  prefix: string,
  depth: number,
  fields: ArenaGenerativeSchemaField[],
  blocks: Record<string, WorkflowBlockRecord>
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
      pushUniqueField(fields, { name: path, type: 'array' })
      if (isBuilderArrayItems(record.value)) {
        collectBuilderArrayItems(record.value, `${path}[]`, depth, fields, blocks)
      } else {
        appendValueSchema(record.value, path, fields, blocks)
      }
      continue
    }

    if (type === 'object') {
      pushUniqueField(fields, { name: path, type: 'object' })
      if (isBuilderPropertyList(record.value)) {
        collectBuilderFields(record.value, path, depth + 1, fields, blocks)
      } else {
        appendValueSchema(record.value, path, fields, blocks)
      }
      continue
    }

    const ref = singleBlockRef(record.value)
    if (ref) {
      pushUniqueField(fields, { name: path, type })
      appendResolvedRefSchema(ref, path, fields, blocks)
      continue
    }

    pushUniqueField(fields, { name: path, type })
  }
}

function collectBuilderArrayItems(
  value: unknown[],
  itemPath: string,
  depth: number,
  fields: ArenaGenerativeSchemaField[],
  blocks: Record<string, WorkflowBlockRecord>
): void {
  if (value.length === 0 || fields.length >= MAX_FIELDS) return
  const first = value[0]
  if (!first || typeof first !== 'object') return
  const item = first as { type?: unknown; value?: unknown }
  const itemType = typeof item.type === 'string' ? item.type : ''

  if (itemType === 'object' && isBuilderPropertyList(item.value)) {
    collectBuilderFields(item.value, itemPath, depth, fields, blocks)
    return
  }

  if (itemType === 'object') {
    appendValueSchema(item.value, itemPath, fields, blocks)
    return
  }

  if (itemType && itemType !== 'array') {
    pushUniqueField(fields, { name: itemPath, type: itemType })
  }
}

function appendValueSchema(
  value: unknown,
  path: string,
  fields: ArenaGenerativeSchemaField[],
  blocks: Record<string, WorkflowBlockRecord>
): void {
  const ref = singleBlockRef(value)
  if (ref) {
    appendResolvedRefSchema(ref, path, fields, blocks)
    return
  }

  const parsed = typeof value === 'string' ? parseTemplatedJson(value) : value
  if (parsed === undefined || parsed === null || parsed === '') return
  if (typeof parsed === 'string') {
    const nestedRef = singleBlockRef(parsed)
    if (nestedRef) {
      appendResolvedRefSchema(nestedRef, path, fields, blocks)
    }
    return
  }

  try {
    const nested = outputSchemaFromSample(JSON.stringify(parsed))
    for (const field of prefixOutputSchemaFields(nested, path)) {
      pushUniqueField(fields, field)
    }
  } catch {
    // Builder values that are not JSON stay as the declared object/array name.
  }
}

function expandTopLevelJsonRefs(
  raw: string,
  fields: ArenaGenerativeSchemaField[],
  blocks: Record<string, WorkflowBlockRecord>
): ArenaGenerativeSchemaField[] {
  const refs = extractTopLevelJsonRefs(raw)
  if (refs.length === 0) return fields
  const next = [...fields]
  for (const { key, ref } of refs) {
    const before = next.length
    appendResolvedRefSchema(ref, key, next, blocks)
    if (next.length === before) continue
    const existing = next.find((field) => field.name === key)
    if (existing && existing.type !== 'array') {
      existing.type = 'object'
    }
  }
  return next
}

function extractTopLevelJsonRefs(raw: string): Array<{ key: string; ref: string }> {
  const refs: Array<{ key: string; ref: string }> = []
  const quoted = /"([^"\\]+)"\s*:\s*"<([^>\n]+)>"/g
  const unquoted = /"([^"\\]+)"\s*:\s*<([^>\n]+)>/g
  for (const match of raw.matchAll(quoted)) {
    refs.push({ key: match[1], ref: match[2] })
  }
  for (const match of raw.matchAll(unquoted)) {
    if (!refs.some((entry) => entry.key === match[1])) {
      refs.push({ key: match[1], ref: match[2] })
    }
  }
  return refs
}

function appendResolvedRefSchema(
  ref: string,
  path: string,
  fields: ArenaGenerativeSchemaField[],
  blocks: Record<string, WorkflowBlockRecord>
): void {
  const block = findReferencedBlock(ref, blocks)
  if (!block || block.type !== 'agent') return
  const agentFields = schemaFromAgentBlock(block, path)
  for (const field of prefixOutputSchemaFields(agentFields, path)) {
    pushUniqueField(fields, field)
  }
}

function findReferencedBlock(
  ref: string,
  blocks: Record<string, WorkflowBlockRecord>
): WorkflowBlockRecord | undefined {
  const name = referenceBlockName(ref)
  if (!name) return undefined
  const wanted = normalizeWorkflowBlockName(name)

  for (const [id, block] of Object.entries(blocks)) {
    if (normalizeWorkflowBlockName(id) === wanted) return block
    if (typeof block.name === 'string' && normalizeWorkflowBlockName(block.name) === wanted) {
      return block
    }
  }

  if (wanted === 'agent') {
    const agents = Object.values(blocks).filter((block) => block.type === 'agent')
    if (agents.length === 1) return agents[0]
  }
  return undefined
}

function referenceBlockName(ref: string): string | undefined {
  const parts = ref
    .trim()
    .replace(/^<|>$/g, '')
    .split('.')
    .filter((part) => part.length > 0)
  if (parts.length === 0) return undefined
  if (parts[0] === 'block' && parts[1]) return parts[1]
  return parts[0]
}

function singleBlockRef(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = value.trim().match(/^<([^>\n]+)>$/)
  return match?.[1]
}

function isBuilderPropertyList(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length === 0) return false
  const first = value[0]
  if (!first || typeof first !== 'object' || Array.isArray(first)) return false
  const record = first as { name?: unknown; type?: unknown }
  return typeof record.name === 'string' && typeof record.type === 'string'
}

function isBuilderArrayItems(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length === 0) return false
  const first = value[0]
  if (!first || typeof first !== 'object' || Array.isArray(first)) return false
  const type = (first as { type?: unknown }).type
  return typeof type === 'string' && BUILDER_ITEM_TYPES.has(type)
}

function isShallowObjectStub(fields: ArenaGenerativeSchemaField[]): boolean {
  const named = namedSchemaFields(fields)
  if (named.length === 0) return false
  const hasNested = named.some((field) => field.name.includes('.') || field.name.includes('['))
  if (hasNested) return false
  return named.some((field) => field.type === 'object')
}

/**
 * True when the deployed extract cannot name nested GUI-app paths: nothing
 * declared, a wrapper object (`run_data`), or an array with no item columns.
 * Last-successful-run schema is only used in those cases.
 */
export function declaredOutputSchemaNeedsLastRunFallback(
  fields: ArenaGenerativeSchemaField[]
): boolean {
  const named = namedSchemaFields(fields)
  if (named.length === 0) return true
  const hasNested = named.some((field) => field.name.includes('.') || field.name.includes('['))
  if (hasNested) return false
  return named.some((field) => field.type === 'object' || field.type === 'array')
}

function mergeStubResponseWithAgent(
  responseFields: ArenaGenerativeSchemaField[],
  agentFields: ArenaGenerativeSchemaField[]
): ArenaGenerativeSchemaField[] {
  const objectRoots = namedSchemaFields(responseFields).filter(
    (field) => field.type === 'object' && !field.name.includes('.') && !field.name.includes('[')
  )
  const merged = [...responseFields]
  const toMerge =
    objectRoots.length === 1
      ? prefixOutputSchemaFields(agentFields, objectRoots[0].name)
      : agentFields
  for (const field of toMerge) {
    pushUniqueField(merged, field)
  }
  return merged.slice(0, MAX_FIELDS)
}

function pushUniqueField(
  fields: ArenaGenerativeSchemaField[],
  field: ArenaGenerativeSchemaField
): void {
  if (fields.length >= MAX_FIELDS) return
  if (fields.some((existing) => existing.name === field.name)) return
  fields.push(field)
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
