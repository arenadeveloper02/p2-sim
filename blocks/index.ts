// Import blocks
import { AgentBlock } from './blocks/agent'
import { ApiBlock } from './blocks/api'
import { ConditionBlock } from './blocks/condition'
import { CrewAIVisionBlock } from './blocks/crewai'
import { EvaluatorBlock } from './blocks/evaluator'
import { FirecrawlScrapeBlock } from './blocks/firecrawl'
import { FunctionBlock } from './blocks/function'
import { GitHubBlock } from './blocks/github'
import { GmailBlock } from './blocks/gmail'
import { JinaBlock } from './blocks/jina'
import { NotionBlock } from './blocks/notion'
import { RouterBlock } from './blocks/router'
import { SerperBlock } from './blocks/serper'
import { SlackMessageBlock } from './blocks/slack'
import { TavilyBlock } from './blocks/tavily'
import { TranslateBlock } from './blocks/translate'
import { XBlock } from './blocks/x'
import { YouTubeSearchBlock } from './blocks/youtube'
import { BlockConfig } from './types'

// Export blocks for ease of use
export {
  AgentBlock,
  ApiBlock,
  FunctionBlock,
  CrewAIVisionBlock,
  FirecrawlScrapeBlock,
  JinaBlock,
  TranslateBlock,
  SlackMessageBlock,
  GitHubBlock,
  ConditionBlock,
  SerperBlock,
  TavilyBlock,
  RouterBlock,
  EvaluatorBlock,
  YouTubeSearchBlock,
  NotionBlock,
  GmailBlock,
  XBlock,
}

// Registry of all block configurations
const blocks: Record<string, BlockConfig> = {
  agent: AgentBlock,
  api: ApiBlock,
  condition: ConditionBlock,
  function: FunctionBlock,
  router: RouterBlock,
  evaluator: EvaluatorBlock,
  crewai_vision: CrewAIVisionBlock,
  firecrawl_scrape: FirecrawlScrapeBlock,
  jina_reader: JinaBlock,
  translate: TranslateBlock,
  slack_message: SlackMessageBlock,
  github_repo_info: GitHubBlock,
  serper_search: SerperBlock,
  tavily_block: TavilyBlock,
  youtube_search: YouTubeSearchBlock,
  notion_reader: NotionBlock,
  gmail_block: GmailBlock,
  x_block: XBlock,
}

// Helper functions
export const getBlock = (type: string): BlockConfig | undefined => blocks[type]

export const getBlocksByCategory = (category: 'blocks' | 'tools'): BlockConfig[] =>
  Object.values(blocks).filter((block) => block.toolbar.category === category)

export const getAllBlockTypes = (): string[] => Object.keys(blocks)

export const isValidBlockType = (type: string): type is string => type in blocks

export const getAllBlocks = (): BlockConfig[] => Object.values(blocks)
