import type { SubBlockConfig } from '@/blocks/types'
import { TRIGGER_REGISTRY } from '@/triggers/registry'
import type { TriggerConfig } from '@/triggers/types'

/**
 * IDs that should NOT be namespaced because they are shared across triggers
 * or are the control mechanism for trigger selection
 */
const SHARED_SUBBLOCK_IDS = new Set(['selectedTriggerId'])

/**
 * Generates mock data based on the output type definition.
 *
 * These mock-payload helpers live here (rather than in `trigger-utils`, which
 * eagerly imports the block registry) so `@/triggers` never pulls `@/blocks`
 * before `TRIGGER_REGISTRY` initializes — which would trip a temporal-dead-zone
 * error when a block calls `getTrigger()` at module load.
 */
function generateMockValue(type: string, _description?: string, fieldName?: string): unknown {
  const name = fieldName || 'value'

  switch (type) {
    case 'string':
      return `mock_${name}`

    case 'number':
      return 42

    case 'boolean':
      return true

    case 'array':
      return [
        {
          id: 'item_1',
          name: 'Sample Item',
          value: 'Sample Value',
        },
      ]

    case 'json':
    case 'object':
      return {
        id: 'sample_id',
        name: 'Sample Object',
        status: 'active',
      }

    default:
      return null
  }
}

/**
 * Recursively processes nested output structures, expanding JSON-Schema-style
 * objects/arrays that define `properties` or `items` instead of returning
 * a generic placeholder.
 */
function processOutputField(key: string, field: unknown, depth = 0, maxDepth = 10): unknown {
  if (depth > maxDepth) {
    return null
  }

  if (
    field &&
    typeof field === 'object' &&
    'type' in field &&
    typeof (field as Record<string, unknown>).type === 'string'
  ) {
    const typedField = field as {
      type: string
      description?: string
      properties?: Record<string, unknown>
      items?: unknown
    }

    if (
      (typedField.type === 'object' || typedField.type === 'json') &&
      typedField.properties &&
      typeof typedField.properties === 'object'
    ) {
      const nestedObject: Record<string, unknown> = {}
      for (const [nestedKey, nestedField] of Object.entries(typedField.properties)) {
        nestedObject[nestedKey] = processOutputField(nestedKey, nestedField, depth + 1, maxDepth)
      }
      return nestedObject
    }

    if (typedField.type === 'array' && typedField.items && typeof typedField.items === 'object') {
      const itemValue = processOutputField(`${key}_item`, typedField.items, depth + 1, maxDepth)
      return [itemValue]
    }

    return generateMockValue(typedField.type, typedField.description, key)
  }

  if (field && typeof field === 'object' && !Array.isArray(field)) {
    const nestedObject: Record<string, unknown> = {}
    for (const [nestedKey, nestedField] of Object.entries(field)) {
      nestedObject[nestedKey] = processOutputField(nestedKey, nestedField, depth + 1, maxDepth)
    }
    return nestedObject
  }

  return null
}

/**
 * Generates a mock payload based on outputs definition
 */
export function generateMockPayloadFromOutputsDefinition(
  outputs: Record<string, unknown>
): Record<string, unknown> {
  const mockPayload: Record<string, unknown> = {}

  for (const [key, output] of Object.entries(outputs)) {
    if (key === 'visualization') {
      continue
    }
    mockPayload[key] = processOutputField(key, output)
  }

  return mockPayload
}

/**
 * Checks if a subBlock is display-only (not user-editable).
 * Display-only subBlocks should be namespaced to avoid conflicts when
 * multiple triggers show different content for the same conceptual field.
 */
function isDisplayOnlySubBlock(subBlock: SubBlockConfig): boolean {
  // Text type is always display-only
  if (subBlock.type === 'text') {
    return true
  }

  // ReadOnly inputs are display-only
  if (subBlock.readOnly === true) {
    return true
  }

  return false
}

/**
 * Namespaces a subBlock ID with the trigger ID to avoid conflicts when
 * multiple triggers are merged into a single block.
 *
 * Only namespaces display-only subBlocks (readOnly or text type) that have
 * a condition on selectedTriggerId. User-input fields are NOT namespaced
 * so their values persist when switching between triggers.
 */
function namespaceSubBlockId(subBlock: SubBlockConfig, triggerId: string): SubBlockConfig {
  // Don't namespace shared IDs
  if (SHARED_SUBBLOCK_IDS.has(subBlock.id)) {
    return subBlock
  }

  // Only namespace display-only subBlocks to avoid content conflicts
  // User-input fields should remain shared so values persist across trigger switches
  if (!isDisplayOnlySubBlock(subBlock)) {
    return subBlock
  }

  // Only namespace if the subBlock has a condition on selectedTriggerId
  // These are the ones that are trigger-specific and will conflict when merged
  const condition =
    typeof subBlock.condition === 'function' ? subBlock.condition() : subBlock.condition
  if (condition?.field === 'selectedTriggerId') {
    return {
      ...subBlock,
      id: `${subBlock.id}_${triggerId}`,
    }
  }

  return subBlock
}

/**
 * Gets a trigger config and injects samplePayload subblock with condition.
 * Also namespaces subBlock IDs to avoid conflicts when multiple triggers
 * are merged into a single block (e.g., ...getTrigger('a').subBlocks, ...getTrigger('b').subBlocks).
 */
