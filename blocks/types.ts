import type { SVGProps } from 'react'
import type { JSX } from 'react'
import { ToolResponse } from '@/tools/types'

// Basic type definitions for block components
export type BlockIcon = (props: SVGProps<SVGSVGElement>) => JSX.Element
export type BlockCategory = 'blocks' | 'tools'
export type ParamType = 'string' | 'number' | 'boolean' | 'json'
export type PrimitiveValueType = 'string' | 'number' | 'boolean' | 'json' | 'any'

// Sub-block configuration types
export type SubBlockType =
  | 'short-input'
  | 'long-input'
  | 'dropdown'
  | 'slider'
  | 'table'
  | 'code'
  | 'switch'
  | 'tool-input'
  | 'checkbox-list'

export type SubBlockLayout = 'full' | 'half'

// Tool output type utilities
export type ExtractToolOutput<T> = T extends ToolResponse ? T['output'] : never

export type ToolOutputToValueType<T> =
  T extends Record<string, any>
    ? {
        [K in keyof T]: T[K] extends string
          ? 'string'
          : T[K] extends number
            ? 'number'
            : T[K] extends boolean
              ? 'boolean'
              : T[K] extends object
                ? 'json'
                : 'any'
      }
    : never

// Block configuration interfaces and types
export type BlockOutput =
  | PrimitiveValueType
  | { [key: string]: PrimitiveValueType | Record<string, any> }

export interface ParamConfig {
  type: ParamType
  required: boolean
}

export interface SubBlockConfig {
  id: string
  title?: string
  type: SubBlockType
  layout?: SubBlockLayout
  options?: string[] | { label: string; id: string }[]
  min?: number
  max?: number
  columns?: string[]
  placeholder?: string
  password?: boolean
  connectionDroppable?: boolean
  outputHandle?: boolean
  hidden?: boolean
  value?: (params: Record<string, any>) => string
}

export interface BlockConfig<T extends ToolResponse = ToolResponse> {
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
    outputs: {
      response: {
        type: ToolOutputToValueType<ExtractToolOutput<T>>
      }
    }
  }
}

export interface OutputConfig {
  type: BlockOutput
  dependsOn?: {
    subBlockId: string
    condition: {
      whenEmpty: BlockOutput
      whenFilled: BlockOutput
    }
  }
}
