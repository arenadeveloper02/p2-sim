'use client'

import type { ChangeEvent } from 'react'
import { useCallback, useRef, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { Button, Input, Label, Textarea } from '@/components/emcn'
import { Upload } from '@/components/emcn/icons'
import { cn } from '@/lib/core/utils/cn'
import type { SkillImportPreview } from '@/hooks/queries/skills'
import { usePreviewSkillImport } from '@/hooks/queries/skills'
import { extractSkillFromZip, parseSkillMarkdown } from './utils'

interface ImportedSkill {
  name: string
  description: string
  content: string
}

interface SkillImportProps {
  onImport: (data: ImportedSkill) => void
  onImportPack: (preview: SkillImportPreview) => Promise<void>
}

type ImportState = 'idle' | 'loading' | 'error'

const ACCEPTED_EXTENSIONS = ['.md', '.zip']

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

export function SkillImport({ onImport, onImportPack }: SkillImportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { mutateAsync: previewSkillImport } = usePreviewSkillImport()

  const [dragCounter, setDragCounter] = useState(0)
  const isDragging = dragCounter > 0
  const [fileState, setFileState] = useState<ImportState>('idle')
  const [fileError, setFileError] = useState('')

  const [githubUrl, setGithubUrl] = useState('')
  const [githubState, setGithubState] = useState<ImportState>('idle')
  const [githubError, setGithubError] = useState('')
  const [githubPreview, setGithubPreview] = useState<SkillImportPreview | null>(null)
  const [isSavingPreview, setIsSavingPreview] = useState(false)

  const [pasteContent, setPasteContent] = useState('')
  const [pasteError, setPasteError] = useState('')

  const processFile = useCallback(
    async (file: File) => {
      if (!isAcceptedFile(file)) {
        setFileError('Unsupported file type. Use .md or .zip files.')
        setFileState('error')
        return
      }

      setFileState('loading')
      setFileError('')

      try {
        let rawContent: string

        if (file.name.toLowerCase().endsWith('.zip')) {
          if (file.size > 5 * 1024 * 1024) {
            setFileError('ZIP file is too large (max 5 MB)')
            setFileState('error')
            return
          }
          rawContent = await extractSkillFromZip(file)
        } else {
          rawContent = await file.text()
        }

        const parsed = parseSkillMarkdown(rawContent)
        setFileState('idle')
        onImport(parsed)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to process file'
        setFileError(message)
        setFileState('error')
      }
    },
    [onImport]
  )

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [processFile]
  )

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragCounter((prev) => prev + 1)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragCounter((prev) => prev - 1)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragCounter(0)

      const file = e.dataTransfer.files?.[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleGithubImport = useCallback(async () => {
    const trimmed = githubUrl.trim()
    if (!trimmed) {
      setGithubError('Please enter a GitHub URL')
      setGithubState('error')
      return
    }

    setGithubState('loading')
    setGithubError('')
    setGithubPreview(null)

    try {
      const preview = await previewSkillImport({ url: trimmed })
      setGithubState('idle')

      if (preview.skillCount === 1 && preview.fileCount === 1) {
        onImport({
          name: preview.name,
          description: preview.description,
          content: preview.content,
        })
        return
      }

      setGithubPreview(preview)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import from GitHub'
      setGithubError(message)
      setGithubState('error')
    }
  }, [githubUrl, onImport, previewSkillImport])

  const handleSavePreview = useCallback(async () => {
    if (!githubPreview) return

    setIsSavingPreview(true)
    setGithubError('')

    try {
      await onImportPack(githubPreview)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save skill pack'
      setGithubError(message)
      setGithubState('error')
    } finally {
      setIsSavingPreview(false)
    }
  }, [githubPreview, onImportPack])

  const handlePasteImport = useCallback(() => {
    const trimmed = pasteContent.trim()
    if (!trimmed) {
      setPasteError('Please paste some content first')
      return
    }

    setPasteError('')
    const parsed = parseSkillMarkdown(trimmed)
    onImport(parsed)
  }, [pasteContent, onImport])

  return (
    <div className='flex flex-col gap-[18px]'>
      {/* File drop zone */}
      <div className='flex flex-col gap-1'>
        <Label className='font-medium text-[14px]'>Upload File</Label>
        <button
          type='button'
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={fileState === 'loading'}
          className={cn(
            'flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed px-4 py-8 transition-colors',
            'border-[var(--border-1)] bg-[var(--surface-1)] hover:bg-[var(--surface-4)]',
            isDragging && 'border-[var(--surface-7)] bg-[var(--surface-4)]',
            fileState === 'loading' && 'pointer-events-none opacity-60'
          )}
        >
          <input
            ref={fileInputRef}
            type='file'
            accept='.md,.zip'
            onChange={handleFileChange}
            className='hidden'
          />
          {fileState === 'loading' ? (
            <Loader2 className='h-[20px] w-[20px] animate-spin text-[var(--text-tertiary)]' />
          ) : (
            <Upload className='h-[20px] w-[20px] text-[var(--text-tertiary)]' />
          )}
          <div className='flex flex-col gap-0.5 text-center'>
            <span className='text-[14px] text-[var(--text-primary)]'>
              {isDragging ? 'Drop file here' : 'Drop file here or click to browse'}
            </span>
            <span className='text-[11px] text-[var(--text-tertiary)]'>
              .md file with YAML frontmatter, or .zip containing a SKILL.md
            </span>
          </div>
        </button>
        {fileError && <p className='text-[13px] text-[var(--text-error)]'>{fileError}</p>}
      </div>

      <Divider />

      {/* GitHub URL */}
      <div className='flex flex-col gap-1'>
        <Label htmlFor='skill-github-url' className='font-medium text-[14px]'>
          Import from GitHub
        </Label>
        <div className='flex gap-2'>
          <Input
            id='skill-github-url'
            placeholder='https://github.com/owner/repo or .../tree/main/skills'
            value={githubUrl}
            onChange={(e) => {
              setGithubUrl(e.target.value)
              setGithubPreview(null)
              if (githubError) setGithubError('')
            }}
            className='flex-1'
            disabled={githubState === 'loading'}
          />
          <Button
            variant='default'
            onClick={handleGithubImport}
            disabled={githubState === 'loading' || !githubUrl.trim()}
          >
            {githubState === 'loading' ? (
              <Loader2 className='h-[14px] w-[14px] animate-spin' />
            ) : (
              'Fetch'
            )}
          </Button>
        </div>
        {githubError && <p className='text-[13px] text-[var(--text-error)]'>{githubError}</p>}
        {githubPreview && (
          <div className='mt-2 rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-1)] p-3'>
            <div className='flex items-start gap-2'>
              <FileText className='mt-0.5 h-[14px] w-[14px] text-[var(--text-tertiary)]' />
              <div className='min-w-0 flex-1'>
                <div className='truncate font-medium text-[13px] text-[var(--text-primary)]'>
                  {githubPreview.name}
                </div>
                <p className='mt-0.5 line-clamp-2 text-[12px] text-[var(--text-muted)]'>
                  {githubPreview.description}
                </p>
                <p className='mt-1 text-[11px] text-[var(--text-tertiary)]'>
                  {githubPreview.skillCount} skills, {githubPreview.fileCount} files from{' '}
                  {githubPreview.rootPath || 'repository root'}
                </p>
              </div>
            </div>
            <div className='mt-3 flex justify-end'>
              <Button variant='primary' onClick={handleSavePreview} disabled={isSavingPreview}>
                {isSavingPreview ? 'Importing...' : 'Import Pack'}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Divider />

      {/* Paste content */}
      <div className='flex flex-col gap-1'>
        <Label htmlFor='skill-paste' className='font-medium text-[14px]'>
          Paste SKILL.md Content
        </Label>
        <Textarea
          id='skill-paste'
          placeholder={
            '---\nname: my-skill\ndescription: What this skill does\n---\n\n# Instructions...'
          }
          value={pasteContent}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
            setPasteContent(e.target.value)
            if (pasteError) setPasteError('')
          }}
          className='min-h-[120px] resize-y font-mono text-[14px]'
        />
        {pasteError && <p className='text-[13px] text-[var(--text-error)]'>{pasteError}</p>}
        <div className='flex justify-end'>
          <Button variant='default' onClick={handlePasteImport} disabled={!pasteContent.trim()}>
            Import
          </Button>
        </div>
      </div>
    </div>
  )
}

function Divider() {
  return (
    <div className='flex items-center gap-3'>
      <div className='h-px flex-1 bg-[var(--border-1)]' />
      <span className='text-[12px] text-[var(--text-tertiary)]'>or</span>
      <div className='h-px flex-1 bg-[var(--border-1)]' />
    </div>
  )
}
