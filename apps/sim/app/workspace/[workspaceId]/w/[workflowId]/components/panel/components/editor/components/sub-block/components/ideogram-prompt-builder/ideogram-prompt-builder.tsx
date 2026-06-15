'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { generateId } from '@sim/utils/id'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  Maximize2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { Combobox, Input, Textarea } from '@/components/emcn'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/core/utils/cn'
import {
  buildIdeogramJsonPrompt,
  createDefaultIdeogramPromptBuilderValue,
  ideogramV4JsonPromptToBuilderValue,
  parseIdeogramPromptBuilderValue,
} from '@/lib/ideogram/build-json-prompt'
import { IDEOGRAM_RENDERING_SPEEDS, IDEOGRAM_V4_RESOLUTIONS } from '@/lib/ideogram/constants'
import type {
  IdeogramBuilderElement,
  IdeogramPromptBuilderValue,
  IdeogramV4JsonPrompt,
} from '@/lib/ideogram/types'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'
import { BboxCanvas } from './bbox-canvas'

interface IdeogramPromptBuilderProps {
  blockId: string
  subBlockId: string
  isPreview?: boolean
  previewValue?: IdeogramPromptBuilderValue | null
  disabled?: boolean
}

interface StandaloneEditorWindowProps {
  targetWindow: Window | null
  title: string
  onClose: () => void
  children: ReactNode
}

function createObjElement(): IdeogramBuilderElement {
  return { id: generateId(), type: 'obj', desc: '', shape: 'rectangle' }
}

function createTextElement(): IdeogramBuilderElement {
  return { id: generateId(), type: 'text', text: '', desc: '', shape: 'rectangle' }
}

function copyDocumentStyles(targetDocument: Document) {
  targetDocument.head.replaceChildren()
  targetDocument.documentElement.className = document.documentElement.className
  targetDocument.body.className = document.body.className
  targetDocument.body.style.margin = '0'
  targetDocument.body.style.background = 'var(--surface-1)'
  targetDocument.body.style.color = 'var(--text-body)'

  for (const node of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
    targetDocument.head.appendChild(node.cloneNode(true))
  }
}

function StandaloneEditorWindow({
  targetWindow,
  title,
  onClose,
  children,
}: StandaloneEditorWindowProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!targetWindow) return

    const targetDocument = targetWindow.document
    copyDocumentStyles(targetDocument)
    targetDocument.title = title
    targetDocument.body.replaceChildren()

    const root = targetDocument.createElement('div')
    targetDocument.body.appendChild(root)
    setContainer(root)
    targetWindow.focus()

    const handleBeforeUnload = () => onClose()
    targetWindow.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      targetWindow.removeEventListener('beforeunload', handleBeforeUnload)
      setContainer(null)
      if (!targetWindow.closed) {
        targetWindow.close()
      }
    }
  }, [onClose, targetWindow, title])

  if (!container) return null

  return createPortal(children, container)
}

