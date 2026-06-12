'use client'

import { useCallback, useMemo, useState } from 'react'
import { Copy, Download, Plus, Trash2, Upload } from 'lucide-react'
import { generateId } from '@sim/utils/id'
import { Combobox, Input, Textarea } from '@/components/emcn'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/core/utils/cn'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'
import { BboxCanvas } from './bbox-canvas'

interface IdeogramPromptBuilderProps {
  blockId: string
  subBlockId: string
  isPreview?: boolean
  previewValue?: IdeogramPromptBuilderValue | null
  disabled?: boolean
}

function createObjElement(): IdeogramBuilderElement {
  return { id: generateId(), type: 'obj', desc: '' }
}

function createTextElement(): IdeogramBuilderElement {
  return { id: generateId(), type: 'text', text: '', desc: '' }
}

/** Visual builder for Ideogram v4 structured json_prompt composition. */
export function IdeogramPromptBuilder({
  blockId,
  subBlockId,
  isPreview = false,
  previewValue,
  disabled = false,
}: IdeogramPromptBuilderProps) {
  const [storeValue, setStoreValue] = useSubBlockValue<IdeogramPromptBuilderValue>(blockId, subBlockId)
  const [importError, setImportError] = useState<string | null>(null)

  const value = isPreview ? previewValue : storeValue
  const builderValue = parseIdeogramPromptBuilderValue(value ?? createDefaultIdeogramPromptBuilderValue())
  const isReadOnly = isPreview || disabled

  const buildResult = useMemo(() => {
    try {
      return { error: null as string | null, preview: JSON.stringify(buildIdeogramJsonPrompt(builderValue).jsonPrompt, null, 2) }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Invalid prompt',
        preview: '',
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
      updateValue({ elements: builderValue.elements.filter((element) => element.id !== id) })
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
        <p className='text-[12px] font-medium text-[var(--text-body)]'>Style description (optional)</p>
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

      <div className='space-y-3'>
        <div className='flex items-center justify-between gap-2'>
          <p className='text-[12px] font-medium text-[var(--text-body)]'>Elements</p>
          {!isReadOnly ? (
            <div className='flex gap-2'>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => updateValue({ elements: [...builderValue.elements, createObjElement()] })}
              >
                <Plus className='size-[14px]' />
                Object
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => updateValue({ elements: [...builderValue.elements, createTextElement()] })}
              >
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
              className='space-y-2 rounded-md border border-[var(--border-subtle)] p-3'
            >
              <div className='flex items-center justify-between gap-2'>
                <p className='text-[12px] font-medium text-[var(--text-body)]'>
                  {element.type === 'text' ? `Text ${index + 1}` : `Object ${index + 1}`}
                </p>
                {!isReadOnly ? (
                  <Button type='button' size='icon' variant='ghost' onClick={() => removeElement(element.id)}>
                    <Trash2 className='size-[14px] text-[var(--text-icon)]' />
                  </Button>
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

              <BboxCanvas
                resolution={builderValue.resolution}
                bbox={element.bbox}
                label='Region (optional)'
                disabled={isReadOnly}
                onChange={(bbox) => updateElement(element.id, { bbox })}
              />
            </div>
          ))
        )}
      </div>

      <div className='space-y-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <p className='text-[12px] font-medium text-[var(--text-body)]'>JSON preview</p>
          <Button type='button' size='sm' variant='outline' onClick={handleImport} disabled={isReadOnly}>
            <Upload className='size-[14px]' />
            Import
          </Button>
          <Button type='button' size='sm' variant='outline' onClick={handleExport} disabled={!buildResult.preview}>
            <Download className='size-[14px]' />
            Export
          </Button>
          <Button type='button' size='sm' variant='outline' onClick={handleCopy} disabled={!buildResult.preview}>
            <Copy className='size-[14px]' />
            Copy
          </Button>
        </div>
        {importError ? <p className='text-[12px] text-[var(--text-danger)]'>{importError}</p> : null}
        {buildResult.error ? <p className='text-[12px] text-[var(--text-danger)]'>{buildResult.error}</p> : null}
        <pre
          className={cn(
            'max-h-64 overflow-auto rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3 text-[11px] text-[var(--text-body)]'
          )}
        >
          {buildResult.preview || 'Complete required fields to preview JSON.'}
        </pre>
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
    </div>
  )
}
