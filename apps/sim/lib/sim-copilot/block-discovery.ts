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

// === UNIVERSAL BLOCK CONFIGURATION SYSTEM ===

export interface UniversalBlockConfig {
  category: 'data_source' | 'processing' | 'destination' | 'trigger'
  defaultConfig: Record<string, any>
  configGenerator: (userRequest: string, context?: any) => Record<string, any>
  commonUses: string[]
  keywords: string[]
}

export const UNIVERSAL_BLOCK_CONFIGS: Record<string, UniversalBlockConfig> = {
  // === AD PLATFORMS ===
  'google_ads_v1': {
    category: 'data_source',
    defaultConfig: {
      query: 'SELECT campaign_name, impressions, clicks, cost FROM campaign WHERE date DURING LAST_30_DAYS',
      account_id: '',
      date_range: 'LAST_30_DAYS',
      metrics: ['impressions', 'clicks', 'cost', 'conversions'],
      dimensions: ['campaign', 'date', 'device']
    },
    configGenerator: (userRequest) => generateGoogleAdsConfig(userRequest),
    commonUses: ['campaign analysis', 'performance tracking', 'ppc optimization'],
    keywords: ['google ads', 'adwords', 'ppc', 'campaign', 'impressions', 'clicks']
  },

  'facebook_ads': {
    category: 'data_source',
    defaultConfig: {
      endpoint: '/me/insights',
      fields: ['campaign_name', 'spend', 'impressions', 'clicks'],
      date_preset: 'last_30d',
      account_id: ''
    },
    configGenerator: (userRequest) => generateFacebookAdsConfig(userRequest),
    commonUses: ['social media ads', 'facebook campaigns', 'meta ads'],
    keywords: ['facebook ads', 'meta ads', 'social ads', 'campaign performance']
  },

  // === DATABASES ===
  'mysql': {
    category: 'data_source',
    defaultConfig: {
      query: 'SELECT * FROM table_name LIMIT 100',
      connection_id: '',
      operation: 'read'
    },
    configGenerator: (userRequest) => generateDatabaseConfig(userRequest, 'mysql'),
    commonUses: ['database queries', 'data extraction', 'mysql operations'],
    keywords: ['mysql', 'database', 'sql', 'query', 'table']
  },

  'postgresql': {
    category: 'data_source',
    defaultConfig: {
      query: 'SELECT * FROM table_name LIMIT 100',
      connection_id: '',
      operation: 'read'
    },
    configGenerator: (userRequest) => generateDatabaseConfig(userRequest, 'postgresql'),
    commonUses: ['postgres queries', 'data analysis', 'postgresql'],
    keywords: ['postgresql', 'postgres', 'database', 'sql']
  },

  'mongodb': {
    category: 'data_source',
    defaultConfig: {
      collection: 'documents',
      operation: 'find',
      query: '{}',
      limit: 100
    },
    configGenerator: (userRequest) => generateMongoDBConfig(userRequest),
    commonUses: ['nosql queries', 'document database', 'mongodb'],
    keywords: ['mongodb', 'mongo', 'nosql', 'document', 'collection']
  },

  // === AI/PROCESSING BLOCKS ===
  'agent': {
    category: 'processing',
    defaultConfig: {
      system_prompt: 'You are a helpful AI assistant.',
      model: 'gpt-4',
      temperature: 0.7,
      instructions: 'Analyze the input data and provide insights.'
    },
    configGenerator: (userRequest) => generateAgentConfig(userRequest),
    commonUses: ['ai analysis', 'data processing', 'content generation'],
    keywords: ['agent', 'ai', 'analysis', 'processing', 'intelligence']
  },

  'function': {
    category: 'processing',
    defaultConfig: {
      code: '// Write your JavaScript code here\nreturn input;',
      language: 'javascript'
    },
    configGenerator: (userRequest) => generateFunctionConfig(userRequest),
    commonUses: ['custom logic', 'data transformation', 'javascript'],
    keywords: ['function', 'code', 'javascript', 'transform', 'logic']
  },

  // === COMMUNICATION BLOCKS ===
  'slack': {
    category: 'destination',
    defaultConfig: {
      channel: '#general',
      message: 'Workflow completed successfully',
      webhook_url: ''
    },
    configGenerator: (userRequest) => generateSlackConfig(userRequest),
    commonUses: ['team notifications', 'slack alerts', 'workflow updates'],
    keywords: ['slack', 'notification', 'message', 'team', 'channel']
  },

  'gmail': {
    category: 'destination',
    defaultConfig: {
      to: ['user@example.com'],
      subject: 'Workflow Notification',
      body: 'Your workflow has completed.',
      operation: 'send'
    },
    configGenerator: (userRequest) => generateEmailConfig(userRequest),
    commonUses: ['email notifications', 'gmail automation', 'email alerts'],
    keywords: ['gmail', 'email', 'notification', 'send', 'mail']
  },

  'discord': {
    category: 'destination',
    defaultConfig: {
      channel_id: '',
      message: 'Workflow update',
      webhook_url: ''
    },
    configGenerator: (userRequest) => generateDiscordConfig(userRequest),
    commonUses: ['discord notifications', 'gaming alerts', 'community updates'],
    keywords: ['discord', 'notification', 'message', 'community']
  },

  // === STORAGE BLOCKS ===
  'google_sheets': {
    category: 'destination',
    defaultConfig: {
      spreadsheet_id: '',
      range: 'Sheet1!A:Z',
      operation: 'write',
      create_if_missing: true
    },
    configGenerator: (userRequest) => generateSheetsConfig(userRequest),
    commonUses: ['spreadsheet data', 'excel export', 'data storage'],
    keywords: ['sheets', 'spreadsheet', 'excel', 'data export', 'table']
  },

  's3': {
    category: 'destination',
    defaultConfig: {
      bucket: '',
      key: '',
      operation: 'upload',
      content_type: 'application/json'
    },
    configGenerator: (userRequest) => generateS3Config(userRequest),
    commonUses: ['file storage', 'aws s3', 'cloud storage'],
    keywords: ['s3', 'aws', 'storage', 'upload', 'bucket']
  },

  // === API BLOCKS ===
  'api': {
    category: 'data_source',
    defaultConfig: {
      url: 'https://api.example.com/data',
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    },
    configGenerator: (userRequest) => generateAPIConfig(userRequest),
    commonUses: ['api calls', 'web services', 'data fetching'],
    keywords: ['api', 'rest', 'http', 'web service', 'endpoint']
  },

  'github': {
    category: 'data_source',
    defaultConfig: {
      endpoint: '/user/repos',
      method: 'GET',
      authentication: 'token'
    },
    configGenerator: (userRequest) => generateGitHubConfig(userRequest),
    commonUses: ['github data', 'repository info', 'git operations'],
    keywords: ['github', 'git', 'repository', 'code', 'devops']
  },

  // === ANALYTICS BLOCKS ===
  'google_analytics': {
    category: 'data_source',
    defaultConfig: {
      view_id: '',
      metrics: ['ga:sessions', 'ga:users'],
      dimensions: ['ga:date'],
      start_date: '30daysAgo',
      end_date: 'today'
    },
    configGenerator: (userRequest) => generateAnalyticsConfig(userRequest),
    commonUses: ['website analytics', 'traffic analysis', 'google analytics'],
    keywords: ['analytics', 'google analytics', 'website traffic', 'metrics']
  },

  // === CONTENT BLOCKS ===
  'youtube': {
    category: 'data_source',
    defaultConfig: {
      operation: 'search',
      query: '',
      max_results: 10
    },
    configGenerator: (userRequest) => generateYouTubeConfig(userRequest),
    commonUses: ['video data', 'youtube analytics', 'content analysis'],
    keywords: ['youtube', 'video', 'content', 'media']
  },

  // === TRIGGER BLOCKS ===
  'starter': {
    category: 'trigger',
    defaultConfig: {},
    configGenerator: () => ({}),
    commonUses: ['workflow start', 'manual trigger'],
    keywords: ['start', 'begin', 'trigger', 'manual']
  },

  'schedule': {
    category: 'trigger',
    defaultConfig: {
      cron: '0 9 * * *', // Daily at 9 AM
      timezone: 'UTC'
    },
    configGenerator: (userRequest) => generateScheduleConfig(userRequest),
    commonUses: ['scheduled workflows', 'cron jobs', 'time-based triggers'],
    keywords: ['schedule', 'cron', 'time', 'daily', 'hourly']
  }
}