/** Visual builder for Ideogram v4 structured json_prompt composition. */
export function IdeogramPromptBuilder({
  blockId,
  subBlockId,
  isPreview = false,
  previewValue,
  disabled = false,
}: IdeogramPromptBuilderProps) {
  const [storeValue, setStoreValue] = useSubBlockValue<IdeogramPromptBuilderValue>(
    blockId,
    subBlockId
  )
  const [importError, setImportError] = useState<string | null>(null)
  const [selectedElementId, setSelectedElementId] = useState<string | undefined>(undefined)
  const [isExpandedEditorOpen, setIsExpandedEditorOpen] = useState(false)
  const [expandedEditorWindow, setExpandedEditorWindow] = useState<Window | null>(null)

  const value = isPreview ? previewValue : storeValue
  const builderValue = parseIdeogramPromptBuilderValue(
    value ?? createDefaultIdeogramPromptBuilderValue()
  )
  const isReadOnly = isPreview || disabled
  const activeElementId = builderValue.elements.some((element) => element.id === selectedElementId)
    ? selectedElementId
    : builderValue.elements[0]?.id
  const activeElement = builderValue.elements.find((element) => element.id === activeElementId)

  useEffect(() => {
    if (!selectedElementId) return
    if (builderValue.elements.some((element) => element.id === selectedElementId)) return
    setSelectedElementId(undefined)
  }, [builderValue.elements, selectedElementId])

  const buildResult = useMemo(() => {
    try {
      const result = buildIdeogramJsonPrompt(builderValue)
      return {
        error: null as string | null,
        preview: JSON.stringify(result.jsonPrompt, null, 2),
        magicPrompt: result.magicPrompt,
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Invalid prompt',
        preview: '',
        magicPrompt: '',
      }
    }
  }, [builderValue])

  const resolutionOptions = useMemo(
    () => IDEOGRAM_V4_RESOLUTIONS.map((resolution) => ({ value: resolution, label: resolution })),
    []
  )
  const renderingSpeedOptions = useMemo(
    () => IDEOGRAM_RENDERING_SPEEDS.map((speed) => ({ value: speed, label: speed })),
    []
  )
  const shapeOptions = useMemo(
    () => [
      { value: 'rectangle', label: 'Rectangle' },
      { value: 'ellipse', label: 'Ellipse' },
      { value: 'freehand', label: 'Freehand hint' },
      { value: 'line', label: 'Line hint' },
    ],
    []
  )

  const updateValue = useCallback(
    (patch: Partial<IdeogramPromptBuilderValue>) => {
      if (isReadOnly) return
      setStoreValue({ ...builderValue, ...patch })
    },
    [builderValue, isReadOnly, setStoreValue]
  )

  const updateElement = useCallback(
    (id: string, patch: Partial<IdeogramBuilderElement>) => {
      if (isReadOnly) return
      updateValue({
        elements: builderValue.elements.map((element) =>
          element.id === id ? ({ ...element, ...patch } as IdeogramBuilderElement) : element
        ),
      })
    },
    [builderValue.elements, isReadOnly, updateValue]
  )

  const removeElement = useCallback(
    (id: string) => {
      if (isReadOnly) return
      const elementIndex = builderValue.elements.findIndex((element) => element.id === id)
      const nextElements = builderValue.elements.filter((element) => element.id !== id)
      updateValue({ elements: nextElements })
      if (selectedElementId === id) {
        setSelectedElementId(
          nextElements[Math.min(elementIndex, nextElements.length - 1)]?.id ?? undefined
        )
      }
    },
    [builderValue.elements, isReadOnly, selectedElementId, updateValue]
  )

  const addElement = useCallback(
    (type: 'obj' | 'text') => {
      if (isReadOnly) return
      const element = type === 'obj' ? createObjElement() : createTextElement()
      setSelectedElementId(element.id)
      updateValue({ elements: [...builderValue.elements, element] })
    },
    [builderValue.elements, isReadOnly, updateValue]
  )

  const duplicateElement = useCallback(
    (element: IdeogramBuilderElement) => {
      if (isReadOnly) return
      const index = builderValue.elements.findIndex((item) => item.id === element.id)
      const nextElement = { ...element, id: generateId() } as IdeogramBuilderElement
      const nextElements = [...builderValue.elements]
      nextElements.splice(index + 1, 0, nextElement)
      setSelectedElementId(nextElement.id)
      updateValue({ elements: nextElements })
    },
    [builderValue.elements, isReadOnly, updateValue]
  )

  const moveElement = useCallback(
    (id: string, direction: -1 | 1) => {
      if (isReadOnly) return
      const index = builderValue.elements.findIndex((element) => element.id === id)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= builderValue.elements.length) return
      const nextElements = [...builderValue.elements]
      const [element] = nextElements.splice(index, 1)
      nextElements.splice(nextIndex, 0, element)
      updateValue({ elements: nextElements })
    },
    [builderValue.elements, isReadOnly, updateValue]
  )

  const handleImport = useCallback(() => {
    if (isReadOnly) return
    setImportError(null)
    const raw = window.prompt('Paste Ideogram v4 json_prompt JSON')
    if (!raw?.trim()) return

    try {
      const parsed = JSON.parse(raw) as IdeogramV4JsonPrompt
      const imported = ideogramV4JsonPromptToBuilderValue(parsed, builderValue.resolution)
      setStoreValue(imported)
      setSelectedElementId(imported.elements[0]?.id)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Invalid JSON')
    }
  }, [builderValue.resolution, isReadOnly, setStoreValue])

  const handleExport = useCallback(() => {
    if (!buildResult.preview) return
    const blob = new Blob([buildResult.preview], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'ideogram-json-prompt.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }, [buildResult.preview])

  const handleCopy = useCallback(async () => {
    if (!buildResult.preview) return
    await navigator.clipboard.writeText(buildResult.preview)
  }, [buildResult.preview])

  const openExpandedEditorWindow = useCallback(() => {
    const popup = window.open(
      '',
      'ideogram-prompt-editor',
      'popup,width=1280,height=900,left=80,top=80,resizable=yes,scrollbars=yes'
    )
    if (!popup) return

    setExpandedEditorWindow(popup)
    setIsExpandedEditorOpen(true)
  }, [])

  const closeExpandedEditorWindow = useCallback(() => {
    setIsExpandedEditorOpen(false)
    setExpandedEditorWindow(null)
  }, [])

  return (
    <div className='space-y-4'>
      <div className='grid gap-3'>
        <div className='space-y-1'>
          <p className='text-[12px] font-medium text-[var(--text-body)]'>High-level description</p>
          <Textarea
            value={builderValue.highLevelDescription}
            onChange={(event) => updateValue({ highLevelDescription: event.target.value })}
            placeholder='Overall scene description'
            disabled={isReadOnly}
            rows={3}
          />
        </div>
        <div className='space-y-1'>
          <p className='text-[12px] font-medium text-[var(--text-body)]'>Background</p>
          <Textarea
            value={builderValue.background}
            onChange={(event) => updateValue({ background: event.target.value })}
            placeholder='Background setting and atmosphere'
            disabled={isReadOnly}
            rows={2}
          />
        </div>
      </div>

      <div className='space-y-2'>
        <p className='text-[12px] font-medium text-[var(--text-body)]'>Canvas resolution</p>
        <Combobox
          options={resolutionOptions}
          value={builderValue.resolution}
          onChange={(next) =>
            updateValue({ resolution: next as IdeogramPromptBuilderValue['resolution'] })
          }
          disabled={isReadOnly}
        />
      </div>

      <div className='space-y-2 rounded-md border border-[var(--border-subtle)] p-3'>
        <div className='flex items-center justify-between gap-2'>
          <p className='text-[12px] font-medium text-[var(--text-body)]'>
            Magic Prompt and reference
          </p>
          <Button
            type='button'
            size='sm'
            variant={builderValue.magicPromptEnabled ? 'default' : 'outline'}
            onClick={() => updateValue({ magicPromptEnabled: !builderValue.magicPromptEnabled })}
            disabled={isReadOnly}
          >
            Magic Prompt {builderValue.magicPromptEnabled ? 'On' : 'Off'}
          </Button>
        </div>
        <Input
          value={builderValue.referenceImageUrl ?? ''}
          onChange={(event) => updateValue({ referenceImageUrl: event.target.value })}
          placeholder='Optional reference image URL for tracing the layout'
          disabled={isReadOnly}
        />
        <Input
          type='number'
          min='0'
          max='1'
          step='0.05'
          value={String(builderValue.referenceImageOpacity ?? 0.35)}
          onChange={(event) =>
            updateValue({ referenceImageOpacity: Number(event.target.value || 0.35) })
          }
          placeholder='Reference image opacity'
          disabled={isReadOnly}
        />
        <p className='text-[11px] text-[var(--text-body-secondary)]'>
          Magic Prompt uses the plain prompt preview through Ideogram&apos;s text_prompt path; JSON
          prompt remains the precise-layout path.
        </p>
      </div>

      <div className='space-y-2 rounded-md border border-[var(--border-subtle)] p-3'>
        <p className='text-[12px] font-medium text-[var(--text-body)]'>
          Style description (optional)
        </p>
        <div className='grid gap-2'>
          <Input
            value={builderValue.styleDescription?.aesthetics ?? ''}
            onChange={(event) =>
              updateValue({
                styleDescription: {
                  aesthetics: event.target.value,
                  lighting: builderValue.styleDescription?.lighting ?? '',
                  medium: builderValue.styleDescription?.medium ?? '',
                  artStyle: builderValue.styleDescription?.artStyle,
                  photo: builderValue.styleDescription?.photo,
                },
              })
            }
            placeholder='Aesthetics (color, mood, tone)'
            disabled={isReadOnly}
          />
          <Input
            value={builderValue.styleDescription?.lighting ?? ''}
            onChange={(event) =>
              updateValue({
                styleDescription: {
                  aesthetics: builderValue.styleDescription?.aesthetics ?? '',
                  lighting: event.target.value,
                  medium: builderValue.styleDescription?.medium ?? '',
                  artStyle: builderValue.styleDescription?.artStyle,
                  photo: builderValue.styleDescription?.photo,
                },
              })
            }
            placeholder='Lighting'
            disabled={isReadOnly}
          />
          <Input
            value={builderValue.styleDescription?.medium ?? ''}
            onChange={(event) =>
              updateValue({
                styleDescription: {
                  aesthetics: builderValue.styleDescription?.aesthetics ?? '',
                  lighting: builderValue.styleDescription?.lighting ?? '',
                  medium: event.target.value,
                  artStyle: builderValue.styleDescription?.artStyle,
                  photo: builderValue.styleDescription?.photo,
                },
              })
            }
            placeholder='Medium (photo, illustration, 3D)'
            disabled={isReadOnly}
          />
        </div>
      </div>

      <div className='space-y-2'>
        <div className='flex items-center justify-between gap-2'>
          <p className='text-[12px] font-medium text-[var(--text-body)]'>Composition frame</p>
          <Button type='button' size='sm' variant='outline' onClick={openExpandedEditorWindow}>
            <Maximize2 className='size-[14px]' />
            Open in window
          </Button>
        </div>
        <div className='overflow-x-auto'>
          <BboxCanvas
            resolution={builderValue.resolution}
            elements={builderValue.elements}
            activeElementId={activeElementId}
            referenceImageUrl={builderValue.referenceImageUrl}
            referenceImageOpacity={builderValue.referenceImageOpacity}
            disabled={isReadOnly || builderValue.elements.length === 0}
            onSelectElement={setSelectedElementId}
            onChangeElementBbox={(id, bbox) => updateElement(id, { bbox })}
            onDeleteElement={removeElement}
          />
        </div>
      </div>

      <div className='space-y-3'>
        <div className='flex items-center justify-between gap-2'>
          <p className='text-[12px] font-medium text-[var(--text-body)]'>Elements</p>
          {!isReadOnly ? (
            <div className='flex gap-2'>
              <Button type='button' size='sm' variant='outline' onClick={() => addElement('obj')}>
                <Plus className='size-[14px]' />
                Object
              </Button>
              <Button type='button' size='sm' variant='outline' onClick={() => addElement('text')}>
                <Plus className='size-[14px]' />
                Text
              </Button>
            </div>
          ) : null}
        </div>

        {builderValue.elements.length === 0 ? (
          <p className='text-[12px] text-[var(--text-body-secondary)]'>No elements yet.</p>
        ) : (
          builderValue.elements.map((element, index) => (
            <div
              key={element.id}
              className={cn(
                'space-y-2 rounded-md border border-[var(--border-subtle)] p-3',
                element.id === activeElementId && 'border-[var(--accent-primary)]',
                element.hidden && 'opacity-60'
              )}
            >
              <div className='flex items-center justify-between gap-2'>
                <p className='text-[12px] font-medium text-[var(--text-body)]'>
                  {element.type === 'text' ? `Text ${index + 1}` : `Object ${index + 1}`}
                </p>
                {!isReadOnly ? (
                  <div className='flex items-center gap-1'>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      onClick={() => moveElement(element.id, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUp className='size-[14px] text-[var(--text-icon)]' />
                    </Button>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      onClick={() => moveElement(element.id, 1)}
                      disabled={index === builderValue.elements.length - 1}
                    >
                      <ArrowDown className='size-[14px] text-[var(--text-icon)]' />
                    </Button>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      onClick={() => updateElement(element.id, { hidden: !element.hidden })}
                    >
                      {element.hidden ? (
                        <EyeOff className='size-[14px] text-[var(--text-icon)]' />
                      ) : (
                        <Eye className='size-[14px] text-[var(--text-icon)]' />
                      )}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => setSelectedElementId(element.id)}
                    >
                      Select
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => duplicateElement(element)}
                    >
                      Duplicate
                    </Button>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      onClick={() => removeElement(element.id)}
                    >
                      <Trash2 className='size-[14px] text-[var(--text-icon)]' />
                    </Button>
                  </div>
                ) : null}
              </div>

              {element.type === 'text' ? (
                <Input
                  value={element.text}
                  onChange={(event) => updateElement(element.id, { text: event.target.value })}
                  placeholder='Literal text rendered in the image'
                  disabled={isReadOnly}
                />
              ) : null}

              <Input
                value={element.desc}
                onChange={(event) => updateElement(element.id, { desc: event.target.value })}
                placeholder='Description of how this element should appear'
                disabled={isReadOnly}
              />

              <div className='grid gap-2 sm:grid-cols-2'>
                <Input
                  value={element.color ?? ''}
                  onChange={(event) => updateElement(element.id, { color: event.target.value })}
                  placeholder='Color guidance, e.g. #FF3366 or warm red'
                  disabled={isReadOnly}
                />
                <Combobox
                  options={shapeOptions}
                  value={element.shape ?? 'rectangle'}
                  onChange={(next) =>
                    updateElement(element.id, {
                      shape: next as NonNullable<IdeogramBuilderElement['shape']>,
                    })
                  }
                  disabled={isReadOnly}
                />
              </div>

              <p className='text-[11px] text-[var(--text-body-secondary)]'>
                Region: {element.bbox ? element.bbox.join(', ') : 'not set'}. Select this row, then
                drag in the composition frame above.
              </p>
            </div>
          ))
        )}
      </div>

      <div className='space-y-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <p className='text-[12px] font-medium text-[var(--text-body)]'>JSON preview</p>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={handleImport}
            disabled={isReadOnly}
          >
            <Upload className='size-[14px]' />
            Import
          </Button>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={handleExport}
            disabled={!buildResult.preview}
          >
            <Download className='size-[14px]' />
            Export
          </Button>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={handleCopy}
            disabled={!buildResult.preview}
          >
            <Copy className='size-[14px]' />
            Copy
          </Button>
        </div>
        {importError ? (
          <p className='text-[12px] text-[var(--text-danger)]'>{importError}</p>
        ) : null}
        {buildResult.error ? (
          <p className='text-[12px] text-[var(--text-danger)]'>{buildResult.error}</p>
        ) : null}
        <pre
          className={cn(
            'max-h-64 overflow-auto rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3 text-[11px] text-[var(--text-body)]'
          )}
        >
          {buildResult.preview || 'Complete required fields to preview JSON.'}
        </pre>
        {builderValue.magicPromptEnabled ? (
          <div className='space-y-2'>
            <p className='text-[12px] font-medium text-[var(--text-body)]'>
              Magic Prompt text_prompt preview
            </p>
            <pre className='max-h-40 overflow-auto rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3 text-[11px] text-[var(--text-body)]'>
              {buildResult.magicPrompt ||
                'Complete required fields to preview the Magic Prompt text_prompt.'}
            </pre>
          </div>
        ) : null}
      </div>

      <div className='space-y-2'>
        <p className='text-[12px] font-medium text-[var(--text-body)]'>Rendering speed</p>
        <Combobox
          options={renderingSpeedOptions}
          value={builderValue.renderingSpeed ?? 'DEFAULT'}
          onChange={(next) =>
            updateValue({ renderingSpeed: next as IdeogramPromptBuilderValue['renderingSpeed'] })
          }
          disabled={isReadOnly}
        />
      </div>

      {isExpandedEditorOpen ? (
        <StandaloneEditorWindow
          targetWindow={expandedEditorWindow}
          title='Ideogram composition frame'
          onClose={closeExpandedEditorWindow}
        >
          <div className='flex h-screen flex-col bg-[var(--surface-1)] text-[var(--text-body)]'>
            <div className='flex items-center justify-between border-[var(--border-subtle)] border-b px-4 py-3'>
              <div className='min-w-0'>
                <p className='text-[13px] font-medium text-[var(--text-body)]'>
                  Ideogram composition frame
                </p>
                <p className='text-[11px] text-[var(--text-body-secondary)]'>
                  Select, draw, move, resize, and delete regions in this dedicated window.
                </p>
              </div>
              <Button type='button' size='sm' variant='outline' onClick={closeExpandedEditorWindow}>
                Close
              </Button>
            </div>

            <div className='grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,1fr)_360px]'>
              <div className='min-w-0 space-y-3 overflow-auto rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='min-w-0'>
                    <p className='text-[12px] font-medium text-[var(--text-body)]'>Full frame</p>
                    <p className='text-[11px] text-[var(--text-body-secondary)]'>
                      The frame shape follows the selected canvas resolution.
                    </p>
                  </div>
                  <Combobox
                    options={resolutionOptions}
                    value={builderValue.resolution}
                    onChange={(next) =>
                      updateValue({ resolution: next as IdeogramPromptBuilderValue['resolution'] })
                    }
                    disabled={isReadOnly}
                  />
                </div>
                <BboxCanvas
                  resolution={builderValue.resolution}
                  elements={builderValue.elements}
                  activeElementId={activeElementId}
                  referenceImageUrl={builderValue.referenceImageUrl}
                  referenceImageOpacity={builderValue.referenceImageOpacity}
                  canvasWidth={840}
                  disabled={isReadOnly || builderValue.elements.length === 0}
                  onSelectElement={setSelectedElementId}
                  onChangeElementBbox={(id, bbox) => updateElement(id, { bbox })}
                  onDeleteElement={removeElement}
                />
              </div>

              <div className='min-h-0 space-y-3 overflow-y-auto rounded-md border border-[var(--border-subtle)] p-3'>
                <div className='flex items-center justify-between gap-2'>
                  <p className='text-[12px] font-medium text-[var(--text-body)]'>Regions</p>
                  {!isReadOnly ? (
                    <div className='flex gap-2'>
                      <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        onClick={() => addElement('obj')}
                      >
                        <Plus className='size-[14px]' />
                        Object
                      </Button>
                      <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        onClick={() => addElement('text')}
                      >
                        <Plus className='size-[14px]' />
                        Text
                      </Button>
                    </div>
                  ) : null}
                </div>

                {activeElement ? (
                  <div className='space-y-2 rounded-md border border-[var(--border-subtle)] p-3'>
                    <div className='flex items-center justify-between gap-2'>
                      <p className='text-[12px] font-medium text-[var(--text-body)]'>
                        Selected {activeElement.type === 'text' ? 'text' : 'object'}
                      </p>
                      {!isReadOnly ? (
                        <Button
                          type='button'
                          size='icon'
                          variant='ghost'
                          onClick={() => removeElement(activeElement.id)}
                        >
                          <Trash2 className='size-[14px] text-[var(--text-icon)]' />
                        </Button>
                      ) : null}
                    </div>
                    {activeElement.type === 'text' ? (
                      <Input
                        value={activeElement.text}
                        onChange={(event) =>
                          updateElement(activeElement.id, { text: event.target.value })
                        }
                        placeholder='Literal text rendered in the image'
                        disabled={isReadOnly}
                      />
                    ) : null}
                    <Textarea
                      value={activeElement.desc}
                      onChange={(event) =>
                        updateElement(activeElement.id, { desc: event.target.value })
                      }
                      placeholder='Description of how this element should appear'
                      disabled={isReadOnly}
                      rows={3}
                    />
                    <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-1'>
                      <Input
                        value={activeElement.color ?? ''}
                        onChange={(event) =>
                          updateElement(activeElement.id, { color: event.target.value })
                        }
                        placeholder='Color guidance'
                        disabled={isReadOnly}
                      />
                      <Combobox
                        options={shapeOptions}
                        value={activeElement.shape ?? 'rectangle'}
                        onChange={(next) =>
                          updateElement(activeElement.id, {
                            shape: next as NonNullable<IdeogramBuilderElement['shape']>,
                          })
                        }
                        disabled={isReadOnly}
                      />
                    </div>
                    <p className='text-[11px] text-[var(--text-body-secondary)]'>
                      Region: {activeElement.bbox ? activeElement.bbox.join(', ') : 'not set'}.
                    </p>
                  </div>
                ) : (
                  <p className='text-[12px] text-[var(--text-body-secondary)]'>
                    Add an object or text region to begin planning the frame.
                  </p>
                )}

                <div className='space-y-2'>
                  {builderValue.elements.map((element, index) => (
                    <div
                      key={element.id}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-md border border-[var(--border-subtle)] p-2 text-left',
                        element.id === activeElementId && 'border-[var(--accent-primary)]',
                        element.hidden && 'opacity-60'
                      )}
                    >
                      <button
                        type='button'
                        className='min-w-0 flex-1 truncate text-left text-[12px] text-[var(--text-body)]'
                        onClick={() => setSelectedElementId(element.id)}
                      >
                        {index + 1}. {element.type === 'text' ? element.text || 'Text' : 'Object'}{' '}
                        {element.desc ? `- ${element.desc}` : ''}
                      </button>
                      <span
                        className='size-[10px] flex-shrink-0 rounded-full border border-[var(--border-subtle)]'
                        style={{ backgroundColor: element.color || 'transparent' }}
                      />
                      {!isReadOnly ? (
                        <Button
                          type='button'
                          size='icon'
                          variant='ghost'
                          onClick={() => removeElement(element.id)}
                        >
                          <Trash2 className='size-[14px] text-[var(--text-icon)]' />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </StandaloneEditorWindow>
      ) : null}
    </div>
  )
}
