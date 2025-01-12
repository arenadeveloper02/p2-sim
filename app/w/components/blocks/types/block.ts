import type { SVGProps } from 'react'
import type { JSX } from 'react'

export type BlockType = 'agent' | 'api' | 'conditional'
export type BlockIcon = (props: SVGProps<SVGSVGElement>) => JSX.Element
export type BlockCategory = 'basic' | 'advanced'
export type SubBlockType = 'short-input' | 'long-input' | 'dropdown' | 'slider' | 'table' | 'code'
export type SubBlockLayout = 'full' | 'half'

export interface SubBlockConfig {
  title: string
  type: SubBlockType
  options?: string[]
  min?: number
  max?: number
  layout?: SubBlockLayout
  columns?: string[]
}

export interface BlockConfig {
  type: BlockType
  toolbar: {
    title: string
    description: string
    bgColor: string
    icon: BlockIcon
    category: BlockCategory
  }
  workflow: {
    inputs: Record<string, string>
    outputs: Record<string, string>
    subBlocks: SubBlockConfig[]
  }
}