// === CONFIGURATION GENERATORS ===

function generateGoogleAdsConfig(userRequest: string): Record<string, any> {
  // Generate DYNAMIC question based on user request
  let dynamicQuestion = ''
  
  if (userRequest.includes('campaign')) {
    dynamicQuestion = 'Show me campaign performance'
  } else if (userRequest.includes('keywords')) {
    dynamicQuestion = 'Show me keyword performance'
  } else if (userRequest.includes('ads') || userRequest.includes('ad performance')) {
    dynamicQuestion = 'Show me ad performance'
  } else if (userRequest.includes('conversions')) {
    dynamicQuestion = 'Show me conversion data'
  } else if (userRequest.includes('cost') || userRequest.includes('spending')) {
    dynamicQuestion = 'Show me cost analysis'
  } else {
    dynamicQuestion = 'Show me campaign performance' // Default
  }
  
  // Extract date range dynamically
  if (userRequest.includes('today')) {
    dynamicQuestion += ' for today'
  } else if (userRequest.includes('yesterday')) {
    dynamicQuestion += ' for yesterday'
  } else if (userRequest.includes('7 days') || userRequest.includes('week')) {
    dynamicQuestion += ' for last 7 days'
  } else if (userRequest.includes('30 days') || userRequest.includes('month')) {
    dynamicQuestion += ' for last 30 days'
  } else {
    dynamicQuestion += ' for last 30 days' // Default
  }
  
  // Extract specific metrics
  if (userRequest.includes('clicks') && userRequest.includes('impressions')) {
    dynamicQuestion += ' including clicks and impressions'
  } else if (userRequest.includes('conversions')) {
    dynamicQuestion += ' including conversions'
  } else if (userRequest.includes('cost')) {
    dynamicQuestion += ' including cost data'
  }
  
  // Map to actual sub-block field names for Google Ads block
  return {
    accounts: '', // User will select account
    question: dynamicQuestion, // DYNAMIC question based on user request
  }
}

