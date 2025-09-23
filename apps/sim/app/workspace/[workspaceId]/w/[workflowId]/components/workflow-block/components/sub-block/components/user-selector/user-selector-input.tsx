'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  type SlackUserInfo,
  SlackUserSelector,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/components/user-selector/components/slack-user-selector'
import { useDependsOnGate } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-depends-on-gate'
import { useForeignCredential } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-foreign-credential'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-sub-block-value'
import type { SubBlockConfig } from '@/blocks/types'

interface UserSelectorInputProps {
  blockId: string
  subBlock: SubBlockConfig
  disabled?: boolean
  onUserSelect?: (userId: string | string[]) => void
  isPreview?: boolean
  previewValue?: any | null
}

export function UserSelectorInput({
  blockId,
  subBlock,
  disabled = false,
  onUserSelect,
  isPreview = false,
  previewValue,
}: UserSelectorInputProps) {
  const params = useParams()
  const workflowIdFromUrl = (params?.workflowId as string) || ''

  // Use the proper hook to get the current value and setter
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlock.id)

  // Reactive upstream fields
  const [authMethod] = useSubBlockValue(blockId, 'authMethod')
  const [botToken] = useSubBlockValue(blockId, 'botToken')
  const [connectedCredential] = useSubBlockValue(blockId, 'credential')
  const [selectedUserId, setSelectedUserId] = useState<string | string[]>('')
  const [_userInfo, setUserInfo] = useState<SlackUserInfo | null>(null)

  // Check if this should be multi-select based on subBlock config
  const isMultiple = subBlock.multiple || false

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
    if (val) {
      if (Array.isArray(val)) {
        setSelectedUserId(val)
      } else if (typeof val === 'string') {
        setSelectedUserId(val)
      }
    }
  }, [isPreview, previewValue, storeValue])

  // Clear user when any declared dependency changes
  const prevDepsSigRef = useRef<string>('')
  useEffect(() => {
    if (dependsOn.length === 0) return
    const currentSig = JSON.stringify(dependencyValues)
    if (prevDepsSigRef.current && prevDepsSigRef.current !== currentSig) {
      if (!isPreview) {
        setSelectedUserId(isMultiple ? [] : '')
        setUserInfo(null)
        setStoreValue(isMultiple ? [] : '')
      }
    }
    prevDepsSigRef.current = currentSig
  }, [dependsOn, dependencyValues, isPreview, setStoreValue])

  // Handle user selection
  const handleUserChange = (userId: string | string[], info?: SlackUserInfo) => {
    setSelectedUserId(userId)
    setUserInfo(info || null)
    if (!isPreview) {
      setStoreValue(userId)
    }
    onUserSelect?.(userId)
  }

  // Render Slack user selector
  if (isSlack) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className='w-full'>
              <SlackUserSelector
                value={selectedUserId}
                onChange={(userId: string | string[]) => {
                  handleUserChange(userId)
                }}
                credential={credential}
                label={
                  subBlock.placeholder || (isMultiple ? 'Select Slack users' : 'Select Slack user')
                }
                disabled={finalDisabled}
                workflowId={workflowIdFromUrl}
                isForeignCredential={isForeignCredential}
                multiple={isMultiple}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Select a Slack user to mention in your message</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Default fallback for unsupported providers
  return (
    <div className='w-full'>
      <div className='text-muted-foreground text-sm'>
        User selection not supported for {provider}
      </div>
    </div>
  )
}
