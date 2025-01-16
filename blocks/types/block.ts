import type { SVGProps } from 'react'
import type { JSX } from 'react'

export type BlockType = 'agent' | 'api' | 'conditional'
export type BlockIcon = (props: SVGProps<SVGSVGElement>) => JSX.Element
export type BlockCategory = 'basic' | 'advanced'
export type OutputType = 'string' | 'number' | 'json' | 'boolean'

export type SubBlockType = 'short-input' | 'long-input' | 'dropdown' | 'slider' | 'table' | 'code'
export type SubBlockLayout = 'full' | 'half'

export interface SubBlockConfig {
  id: string
  title: string
  type: SubBlockType
  layout?: SubBlockLayout
  options?: string[]
  min?: number
  max?: number
  columns?: string[]
  placeholder?: string
  password?: boolean
}

export type OutputTypeConfig = OutputType | {
  default: OutputType
  dependsOn: {
    subBlockId: string
    condition: {
      whenEmpty: OutputType
      whenFilled: OutputType
    }
  }
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
    outputType: OutputTypeConfig
    subBlocks: SubBlockConfig[]
  }
}