function generateFacebookAdsConfig(userRequest: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS.facebook_ads.defaultConfig }
  
  // Extract fields from user request
  if (userRequest.includes('spend')) config.fields.push('spend')
  if (userRequest.includes('impressions')) config.fields.push('impressions')
  if (userRequest.includes('clicks')) config.fields.push('clicks')
  if (userRequest.includes('conversions')) config.fields.push('conversions')
  
  return config
}

function generateDatabaseConfig(userRequest: string, dbType: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS[dbType].defaultConfig }
  
  // Extract table name
  const tableMatch = userRequest.match(/from\s+(\w+)/i) || userRequest.match(/(\w+)\s+table/i)
  if (tableMatch) {
    if (dbType === 'mysql' || dbType === 'postgresql') {
      config.query = config.query.replace('table_name', tableMatch[1])
    } else if (dbType === 'mongodb') {
      config.collection = tableMatch[1]
    }
  }
  
  return config
}

function generateMongoDBConfig(userRequest: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS.mongodb.defaultConfig }
  
  // Extract collection name
  const collectionMatch = userRequest.match(/(\w+)\s+collection/i)
  if (collectionMatch) {
    config.collection = collectionMatch[1]
  }
  
  return config
}

function generateAgentConfig(userRequest: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS.agent.defaultConfig }
  
  // Generate context-aware system prompt
  if (userRequest.includes('analyze')) {
    config.system_prompt = 'You are a data analysis expert. Analyze the input data and provide actionable insights.'
  } else if (userRequest.includes('summarize')) {
    config.system_prompt = 'You are a content summarization expert. Create concise and informative summaries.'
  } else if (userRequest.includes('translate')) {
    config.system_prompt = 'You are a translation expert. Translate content accurately while preserving meaning.'
  } else if (userRequest.includes('marketing')) {
    config.system_prompt = 'You are a marketing analytics expert. Provide insights on marketing performance and recommendations.'
  }
  
  // Map to actual sub-block field names for Agent block
  return {
    messages: [
      {
        role: 'system',
        content: config.system_prompt
      },
      {
        role: 'user', 
        content: config.instructions
      }
    ],
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.max_tokens || 4000
  }
}

function generateFunctionConfig(userRequest: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS.function.defaultConfig }
  
  // Generate context-aware code template
  if (userRequest.includes('transform') || userRequest.includes('convert')) {
    config.code = `// Transform input data
const transformed = input.map(item => ({
  ...item,
  processed: true,
  timestamp: new Date().toISOString()
}))

return transformed`
  } else if (userRequest.includes('filter')) {
    config.code = `// Filter input data
const filtered = input.filter(item => {
  // Add your filter conditions here
  return item.active === true
})

return filtered`
  } else if (userRequest.includes('aggregate') || userRequest.includes('sum')) {
    config.code = `// Aggregate input data
const aggregated = input.reduce((acc, item) => {
  const key = item.category || 'default'
  acc[key] = (acc[key] || 0) + (item.value || 1)
  return acc
}, {})

return aggregated`
  }
  
  return config
}

