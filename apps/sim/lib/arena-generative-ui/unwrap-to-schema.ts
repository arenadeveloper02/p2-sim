import {
  namedSchemaFields,
  outputSchemaRootName,
  unwrapPastedSample,
} from '@/lib/arena-generative-ui/output-schema'
import { omitTelemetrySchemaFields, parseJsonLiteral } from '@/lib/arena-generative-ui/types'

const MAX_UNWRAP_DEPTH = 6

const ENVELOPE_PREFIXES = new Set(['data', 'output', 'result', 'response', 'body'])

const WRAPPER_OBJECT_KEYS = ENVELOPE_PREFIXES

/**
 * Business keys the host should land on after peeling envelopes. Common
 * `output.` / `data.` prefixes are stripped when every path uses them.
 */
export function schemaAnchors(schema: Array<{ name: string }> | undefined): Set<string> {
  const named = omitTelemetrySchemaFields(namedSchemaFields(schema))
  let names = named.map((field) => field.name.trim()).filter(Boolean)

  while (names.length > 0) {
    const roots = new Set(names.map((name) => outputSchemaRootName(name)).filter(Boolean))
    if (roots.size !== 1) break
    const prefix = [...roots][0]
    if (!prefix || !ENVELOPE_PREFIXES.has(prefix)) break
    const hasChild = names.some(
      (name) => name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}[`)
    )
    if (!hasChild) break
    names = names
      .map((name) => stripPrefix(name, prefix))
      .filter((name) => name.length > 0 && name !== prefix)
  }

  const anchors = new Set<string>()
  for (const name of names) {
    const root = outputSchemaRootName(name)
    if (root) anchors.add(root)
    const leaf = lastPathSegment(name)
    if (leaf) anchors.add(leaf)
  }
  return anchors
}

/**
 * Peels `{ ok, data }`, Response `{ data, status, headers }`, and singleton
 * object wrappers until the payload’s own keys overlap schema anchors.
 */
export function unwrapPayloadToSchema(
  data: unknown,
  schema?: Array<{ name: string }>
): unknown {
  const coerced = coerceJson(data)
  const mechanical = unwrapPastedSample(coerced)
  const anchors = schemaAnchors(schema)
  if (anchors.size === 0) {
    return mechanical
  }
  return walkToAnchors(mechanical, anchors, 0)
}

function walkToAnchors(node: unknown, anchors: Set<string>, depth: number): unknown {
  if (depth > MAX_UNWRAP_DEPTH || !isPlainRecord(node)) {
    return node
  }
  let best: unknown = node
  let bestScore = scoreRecord(node, anchors)

  for (const child of wrapperChildren(node)) {
    const peeled = walkToAnchors(child, anchors, depth + 1)
    const nextScore = isPlainRecord(peeled) ? scoreRecord(peeled, anchors) : 0
    if (nextScore > bestScore) {
      best = peeled
      bestScore = nextScore
    }
  }
  return best
}

function wrapperChildren(record: Record<string, unknown>): unknown[] {
  const children: unknown[] = []
  for (const key of WRAPPER_OBJECT_KEYS) {
    const value = record[key]
    if (isPlainRecord(value)) {
      children.push(value)
    }
  }
  return children
}

function scoreRecord(record: Record<string, unknown>, anchors: Set<string>): number {
  let score = 0
  for (const key of Object.keys(record)) {
    if (anchors.has(key)) score += 1
  }
  return score
}

function coerceJson(data: unknown): unknown {
  if (typeof data !== 'string') {
    return data
  }
  const parsed = parseJsonLiteral(data)
  return parsed === undefined ? data : parsed
}

function stripPrefix(name: string, prefix: string): string {
  if (name === prefix) return ''
  if (name.startsWith(`${prefix}.`)) return name.slice(prefix.length + 1)
  if (name.startsWith(`${prefix}[]`)) return name.slice(prefix.length)
  return name
}

function lastPathSegment(path: string): string {
  const parts = path
    .replace(/\[\]/g, '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
