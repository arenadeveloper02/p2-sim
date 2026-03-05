/**
 * Dynamic Block Discovery System for Sim Copilot
 * Reads all blocks from the registry and provides structured information
 */

import { registry, getAllBlockTypes } from '@/blocks/registry'
import type { BlockConfig, SubBlockConfig } from '@/blocks/types'

export interface BlockInfo {
  type: string
  name: string
  description: string
  category: string
  subBlocks: SubBlockInfo[]
  inputs: Record<string, { type: string; description?: string }>
  outputs: Record<string, string>
  tools: string[]
}

export interface SubBlockInfo {
  id: string
  title?: string
  type: string
  required?: boolean
  defaultValue?: any
  options?: { label: string; id: string }[]
  placeholder?: string
  description?: string
}

/**
 * Get all available blocks with their configurations
 */
export function getAllBlocks(): BlockInfo[] {
  const blockTypes = getAllBlockTypes()
  
  return blockTypes.map(type => {
    const config = registry[type]
    if (!config) return null
    
    return extractBlockInfo(type, config)
  }).filter(Boolean) as BlockInfo[]
}

/**
 * Get a specific block's information
 */
export function getBlockInfo(type: string): BlockInfo | null {
  const config = registry[type]
  if (!config) return null
  
  return extractBlockInfo(type, config)
}

/**
 * Extract block information from config
 */
function extractBlockInfo(type: string, config: BlockConfig): BlockInfo {
  const subBlocks: SubBlockInfo[] = config.subBlocks.map(sb => ({
    id: sb.id,
    title: sb.title,
    type: sb.type,
    required: typeof sb.required === 'boolean' ? sb.required : false,
    defaultValue: sb.defaultValue,
    options: typeof sb.options === 'function' ? undefined : sb.options?.map(o => ({ label: o.label, id: o.id })),
    placeholder: sb.placeholder,
    description: sb.description,
  }))

  const inputs: Record<string, { type: string; description?: string }> = {}
  if (config.inputs) {
    for (const [key, value] of Object.entries(config.inputs)) {
      inputs[key] = {
        type: value.type,
        description: value.description,
      }
    }
  }

  const outputs: Record<string, string> = {}
  if (config.outputs) {
    for (const [key, value] of Object.entries(config.outputs)) {
      if (typeof value === 'string') {
        outputs[key] = value
      } else if (typeof value === 'object' && 'type' in value) {
        outputs[key] = value.type
      }
    }
  }

  return {
    type,
    name: config.name,
    description: config.description,
    category: config.category,
    subBlocks,
    inputs,
    outputs,
    tools: config.tools?.access || [],
  }
}

/**
 * Get blocks by category
 */
export function getBlocksByCategory(category: 'blocks' | 'tools' | 'triggers'): BlockInfo[] {
  return getAllBlocks().filter(block => block.category === category)
}

/**
 * Get a summary of all blocks for the system prompt
 */
export function getBlocksSummary(): string {
  const blocks = getAllBlocks()
  
  const categories = {
    triggers: blocks.filter(b => b.category === 'triggers'),
    blocks: blocks.filter(b => b.category === 'blocks'),
    tools: blocks.filter(b => b.category === 'tools'),
  }

  let summary = '## Available Blocks\n\n'

  // Triggers
  summary += '### Triggers (Start points for workflows)\n'
  for (const block of categories.triggers) {
    summary += `- **${block.name}** (\`${block.type}\`): ${block.description}\n`
  }
  summary += '\n'

  // Core Blocks
  summary += '### Core Blocks (Logic and processing)\n'
  for (const block of categories.blocks) {
    summary += `- **${block.name}** (\`${block.type}\`): ${block.description}\n`
  }
  summary += '\n'

  // Integration Tools
  summary += '### Integration Tools (External services)\n'
  for (const block of categories.tools) {
    summary += `- **${block.name}** (\`${block.type}\`): ${block.description}\n`
  }

  return summary
}

/**
 * Get detailed configuration for a block type
 */
export function getBlockConfigDetails(type: string): string {
  const block = getBlockInfo(type)
  if (!block) return `Block type "${type}" not found.`

  let details = `## ${block.name} (\`${block.type}\`)\n\n`
  details += `**Description:** ${block.description}\n\n`
  details += `**Category:** ${block.category}\n\n`

  if (block.subBlocks.length > 0) {
    details += '### Configuration Fields:\n'
    for (const sb of block.subBlocks) {
      const required = sb.required ? ' (required)' : ''
      const defaultVal = sb.defaultValue !== undefined ? ` [default: ${JSON.stringify(sb.defaultValue)}]` : ''
      details += `- **${sb.title || sb.id}** (\`${sb.id}\`): ${sb.type}${required}${defaultVal}\n`
      if (sb.description) {
        details += `  - ${sb.description}\n`
      }
      if (sb.options && sb.options.length > 0) {
        details += `  - Options: ${sb.options.map(o => o.label).join(', ')}\n`
      }
    }
    details += '\n'
  }

  if (Object.keys(block.inputs).length > 0) {
    details += '### Inputs:\n'
    for (const [key, value] of Object.entries(block.inputs)) {
      details += `- **${key}**: ${value.type}${value.description ? ` - ${value.description}` : ''}\n`
    }
    details += '\n'
  }

  if (Object.keys(block.outputs).length > 0) {
    details += '### Outputs:\n'
    for (const [key, value] of Object.entries(block.outputs)) {
      details += `- **${key}**: ${value}\n`
    }
  }

  return details
}
