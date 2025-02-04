import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PlusIcon, XIcon } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useSubBlockValue } from '../hooks/use-sub-block-value'
import { getAllBlocks } from '@/blocks'
import { cn } from '@/lib/utils'
import { getTool } from '@/tools'
import { ShortInput } from './short-input'

interface ToolInputProps {
  blockId: string
  subBlockId: string
}

// State interface - only what we need to store
interface StoredTool {
  type: string
  title: string
  params: Record<string, string>
}

// UI interface - includes display properties
interface ToolDisplay {
  type: string
  icon: any
  title: string
  bgColor: string
  requiredParams: ToolParam[]
}

interface SelectedTool {
  type: string
  icon: any
  title: string
  bgColor: string
  requiredParams?: ToolParam[]
  params?: Record<string, string>
}

interface ToolParam {
  id: string
  type: string
  description?: string
  requiredForToolCall: boolean
}

// Assumes the first tool in the access array is the tool to be used
// TODO: Switch to getting tools instead of tool blocks once we switch to providers
const getToolIdFromBlock = (blockType: string): string | undefined => {
  const block = getAllBlocks().find((block) => block.type === blockType)
  return block?.tools.access[0]
}

const getRequiredToolParams = (toolId: string): ToolParam[] => {
  const tool = getTool(toolId)
  if (!tool) return []

  return Object.entries(tool.params)
    .filter(([_, param]) => param.requiredForToolCall)
    .map(([paramId, param]) => ({
      id: paramId,
      type: param.type,
      description: param.description,
      requiredForToolCall: param.requiredForToolCall ?? false,
    }))
}

export function ToolInput({ blockId, subBlockId }: ToolInputProps) {
  const [value, setValue] = useSubBlockValue(blockId, subBlockId)
  const [open, setOpen] = useState(false)

  const toolBlocks = getAllBlocks().filter(
    (block) => block.toolbar.category === 'tools'
  )

  const selectedTools: StoredTool[] =
    Array.isArray(value) && value.length > 0 && typeof value[0] === 'object'
      ? (value as unknown as StoredTool[])
      : []

  const handleSelectTool = (toolBlock: (typeof toolBlocks)[0]) => {
    const toolId = getToolIdFromBlock(toolBlock.type)

    // Only store essential data
    const newTool: StoredTool = {
      type: toolBlock.type,
      title: toolBlock.toolbar.title,
      params: {},
    }

    if (!selectedTools.some((tool) => tool.type === newTool.type)) {
      setValue([...selectedTools, newTool])
    }

    setOpen(false)
  }

  const handleRemoveTool = (toolType: string) => {
    setValue(selectedTools.filter((tool) => tool.type !== toolType))
  }

  const handleParamChange = (
    toolType: string,
    paramId: string,
    paramValue: string
  ) => {
    setValue(
      selectedTools.map((tool) => {
        if (tool.type === toolType) {
          return {
            ...tool,
            params: {
              ...tool.params,
              [paramId]: paramValue,
            },
          }
        }
        return tool
      })
    )
  }

  const IconComponent = ({
    icon: Icon,
    className,
  }: {
    icon: any
    className?: string
  }) => {
    if (!Icon) return null
    return <Icon className={className} />
  }

  // Helper function to get the icon component for a tool type
  const getToolIcon = (type: string) => {
    const toolBlock = toolBlocks.find((block) => block.type === type)
    return toolBlock?.toolbar.icon
  }

  return (
    <div className="w-full">
      {selectedTools.length === 0 ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <div className="flex h-10 w-full items-center justify-center rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer">
              <div className="flex items-center text-base text-muted-foreground/50 md:text-sm">
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Tool
              </div>
            </div>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[200px]" align="start">
            <Command>
              <CommandInput placeholder="Search tools..." />
              <CommandList>
                <CommandEmpty>No tools found.</CommandEmpty>
                <CommandGroup>
                  {toolBlocks.map((block) => (
                    <CommandItem
                      key={block.type}
                      onSelect={() => handleSelectTool(block)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <div
                        className="flex items-center justify-center w-6 h-6 rounded"
                        style={{ backgroundColor: block.toolbar.bgColor }}
                      >
                        <IconComponent
                          icon={block.toolbar.icon}
                          className="w-4 h-4 text-white"
                        />
                      </div>
                      <span>{block.toolbar.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
        <div className="flex flex-wrap gap-2 min-h-[2.5rem] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background">
          {selectedTools.map((tool) => {
            // Get UI properties from toolBlocks for display
            const toolBlock = toolBlocks.find(
              (block) => block.type === tool.type
            )
            const toolId = getToolIdFromBlock(tool.type)
            const requiredParams = toolId ? getRequiredToolParams(toolId) : []

            return (
              <div key={tool.type} className="group flex flex-col w-full">
                <div className="flex flex-col rounded-md border bg-card overflow-visible">
                  <div className="flex items-center justify-between p-2 bg-accent/50">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex items-center justify-center w-5 h-5 rounded"
                        style={{ backgroundColor: toolBlock?.toolbar.bgColor }}
                      >
                        <IconComponent
                          icon={toolBlock?.toolbar.icon}
                          className="w-3 h-3 text-white"
                        />
                      </div>
                      <span className="text-sm font-medium">{tool.title}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveTool(tool.type)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>

                  {requiredParams.length > 0 && (
                    <div className="p-3 space-y-3">
                      {requiredParams.map((param) => (
                        <div key={param.id} className="space-y-1.5 relative">
                          <div className="text-xs font-medium text-muted-foreground">
                            {param.id}
                          </div>
                          <div className="relative">
                            <input
                              type={
                                param.type === 'password' ? 'password' : 'text'
                              }
                              value={tool.params?.[param.id] || ''}
                              onChange={(e) =>
                                handleParamChange(
                                  tool.type,
                                  param.id,
                                  e.target.value
                                )
                              }
                              placeholder={param.description}
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <PlusIcon className="w-3 h-3" />
                Add Tool
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[200px]" align="start">
              <Command>
                <CommandInput placeholder="Search tools..." />
                <CommandList>
                  <CommandEmpty>No tools found.</CommandEmpty>
                  <CommandGroup>
                    {toolBlocks.map((block) => (
                      <CommandItem
                        key={block.type}
                        onSelect={() => handleSelectTool(block)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <div
                          className="flex items-center justify-center w-6 h-6 rounded"
                          style={{ backgroundColor: block.toolbar.bgColor }}
                        >
                          <IconComponent
                            icon={block.toolbar.icon}
                            className="w-4 h-4 text-white"
                          />
                        </div>
                        <span>{block.toolbar.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  )
}
