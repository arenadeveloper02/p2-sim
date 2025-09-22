'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  SlackMentionInput,
  type SlackUserInfo,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/components/mention-input/slack-mention-input'
import { useDependsOnGate } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-depends-on-gate'
import { useForeignCredential } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-foreign-credential'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-sub-block-value'
import type { SubBlockConfig } from '@/blocks/types'

interface MentionInputProps {
  blockId: string
  subBlock: SubBlockConfig
  disabled?: boolean
  isPreview?: boolean
  previewValue?: any | null
}

export function MentionInput({
  blockId,
  subBlock,
  disabled = false,
  isPreview = false,
  previewValue,
}: MentionInputProps) {
  const params = useParams()
  const workflowIdFromUrl = (params?.workflowId as string) || ''

  // Use the proper hook to get the current value and setter
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlock.id)

  // Reactive upstream fields
  const [authMethod] = useSubBlockValue(blockId, 'authMethod')
  const [botToken] = useSubBlockValue(blockId, 'botToken')
  const [connectedCredential] = useSubBlockValue(blockId, 'credential')
  const [currentValue, setCurrentValue] = useState<string>('')

  // Get provider-specific values
  const provider = subBlock.provider || 'slack'
  const isSlack = provider === 'slack'

  // Central dependsOn gating
  const { finalDisabled, dependsOn, dependencyValues } = useDependsOnGate(blockId, subBlock, {
    disabled,
    isPreview,
  })

  // Choose credential strictly based on auth method
  const credential: string =
    (authMethod as string) === 'bot_token'
      ? (botToken as string) || ''
      : (connectedCredential as string) || ''

  // Determine if connected OAuth credential is foreign
  const { isForeignCredential } = useForeignCredential(
    'slack',
    (authMethod as string) === 'bot_token' ? '' : (connectedCredential as string) || ''
  )

  // Get the current value from the store or prop value if in preview mode
  useEffect(() => {
    const val = isPreview && previewValue !== undefined ? previewValue : storeValue
    if (val && typeof val === 'string') {
      setCurrentValue(val)
    }
  }, [isPreview, previewValue, storeValue])

  // Clear value when any declared dependency changes
  const prevDepsSigRef = useRef<string>('')
  useEffect(() => {
    if (dependsOn.length === 0) return
    const currentSig = JSON.stringify(dependencyValues)
    if (prevDepsSigRef.current && prevDepsSigRef.current !== currentSig) {
      if (!isPreview) {
        setCurrentValue('')
        setStoreValue('')
      }
    }
    prevDepsSigRef.current = currentSig
  }, [dependsOn, dependencyValues, isPreview, setStoreValue])

  // Handle value change
  const handleValueChange = (newValue: string) => {
    setCurrentValue(newValue)
    if (!isPreview) {
      setStoreValue(newValue)
    }
  }

  // Render Slack mention input
  if (isSlack) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className='w-full'>
              <SlackMentionInput
                value={currentValue}
                onChange={handleValueChange}
                credential={credential}
                label={subBlock.title || 'Message'}
                disabled={finalDisabled}
                workflowId={workflowIdFromUrl}
                isForeignCredential={isForeignCredential}
                placeholder={subBlock.placeholder || 'Type your message... Use @ to mention users'}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Type @ to mention users in your message</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Default fallback for unsupported providers
  return (
    <div className='w-full'>
      <div className='text-sm text-muted-foreground'>
        Mention input not supported for {provider}
      </div>
    </div>
  )
}
