'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AssistantGeneratedImage } from '@/lib/chat/assistant-assets'
import {
  materializeSelectedGeneratedImage,
  toSelectedGeneratedImage,
  type SelectedGeneratedImage,
  type ToggleGeneratedImageInput,
} from '@/lib/chat/generated-image-selection'

interface MessageWithGeneratedImages {
  id: string
  generatedImages?: AssistantGeneratedImage[]
  attachments?: Array<{ id: string }>
}

export function useGeneratedImageReuse(messages: MessageWithGeneratedImages[]) {
  const [selectedGeneratedImages, setSelectedGeneratedImages] = useState<SelectedGeneratedImage[]>([])
  const availableImageIds = useMemo(
    () =>
      new Set(
        messages.flatMap((message) => [
          ...(message.generatedImages ?? []).map((image) => image.id),
          ...(message.attachments ?? []).map((attachment) => attachment.id),
        ])
      ),
    [messages]
  )

  useEffect(() => {
    setSelectedGeneratedImages((current) =>
      current.filter((image) => availableImageIds.has(image.id))
    )
  }, [availableImageIds])

  const effectiveGeneratedImages = selectedGeneratedImages

  const selectedGeneratedImageIds = useMemo(
    () => new Set(effectiveGeneratedImages.map((image) => image.id)),
    [effectiveGeneratedImages]
  )

  const selectedGeneratedImageIdsKey = useMemo(
    () => effectiveGeneratedImages.map((image) => image.id).join('|'),
    [effectiveGeneratedImages]
  )

  const toggleGeneratedImageSelection = useCallback(
    (messageId: string, image: ToggleGeneratedImageInput) => {
      const nextImage = toSelectedGeneratedImage(messageId, image)
      setSelectedGeneratedImages((current) => {
        const exists = current.some((entry) => entry.id === nextImage.id)
        if (exists) {
          return current.filter((entry) => entry.id !== nextImage.id)
        }
        return [...current, nextImage]
      })
    },
    []
  )

  const removeSelectedGeneratedImage = useCallback(
    (imageId: string) => {
      setSelectedGeneratedImages((current) => current.filter((image) => image.id !== imageId))
    },
    []
  )

  const clearSelectedGeneratedImages = useCallback(() => {
    setSelectedGeneratedImages([])
  }, [])

  const materializeSelectedGeneratedImages = useCallback(() => {
    return Promise.all(effectiveGeneratedImages.map((image) => materializeSelectedGeneratedImage(image)))
  }, [effectiveGeneratedImages])

  return {
    selectedGeneratedImages,
    effectiveGeneratedImages,
    selectedGeneratedImageIds,
    selectedGeneratedImageIdsKey,
    toggleGeneratedImageSelection,
    removeSelectedGeneratedImage,
    clearSelectedGeneratedImages,
    materializeSelectedGeneratedImages,
  }
}