function generateSlackConfig(userRequest: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS.slack.defaultConfig }
  
  // Extract channel
  const channelMatch = userRequest.match(/#(\w+)/)
  if (channelMatch) {
    config.channel = `#${channelMatch[1]}`
  }
  
  // Generate context-aware message
  if (userRequest.includes('report') || userRequest.includes('summary')) {
    config.message = '📊 Report is ready for review'
  } else if (userRequest.includes('alert') || userRequest.includes('error')) {
    config.message = '🚨 Alert: Action required'
  } else if (userRequest.includes('success') || userRequest.includes('complete')) {
    config.message = '✅ Workflow completed successfully'
  }
  
  return config
}

function generateEmailConfig(userRequest: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS.gmail.defaultConfig }
  
  // Extract recipients
  const emailMatch = userRequest.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
  if (emailMatch) {
    config.to = [emailMatch[1]]
  }
  
  // Generate context-aware content
  if (userRequest.includes('report')) {
    config.subject = '📊 Automated Report'
    config.body = 'Please find the attached report below.'
  } else if (userRequest.includes('alert')) {
    config.subject = '🚨 Alert Notification'
    config.body = 'Attention required: Please review the following information.'
  }
  
  return config
}

function generateDiscordConfig(userRequest: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS.discord.defaultConfig }
  
  // Generate context-aware message
  if (userRequest.includes('report')) {
    config.message = '📊 Report is ready for review'
  } else if (userRequest.includes('alert')) {
    config.message = '🚨 Alert: Action required'
  }
  
  return config
}

function generateSheetsConfig(userRequest: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS.google_sheets.defaultConfig }
  
  // Adjust range based on context
  if (userRequest.includes('columns') || userRequest.includes('specific')) {
    config.range = 'Sheet1!A1:Z1000'
  }
  
  return config
}

function generateS3Config(userRequest: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS.s3.defaultConfig }
  
  // Extract bucket name
  const bucketMatch = userRequest.match(/bucket[:\s]+(\w+)/i)
  if (bucketMatch) {
    config.bucket = bucketMatch[1]
  }
  
  return config
}

function generateAPIConfig(userRequest: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS.api.defaultConfig }
  
  // Extract URL
  const urlMatch = userRequest.match(/https?:\/\/[^\s]+/)
  if (urlMatch) {
    config.url = urlMatch[0]
  }
  
  // Detect method
  if (userRequest.includes('POST') || userRequest.includes('create') || userRequest.includes('send')) {
    config.method = 'POST'
  } else if (userRequest.includes('PUT') || userRequest.includes('update')) {
    config.method = 'PUT'
  } else if (userRequest.includes('DELETE') || userRequest.includes('remove')) {
    config.method = 'DELETE'
  }
  
  // Map to actual sub-block field names for API block
  return {
    url: config.url || 'https://api.example.com/data',
    method: config.method || 'GET',
    headers: config.headers || { 'Content-Type': 'application/json' },
    body: config.body || '',
    params: config.params || {}
  }
}

function generateGitHubConfig(userRequest: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS.github.defaultConfig }
  
  // Extract endpoint
  if (userRequest.includes('repos') || userRequest.includes('repositories')) {
    config.endpoint = '/user/repos'
  } else if (userRequest.includes('commits')) {
    config.endpoint = '/repos/{owner}/{repo}/commits'
  } else if (userRequest.includes('issues')) {
    config.endpoint = '/repos/{owner}/{repo}/issues'
  }
  
  return config
}

function generateAnalyticsConfig(userRequest: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS.google_analytics.defaultConfig }
  
  // Extract metrics
  if (userRequest.includes('sessions') || userRequest.includes('visits')) {
    config.metrics.push('ga:sessions')
  }
  if (userRequest.includes('users')) {
    config.metrics.push('ga:users')
  }
  if (userRequest.includes('pageviews')) {
    config.metrics.push('ga:pageviews')
  }
  
  return config
}

function generateYouTubeConfig(userRequest: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS.youtube.defaultConfig }
  
  // Extract search query
  const searchMatch = userRequest.match(/search\s+for\s+["']([^"']+)["']/i)
  if (searchMatch) {
    config.query = searchMatch[1]
  }
  
  return config
}

function generateScheduleConfig(userRequest: string): Record<string, any> {
  const config = { ...UNIVERSAL_BLOCK_CONFIGS.schedule.defaultConfig }
  
  // Extract schedule
  if (userRequest.includes('daily')) {
    config.cron = '0 9 * * *' // Daily at 9 AM
  } else if (userRequest.includes('hourly')) {
    config.cron = '0 * * * *' // Hourly
  } else if (userRequest.includes('weekly')) {
    config.cron = '0 9 * * 1' // Weekly on Monday
  } else if (userRequest.includes('monthly')) {
    config.cron = '0 9 1 * *' // Monthly on 1st
  }
  
  return config
}

