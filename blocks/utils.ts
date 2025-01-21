import { BlockState, SubBlockState } from '@/stores/workflow/types'
import { OutputTypeConfig, OutputType } from '@/blocks/types'

interface CodeLine {
  id: string
  content: string
}

function isEmptyValue(value: SubBlockState['value']): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (typeof value === 'number') return false
  if (Array.isArray(value)) {
    // Handle code editor's array of lines format
    if (value.length === 0) return true
    if (isCodeEditorValue(value)) {
      return value.every((line: any) => !line.content.trim())
    }
    return value.length === 0
  }
  return false
}

function isCodeEditorValue(value: any[]): value is CodeLine[] {
  return value.length > 0 && 'id' in value[0] && 'content' in value[0]
}

export function resolveOutputType(
  outputTypeConfig: OutputTypeConfig,
  subBlocks: Record<string, SubBlockState>
): OutputType {
  // If outputType is a string, return it directly
  if (typeof outputTypeConfig === 'string') {
    return outputTypeConfig
  }

  // Handle dependent output types
  const { dependsOn } = outputTypeConfig
  const subBlock = subBlocks[dependsOn.subBlockId]

  return isEmptyValue(subBlock?.value) 
    ? dependsOn.condition.whenEmpty 
    : dependsOn.condition.whenFilled
}