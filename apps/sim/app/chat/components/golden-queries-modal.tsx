import { useEffect, useMemo, useState } from 'react'
import { GripVertical, Pencil, Trash2, X } from 'lucide-react'
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@/components/emcn'

interface GoldenQueriesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  queries: string[]
  onSelectQuery: (query: string) => void
  onSaveQueries: (queries: string[]) => Promise<void>
  disabled?: boolean
}

export function GoldenQueriesModal({
  open,
  onOpenChange,
  queries,
  onSelectQuery,
  onSaveQueries,
  disabled = false,
}: GoldenQueriesModalProps) {
  const normalizedQueries = useMemo(
    () => queries.map((query) => query.trim()).filter((query) => query.length > 0),
    [queries]
  )
  const [draftQueries, setDraftQueries] = useState<string[]>(normalizedQueries)
  const [mode, setMode] = useState<'add' | 'edit' | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setDraftQueries(normalizedQueries)
    setMode(null)
    setDraftValue('')
    setEditingIndex(null)
    setErrorMessage(null)
    setIsSaving(false)
  }, [open, normalizedQueries])

  const isAddDisabled = disabled || isSaving || mode !== null

  const handleAddClick = () => {
    setMode('add')
    setDraftValue('')
    setEditingIndex(null)
    setErrorMessage(null)
  }

  const handleEditClick = (index: number) => {
    setMode('edit')
    setEditingIndex(index)
    setDraftValue(draftQueries[index] ?? '')
    setErrorMessage(null)
  }

  const handleCancel = () => {
    setMode(null)
    setDraftValue('')
    setEditingIndex(null)
    setErrorMessage(null)
  }

  const handleSave = async () => {
    const trimmedValue = draftValue.trim()
    if (!trimmedValue) {
      setErrorMessage('Query cannot be empty.')
      return
    }

    let nextQueries = draftQueries
    if (mode === 'add') {
      nextQueries = [...draftQueries, trimmedValue]
    }
    if (mode === 'edit' && editingIndex !== null) {
      nextQueries = draftQueries.map((query, index) =>
        index === editingIndex ? trimmedValue : query
      )
    }

    setIsSaving(true)
    setErrorMessage(null)
    try {
      await onSaveQueries(nextQueries)
      setDraftQueries(nextQueries)
      handleCancel()
    } catch {
      setErrorMessage('Failed to save query. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (index: number) => {
    const nextQueries = draftQueries.filter((_, queryIndex) => queryIndex !== index)
    setIsSaving(true)
    setErrorMessage(null)
    try {
      await onSaveQueries(nextQueries)
      setDraftQueries(nextQueries)
      if (mode === 'edit' && editingIndex === index) {
        handleCancel()
      }
    } catch {
      setErrorMessage('Failed to delete query. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReorder = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    if (toIndex < 0 || toIndex >= draftQueries.length) return

    const nextQueries = [...draftQueries]
    const [moved] = nextQueries.splice(fromIndex, 1)
    nextQueries.splice(toIndex, 0, moved)

    setIsSaving(true)
    setErrorMessage(null)
    try {
      await onSaveQueries(nextQueries)
      setDraftQueries(nextQueries)
    } catch {
      setErrorMessage('Failed to reorder queries. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size='lg'>
        <ModalHeader>Golden queries</ModalHeader>
        <ModalBody>
          <div className='flex flex-col gap-3'>
            {draftQueries.length === 0 ? (
              <div className='flex items-center gap-3 text-[12px] text-[var(--text-secondary)]'>
                <Button variant='default' onClick={handleAddClick} disabled={isAddDisabled}>
                  Add Query
                </Button>
                <span>No queries added to this chat yet.</span>
              </div>
            ) : (
              <div className='flex flex-col gap-2'>
                {draftQueries.map((query, index) => (
                  <div
                    key={`${query}-${index}`}
                    className='group flex items-start gap-2 rounded-[8px] bg-[var(--bg-subtle)] px-3 py-2 text-left text-[13px] text-[var(--text-primary)] transition hover:bg-[var(--bg-subtle)]'
                    onDragOver={(event) => {
                      if (draggingIndex === null) return
                      event.preventDefault()
                    }}
                    onDrop={async (event) => {
                      if (draggingIndex === null) return
                      event.preventDefault()
                      const fromIndex = draggingIndex
                      setDraggingIndex(null)
                      await handleReorder(fromIndex, index)
                    }}
                    onDragEnd={() => setDraggingIndex(null)}
                  >
                    <div className='pt-0.5 opacity-0 transition group-hover:opacity-100'>
                      <button
                        type='button'
                        draggable={mode === null && !disabled && !isSaving}
                        onDragStart={() => setDraggingIndex(index)}
                        onDragEnd={() => setDraggingIndex(null)}
                        className='cursor-grab rounded p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40'
                        aria-label='Drag to reorder'
                        disabled={disabled || isSaving || mode !== null}
                      >
                        <GripVertical className='h-4 w-4' />
                      </button>
                    </div>
                    <button
                      type='button'
                      onClick={() => onSelectQuery(query)}
                      disabled={disabled || isSaving || mode !== null}
                      className='flex-1 text-left disabled:cursor-not-allowed disabled:opacity-60'
                    >
                      {query}
                    </button>
                    <div className='flex items-center gap-1 opacity-0 transition group-hover:opacity-100'>
                      <button
                        type='button'
                        onClick={() => handleEditClick(index)}
                        disabled={disabled || isSaving}
                        className='rounded p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60'
                        aria-label='Edit query'
                      >
                        <Pencil className='h-3.5 w-3.5' />
                      </button>
                      <button
                        type='button'
                        onClick={() => handleDelete(index)}
                        disabled={disabled || isSaving}
                        className='rounded p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60'
                        aria-label='Delete query'
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {mode !== null && (
              <div className='rounded-[8px] border border-[var(--border-200)] bg-white p-3'>
                <div className='flex items-center gap-2'>
                  <input
                    value={draftValue}
                    onChange={(event) => setDraftValue(event.target.value)}
                    placeholder='Type your query'
                    disabled={disabled || isSaving}
                    className='h-[34px] flex-1 rounded-[6px] border border-[var(--border-200)] px-3 text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary-hover-hex)] disabled:cursor-not-allowed disabled:opacity-60'
                  />
                  <Button variant='default' onClick={handleSave} disabled={disabled || isSaving}>
                    Save
                  </Button>
                  <Button variant='ghost' onClick={handleCancel} disabled={disabled || isSaving}>
                    <X className='h-4 w-4' />
                  </Button>
                </div>
                {errorMessage && (
                  <div className='mt-2 text-[12px] text-[var(--text-error)]'>{errorMessage}</div>
                )}
              </div>
            )}

            {draftQueries.length > 0 && (
              <div className='pt-1'>
                <Button variant='default' onClick={handleAddClick} disabled={isAddDisabled}>
                  Add Query
                </Button>
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant='default' onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