export function getTrigger(triggerId: string): TriggerConfig {
  const trigger = TRIGGER_REGISTRY[triggerId]
  if (!trigger) {
    throw new Error(`Trigger not found: ${triggerId}`)
  }

  // Filter out deprecated trigger-save subblocks from legacy stored data
  const subBlocks = trigger.subBlocks
    .filter(
      (subBlock) => subBlock.id !== 'triggerSave' && (subBlock.type as string) !== 'trigger-save'
    )
    .map((subBlock) => namespaceSubBlockId(subBlock, triggerId))

  const clonedTrigger = { ...trigger, subBlocks }

  // Inject samplePayload for webhooks/pollers with condition
  if (trigger.webhook || trigger.id.includes('webhook') || trigger.id.includes('poller')) {
    const samplePayloadExists = clonedTrigger.subBlocks.some(
      (sb) => sb.id === 'samplePayload' || sb.id === `samplePayload_${triggerId}`
    )

    if (!samplePayloadExists && trigger.outputs) {
      const mockPayload = generateMockPayloadFromOutputsDefinition(trigger.outputs)
      const generatedPayload = JSON.stringify(mockPayload, null, 2)

      const samplePayloadSubBlock: SubBlockConfig = {
        id: `samplePayload_${triggerId}`,
        title: 'Event Payload Example',
        type: 'code',
        language: 'json',
        defaultValue: generatedPayload,
        readOnly: true,
        collapsible: true,
        defaultCollapsed: true,
        hideFromPreview: true,
        mode: 'trigger',
        condition: {
          field: 'selectedTriggerId',
          value: trigger.id,
        },
      }

      clonedTrigger.subBlocks.push(samplePayloadSubBlock)
    }
  }

  return clonedTrigger
}

export function getTriggersByProvider(provider: string): TriggerConfig[] {
  return Object.values(TRIGGER_REGISTRY)
    .filter((trigger) => trigger.provider === provider)
    .map((trigger) => getTrigger(trigger.id))
}

export function getAllTriggers(): TriggerConfig[] {
  return Object.keys(TRIGGER_REGISTRY).map((triggerId) => getTrigger(triggerId))
}

export function getTriggerIds(): string[] {
  return Object.keys(TRIGGER_REGISTRY)
}

export function isTriggerValid(triggerId: string): boolean {
  return triggerId in TRIGGER_REGISTRY
}

export type { TriggerConfig } from '@/triggers/types'

/**
 * Options for building trigger subBlocks
 */
export interface BuildTriggerSubBlocksOptions {
  /** The trigger ID (e.g., 'lemlist_email_replied') */
  triggerId: string
  /** Dropdown options for selecting trigger type */
  triggerOptions: Array<{ label: string; id: string }>
  /** Whether to include the trigger type dropdown (only for primary trigger) */
  includeDropdown?: boolean
  /** HTML setup instructions to display */
  setupInstructions: string
  /** Additional fields to insert before the save button (e.g., campaign filters) */
  extraFields?: SubBlockConfig[]
  /** Webhook URL placeholder text */
  webhookPlaceholder?: string
}

/**
 * Generic builder for trigger subBlocks.
 * Creates a consistent structure: [dropdown?] -> webhookUrl -> extraFields -> instructions
 *
 * Usage:
 * - Primary trigger: `buildTriggerSubBlocks({ ...options, includeDropdown: true })`
 * - Secondary triggers: `buildTriggerSubBlocks({ ...options })` (no dropdown)
 *
 * @example
 * ```typescript
 * // Primary trigger (with dropdown)
 * subBlocks: buildTriggerSubBlocks({
 *   triggerId: 'service_event_a',
 *   triggerOptions: serviceTriggerOptions,
 *   includeDropdown: true,
 *   setupInstructions: serviceSetupInstructions('eventA'),
 * })
 *
 * // Secondary trigger (no dropdown)
 * subBlocks: buildTriggerSubBlocks({
 *   triggerId: 'service_event_b',
 *   triggerOptions: serviceTriggerOptions,
 *   setupInstructions: serviceSetupInstructions('eventB'),
 * })
 * ```
 */
export function buildTriggerSubBlocks(options: BuildTriggerSubBlocksOptions): SubBlockConfig[] {
  const {
    triggerId,
    triggerOptions,
    includeDropdown = false,
    setupInstructions,
    extraFields = [],
    webhookPlaceholder = 'Webhook URL will be generated',
  } = options

  const blocks: SubBlockConfig[] = []

  // Only the primary trigger includes the dropdown
  if (includeDropdown) {
    blocks.push({
      id: 'selectedTriggerId',
      title: 'Trigger Type',
      type: 'dropdown',
      mode: 'trigger',
      options: triggerOptions,
      value: () => triggerId,
      required: true,
    })
  }

  // Webhook URL display (common to all triggers)
  // ID will be namespaced by getTrigger() when merged into blocks
  blocks.push({
    id: 'webhookUrlDisplay',
    title: 'Webhook URL',
    type: 'short-input',
    readOnly: true,
    showCopyButton: true,
    useWebhookUrl: true,
    placeholder: webhookPlaceholder,
    mode: 'trigger',
    condition: { field: 'selectedTriggerId', value: triggerId },
  })

  // Insert any extra fields (campaign filters, event types, etc.)
  if (extraFields.length > 0) {
    blocks.push(...extraFields)
  }

  // Setup instructions
  // ID will be namespaced by getTrigger() when merged into blocks
  blocks.push({
    id: 'triggerInstructions',
    title: 'Setup Instructions',
    hideFromPreview: true,
    type: 'text',
    defaultValue: setupInstructions,
    mode: 'trigger',
    condition: { field: 'selectedTriggerId', value: triggerId },
  })

  return blocks
}
