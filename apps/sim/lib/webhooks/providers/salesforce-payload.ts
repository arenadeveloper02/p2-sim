import { isRecordLike } from '@sim/utils/object'

/**
 * Reads the Salesforce sObject type from a webhook body without pulling the
 * Node-backed provider (HMAC / fingerprint) into the client trigger graph.
 */
export function extractSalesforceObjectTypeFromPayload(
  body: Record<string, unknown>
): string | undefined {
  const direct =
    (typeof body.objectType === 'string' && body.objectType) ||
    (typeof body.sobjectType === 'string' && body.sobjectType) ||
    undefined
  if (direct) {
    return direct
  }

  const attrs = body.attributes as Record<string, unknown> | undefined
  if (typeof attrs?.type === 'string') {
    return attrs.type
  }

  const record = body.record
  if (isRecordLike(record)) {
    const nested = record as Record<string, unknown>
    if (typeof nested.sobjectType === 'string') {
      return nested.sobjectType
    }
    const recordAttrs = nested.attributes as Record<string, unknown> | undefined
    if (typeof recordAttrs?.type === 'string') {
      return recordAttrs.type
    }
  }

  return undefined
}
