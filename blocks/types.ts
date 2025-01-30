import type { SVGProps } from 'react'
import type { JSX } from 'react'

export type BlockIcon = (props: SVGProps<SVGSVGElement>) => JSX.Element
export type BlockCategory = 'basic' | 'advanced'
export type OutputType = 'string' | 'number' | 'json' | 'boolean' | 'any'
export type ParamType = 'string' | 'number' | 'boolean' | 'json'

export type SubBlockType = 'short-input' | 'long-input' | 'dropdown' | 'slider' | 'table' | 'code' | 'switch'
export type SubBlockLayout = 'full' | 'half'

export type OutputConfig = OutputType | {
  type: OutputType
  dependsOn: {
    subBlockId: string
    condition: {
      whenEmpty: OutputType
      whenFilled: OutputType
    }
  }
}

export interface ParamConfig {
  type: ParamType
  required: boolean
}

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

export interface BlockConfig {
  type: string
  toolbar: {
    title: string
    description: string
    bgColor: string
    icon: BlockIcon
    category: BlockCategory
  }
  tools: {
    access: string[]
    config?: {
      tool: (params: Record<string, any>) => string
    }
  }
  workflow: {
    subBlocks: SubBlockConfig[]
    inputs: Record<string, ParamConfig>
    outputs: Record<string, OutputConfig>
  }
}