// === UNIVERSAL CONFIGURATION FUNCTIONS ===

export function generateBlockConfiguration(blockType: string, userRequest: string, context?: any): Record<string, any> {
  const blockConfig = UNIVERSAL_BLOCK_CONFIGS[blockType]
  if (!blockConfig) {
    return {}
  }
  
  return blockConfig.configGenerator(userRequest, context)
}

export function detectBlocksFromRequest(userRequest: string): string[] {
  const detectedBlocks: string[] = []
  
  for (const [blockType, config] of Object.entries(UNIVERSAL_BLOCK_CONFIGS)) {
    const hasKeyword = config.keywords.some(keyword => 
      userRequest.toLowerCase().includes(keyword.toLowerCase())
    )
    
    if (hasKeyword) {
      detectedBlocks.push(blockType)
    }
  }
  
  return detectedBlocks
}

export function getBlockCategory(blockType: string): string {
  return UNIVERSAL_BLOCK_CONFIGS[blockType]?.category || 'unknown'
}

export function getBlockCommonUses(blockType: string): string[] {
  return UNIVERSAL_BLOCK_CONFIGS[blockType]?.commonUses || []
}

// === AUTOMATIC BLOCK WIRING SYSTEM ===

export interface BlockConnection {
  source_id: string
  target_id: string
  source_handle?: string
  target_handle?: string
}

export interface WorkflowPlan {
  blocks: Array<{
    type: string
    position: { x: number; y: number }
    values: Record<string, any>
  }>
  connections: BlockConnection[]
}

/**
 * Generate automatic block connections based on logical data flow
 */
export function generateBlockConnections(detectedBlocks: string[]): BlockConnection[] {
  const connections: BlockConnection[] = []
  
  // Connect blocks in logical sequence using plain block_type as ID
  // The workflow.tsx handler resolves these to real block IDs via idMap
  for (let i = 0; i < detectedBlocks.length - 1; i++) {
    connections.push({
      source_id: detectedBlocks[i],
      target_id: detectedBlocks[i + 1],
      source_handle: 'source',
      target_handle: 'target'
    })
  }
  
  return connections
}

/**
 * Generate complete workflow plan with blocks and connections
 */
export function generateWorkflowPlan(userRequest: string): WorkflowPlan {
  // Detect blocks from user request
  let detectedBlocks = detectBlocksFromRequest(userRequest)
  
  if (detectedBlocks.length === 0) {
    return { blocks: [], connections: [] }
  }
  
  // ALWAYS add a trigger block at the beginning
  const hasTrigger = detectedBlocks.some(block => 
    UNIVERSAL_BLOCK_CONFIGS[block]?.category === 'trigger'
  )
  
  if (!hasTrigger) {
    // Add starter trigger by default
    detectedBlocks = ['starter', ...detectedBlocks]
  }
  
  // Generate blocks with positions and configurations
  const blocks = detectedBlocks.map((blockType, index) => {
    const config = generateBlockConfiguration(blockType, userRequest)
    
    return {
      type: blockType,
      position: {
        x: 100 + (index * 250), // Spacing: 100, 350, 600, 850...
        y: 100 + (index % 3) * 150 // Stagger rows: 100, 250, 400...
      },
      values: config
    }
  })
  
  // Generate connections
  const connections = generateBlockConnections(detectedBlocks)
  
  return { blocks, connections }
}

/**
 * Generate edit operations for complete workflow
 */
export function generateWorkflowEditOperations(userRequest: string): Array<{
  action: string
  block_type?: string
  position?: { x: number; y: number }
  block_id?: string
  source_id?: string
  target_id?: string
  source_handle?: string
  target_handle?: string
  values?: Record<string, any>
}> {
  const workflowPlan = generateWorkflowPlan(userRequest)
  const operations: any[] = []
  
  // Add block operations
  workflowPlan.blocks.forEach((block, index) => {
    operations.push({
      action: 'add_block',
      block_type: block.type,
      position: block.position,
      values: block.values
    })
  })
  
  // Add connection operations (will be processed after blocks are added)
  workflowPlan.connections.forEach((connection, index) => {
    operations.push({
      action: 'add_connection',
      source_id: connection.source_id,
      target_id: connection.target_id,
      source_handle: connection.source_handle,
      target_handle: connection.target_handle
    })
  })
  
  return operations
}
