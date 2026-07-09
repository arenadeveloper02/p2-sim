'use client'

import { useMemo, useState } from 'react'
import type { RefObject } from 'react'
import { ChipModal, ChipModalBody, ChipModalHeader } from '@/components/emcn'
import { ChatInput } from '@/app/chat/components'
import {
  DEPLOYED_CHAT_CANVAS_GRADIENT,
  DEPLOYED_CHAT_CONTENT_MAX_WIDTH_CLASS,
  DEPLOYED_CHAT_INPUT_PLACEHOLDER,
  DEPLOYED_CHAT_TEXT_BODY,
  DEPLOYED_CHAT_TEXT_DISPLAY,
  DEPLOYED_CHAT_TEXT_MUTED,
} from '@/app/chat/constants'
import {
  clipDeployedChatDescription,
  getDeployedChatFirstName,
  resolveDeployedChatLandingDescription,
} from '@/app/chat/utils/clip-description'
import type { SelectedGeneratedImage } from '@/lib/chat/generated-image-selection'

interface DeployedChatLandingProps {
  chatConfig: {
    title: string
    description?: string
    customizations?: {
      headerText?: string
      welcomeMessage?: string
    }
  }
  userName?: string | null
  isStreaming?: boolean
  isLoading?: boolean
  insertText?: string
  onInsertConsumed?: () => void
  onSubmit: (
    value: string,
    isVoiceInput?: boolean,
    files?: Array<{
      id: string
      name: string
      size: number
      type: string
      file: File
      dataUrl?: string
    }>
  ) => void
  onStopStreaming?: () => void
  onVoiceStart?: () => void
  selectedGeneratedImages?: SelectedGeneratedImage[]
  onRemoveSelectedGeneratedImage?: (imageId: string) => void
  inputWrapperRef?: RefObject<HTMLDivElement | null>
}

export function DeployedChatLanding({
  chatConfig,
  userName,
  isStreaming = false,
  isLoading = false,
  insertText,
  onInsertConsumed,
  onSubmit,
  onStopStreaming,
  onVoiceStart,
  selectedGeneratedImages,
  onRemoveSelectedGeneratedImage,
  inputWrapperRef,
}: DeployedChatLandingProps) {
  const [isDescriptionModalOpen, setIsDescriptionModalOpen] = useState(false)

  const title = chatConfig.customizations?.headerText || chatConfig.title || 'Chat'
  const firstName = getDeployedChatFirstName(userName)
  const descriptionSource = resolveDeployedChatLandingDescription({
    title,
    description: chatConfig.description,
    welcomeMessage: chatConfig.customizations?.welcomeMessage,
  })

  const clippedDescription = useMemo(
    () => clipDeployedChatDescription(descriptionSource),
    [descriptionSource]
  )

  const promptLine = `What should we get done${firstName ? `, ${firstName}` : ''}?`

  return (
    <>
      <div
        className='flex min-h-0 flex-1 flex-col overflow-y-auto'
        style={{ background: DEPLOYED_CHAT_CANVAS_GRADIENT }}
      >
        <div className='flex flex-1 flex-col items-center justify-center px-4 py-8 md:px-6'>
          <div className={`w-full ${DEPLOYED_CHAT_CONTENT_MAX_WIDTH_CLASS} text-center`}>
            <h1
              className='font-semibold text-[24px] leading-[1.25]'
              style={{ color: DEPLOYED_CHAT_TEXT_DISPLAY }}
            >
              {title}
            </h1>

            {clippedDescription.displayText && (
              <div
                className='mt-3 font-normal text-[15px] leading-[1.6]'
                style={{ color: DEPLOYED_CHAT_TEXT_MUTED }}
              >
                <p className='whitespace-pre-wrap'>{clippedDescription.displayText}</p>
                {clippedDescription.isTruncated && (
                  <button
                    type='button'
                    onClick={() => setIsDescriptionModalOpen(true)}
                    className='mt-2 font-medium text-[var(--brand-primary-hex)] hover:underline'
                  >
                    View more
                  </button>
                )}
              </div>
            )}

            <p
              className='mt-8 font-normal text-[18px] leading-[1.4]'
              style={{ color: DEPLOYED_CHAT_TEXT_BODY }}
            >
              {promptLine}
            </p>

            <div ref={inputWrapperRef} className='mt-5 w-full'>
              <ChatInput
                embedded
                landing
                placeholder={DEPLOYED_CHAT_INPUT_PLACEHOLDER}
                insertText={insertText}
                onInsertConsumed={onInsertConsumed}
                onSubmit={onSubmit}
                isStreaming={isLoading || isStreaming}
                onStopStreaming={onStopStreaming}
                onVoiceStart={onVoiceStart}
                selectedGeneratedImages={selectedGeneratedImages}
                onRemoveSelectedGeneratedImage={onRemoveSelectedGeneratedImage}
              />
            </div>
          </div>
        </div>
      </div>

      <ChipModal open={isDescriptionModalOpen} onOpenChange={setIsDescriptionModalOpen}>
        <ChipModalHeader onClose={() => setIsDescriptionModalOpen(false)}>{title}</ChipModalHeader>
        <ChipModalBody>
          <p
            className='whitespace-pre-wrap font-normal text-[15px] leading-[1.6]'
            style={{ color: DEPLOYED_CHAT_TEXT_MUTED }}
          >
            {clippedDescription.fullText}
          </p>
        </ChipModalBody>
      </ChipModal>
    </>
  )
}
