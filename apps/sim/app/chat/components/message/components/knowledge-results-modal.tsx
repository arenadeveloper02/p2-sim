'use client'

import { useMemo } from 'react'
import { Modal, ModalBody, ModalContent, ModalHeader } from '@/components/emcn'
import type { KnowledgeResultChunk } from '@/app/chat/components/message/message'

interface KnowledgeResultsModalProps {
  isOpen: boolean
  onClose: () => void
  documentName: string
  chunks: KnowledgeResultChunk[]
}

/**
 * Modal that shows knowledge base result chunks for a single document:
 * document name as heading, then each chunk with chunk index and content.
 */
export function KnowledgeResultsModal({
  isOpen,
  onClose,
  documentName,
  chunks,
}: KnowledgeResultsModalProps) {
  const sortedChunks = useMemo(
    () => [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex),
    [chunks]
  )

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContent className='max-h-[85vh] max-w-2xl'>
        <ModalHeader className='border-gray-200 border-b pb-3 dark:border-gray-700'>
          <h2 className='font-semibold text-gray-900 text-lg dark:text-gray-100'>{documentName}</h2>
        </ModalHeader>
        <ModalBody className='overflow-y-auto py-4'>
          <div className='space-y-4'>
            {sortedChunks.map((chunk, index) => (
              <div
                key={`${chunk.documentId}-${chunk.chunkIndex}-${index}`}
                className='rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50'
              >
                <div className='mb-1.5 font-medium text-gray-500 text-xs dark:text-gray-400'>
                  Chunk {chunk.chunkIndex + 1}
                </div>
                <div className='whitespace-pre-wrap break-words text-gray-800 text-sm dark:text-gray-200'>
                  {chunk.content}
                </div>
                {chunk.metadata &&
                  typeof chunk.metadata === 'object' &&
                  Object.keys(chunk.metadata).length > 0 && (
                    <div className='mt-2 border-gray-200 border-t pt-2 text-gray-500 text-xs dark:border-gray-700 dark:text-gray-400'>
                      {JSON.stringify(chunk.metadata)}
                    </div>
                  )}
              </div>
            ))}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
