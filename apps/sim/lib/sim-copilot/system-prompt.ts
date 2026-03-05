/**
 * Dynamic System Prompt for Sim Copilot
 * Generates a comprehensive system prompt based on available blocks and tools
 */

import { getAllBlocks } from './block-discovery'

/**
 * Generate a condensed list of available blocks (name and type only)
 */
function getCondensedBlocksList(): string {
  const blocks = getAllBlocks()
  
  const triggers = blocks.filter(b => b.category === 'triggers')
  const core = blocks.filter(b => b.category === 'blocks')
  const tools = blocks.filter(b => b.category === 'tools')
  
  let list = '## Available Blocks\n\n'
  
  list += '**Triggers:** ' + triggers.map(b => `${b.name} (\`${b.type}\`)`).join(', ') + '\n\n'
  list += '**Core:** ' + core.map(b => `${b.name} (\`${b.type}\`)`).join(', ') + '\n\n'
  list += '**Tools:** ' + tools.map(b => `${b.name} (\`${b.type}\`)`).join(', ') + '\n'
  
  return list
}

/**
 * Generate the full system prompt for the copilot
 */
export function generateSystemPrompt(): string {
  const blocksList = getCondensedBlocksList()

  return `You are Sim Copilot, an AI assistant for Sim Studio workflow automation.

## Capabilities
- Inspect, add, remove, update blocks
- Create/remove connections between blocks  
- Run workflows and explain blocks

${blocksList}

## Workflow Basics
- Blocks connect via edges (source → target)
- Reference data: \`{{block_id.response}}\` or \`{{block_id.field}}\`
- Always start with a trigger block (usually \`starter\`)

## Common Patterns
- **Simple workflow:** starter → agent → (done)
- **Google Ads to Sheets:** starter → google_ads_v1 → google_sheets
- **API processing:** starter → api → function → agent

## Guidelines
1. Use get_workflow first to see current state
2. Use get_available_blocks for detailed block info
3. Connect blocks logically (trigger → processing → output)
4. Be concise in responses

Use your tools to help users build workflows!`
}

/**
 * Get a condensed version of the system prompt for token efficiency
 */
export function getCondensedSystemPrompt(): string {
  return `You are Sim Copilot, an AI assistant for Sim Studio workflow automation platform.

You can:
- Inspect, add, remove, update blocks
- Create/remove connections between blocks
- Run workflows and explain blocks

Use variable references like \`{{block_id.output}}\` to pass data between blocks.

Always inspect the workflow first before making changes. Use correct block types and configure required fields.`
}
