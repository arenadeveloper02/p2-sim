'use client'

import type { RefObject } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Tooltip } from '@sim/emcn'
import type { SelectedGeneratedImage } from '@/lib/chat/generated-image-selection'
import { DeployedChatDescriptionModal } from '@/app/(interfaces)/chat/[identifier]/DeployedChatDescriptionModal'
import { ChatInput } from '@/app/(interfaces)/chat/components'
import {
  DEPLOYED_CHAT_CANVAS_BG,
  DEPLOYED_CHAT_CANVAS_GRADIENT,
  DEPLOYED_CHAT_CONTENT_MAX_WIDTH_CLASS,
  DEPLOYED_CHAT_INPUT_PLACEHOLDER,
  DEPLOYED_CHAT_TEXT_BODY,
  DEPLOYED_CHAT_TEXT_DISPLAY,
  DEPLOYED_CHAT_TEXT_MUTED,
} from '@/app/(interfaces)/chat/constants'
import {
  getDeployedChatFirstName,
  resolveDeployedChatLandingDescription,
} from '@/app/(interfaces)/chat/utils/clip-description'

interface DeployedChatDescriptionPreviewProps {
  text: string
  onExpand: () => void
}

function DeployedChatDescriptionPreview({ text, onExpand }: DeployedChatDescriptionPreviewProps) {
  const descriptionRef = useRef<HTMLParagraphElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  useLayoutEffect(() => {
    const element = descriptionRef.current
    if (!element) return

    const updateTruncation = () => {
      setIsTruncated(element.scrollHeight > element.clientHeight + 1)
    }

    updateTruncation()

    const resizeObserver = new ResizeObserver(updateTruncation)
    resizeObserver.observe(element)
    return () => resizeObserver.disconnect()
  }, [text])

  return (
    <div className='relative mt-3'>
      <p
        ref={descriptionRef}
        className='max-h-[3.2em] overflow-hidden whitespace-pre-wrap text-center font-normal text-[14px] leading-[1.6]'
        style={{ color: DEPLOYED_CHAT_TEXT_MUTED }}
      >
        {text}
      </p>
      {isTruncated && (
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type='button'
                onClick={onExpand}
                className='absolute right-0 bottom-0 pl-3 font-normal text-[15px] leading-[1.6] hover:text-[var(--brand-primary-hex)]'
                style={{
                  color: DEPLOYED_CHAT_TEXT_MUTED,
                  background: `linear-gradient(to right, transparent, ${DEPLOYED_CHAT_CANVAS_BG} 50%)`,
                }}
                aria-label='View full description'
              >
                ...
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content side='top'>View full description</Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      )}
    </div>
  )
}

interface DeployedChatLandingProps {
  chatConfig: {
    title: string
    description?: string
    customizations?: {
      headerText?: string
      welcomeMessage?: string
    }
  }
  department?: string | null
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
  department,
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

  const promptLine = `What should we get done${firstName ? `, ${firstName}` : ''}?`

  return (
    <>
      <div
        className='flex min-h-0 flex-1 flex-col overflow-y-auto'
        style={{ background: DEPLOYED_CHAT_CANVAS_GRADIENT }}
      >
        <div className='flex flex-1 flex-col items-center justify-center px-4 py-8 md:px-6'>
          <div
            className={`flex w-full flex-col gap-5 ${DEPLOYED_CHAT_CONTENT_MAX_WIDTH_CLASS} text-center`}
          >
            <div>
              <h1
                className='font-semibold text-[24px] leading-[1.25]'
                style={{ color: DEPLOYED_CHAT_TEXT_DISPLAY }}
              >
                {title}
              </h1>

              {descriptionSource && (
                <DeployedChatDescriptionPreview
                  text={descriptionSource}
                  onExpand={() => setIsDescriptionModalOpen(true)}
                />
              )}
            </div>

            <p
              className='font-normal text-[20px] leading-[1.4]'
              style={{ color: DEPLOYED_CHAT_TEXT_BODY }}
            >
              {promptLine}
            </p>

            <div ref={inputWrapperRef} className='w-full'>
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

      <DeployedChatDescriptionModal
        open={isDescriptionModalOpen}
        onOpenChange={setIsDescriptionModalOpen}
        title={title}
        description={descriptionSource}
        department={department}
      />
    </>
  )
}
