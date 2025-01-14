import { BlockConfig, BlockType } from '../types/block'
import { AgentBlock } from './agent'
import { ApiBlock } from './api'
import { ConditionalBlock } from './conditional'

// Export individual blocks
export { AgentBlock, ApiBlock, ConditionalBlock }

// Combined blocks registry
export const BLOCKS: BlockConfig[] = [
  AgentBlock,
  ApiBlock,
  ConditionalBlock,
]

// Helper functions
export const getBlock = (type: BlockType): BlockConfig | undefined =>
  BLOCKS.find(block => block.type === type)

export const getBlocksByCategory = (category: 'basic' | 'advanced'): BlockConfig[] =>
  BLOCKS.filter(block => block.toolbar.category === category)

export const getAllBlockTypes = (): BlockType[] =>
  BLOCKS.map(block => block.type)

export const isValidBlockType = (type: string): type is BlockType =>
  BLOCKS.some(block => block.type === type)