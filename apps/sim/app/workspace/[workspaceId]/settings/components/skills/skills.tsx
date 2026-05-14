'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import { createLogger } from '@sim/logger'
import { ChevronDown, ChevronRight, FileText, Plus, Search } from 'lucide-react'
import { useParams } from 'next/navigation'
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@/components/emcn'
import { AgentSkillsIcon } from '@/components/icons'
import { Input } from '@/components/ui'
import { SkillModal } from '@/app/workspace/[workspaceId]/settings/components/skills/components/skill-modal'
import { SkillSkeleton } from '@/app/workspace/[workspaceId]/settings/components/skills/skill-skeleton'
import type { SkillDefinition, SkillNodeDefinition } from '@/hooks/queries/skills'
import { useDeleteSkill, useSkills } from '@/hooks/queries/skills'

const logger = createLogger('SkillsSettings')
const MAX_VISIBLE_REFERENCE_FILES = 12

function getSkillNodeDisplayPath(path: string): string {
  return path.replace(/\/SKILL\.md$/, '')
}

function getNodeFileName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

function splitSkillNodes(nodes: SkillNodeDefinition[] = []) {
  return {
    skillNodes: nodes.filter((node) => node.type === 'skill'),
    referenceNodes: nodes.filter((node) => node.type === 'file'),
  }
}

interface SkillPackCardProps {
  skill: SkillDefinition
  isExpanded: boolean
  isDeleting: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

function SkillPackCard({
  skill,
  isExpanded,
  isDeleting,
  onToggle,
  onEdit,
  onDelete,
}: SkillPackCardProps) {
  const { skillNodes, referenceNodes } = splitSkillNodes(skill.nodes)
  const visibleReferenceNodes = referenceNodes.slice(0, MAX_VISIBLE_REFERENCE_FILES)
  const hiddenReferenceCount = referenceNodes.length - visibleReferenceNodes.length
  const hasTreeNodes = (skill.nodes?.length ?? 0) > 0
  const canEditInline = (skill.nodeCount ?? 0) <= 1
  const summary =
    skillNodes.length > 0
      ? `${skillNodes.length} skills${referenceNodes.length > 0 ? `, ${referenceNodes.length} reference files` : ''}`
      : `${skill.nodeCount ?? skill.nodes?.length ?? 0} nodes`

  return (
    <div className='rounded-[8px] border border-[var(--border-1)] p-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 flex-1 gap-2'>
          <button
            type='button'
            onClick={onToggle}
            disabled={!hasTreeNodes}
            className='mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center text-[var(--text-tertiary)] disabled:opacity-40'
            aria-label={isExpanded ? 'Collapse skill pack' : 'Expand skill pack'}
          >
            {isExpanded ? (
              <ChevronDown className='h-[14px] w-[14px]' />
            ) : (
              <ChevronRight className='h-[14px] w-[14px]' />
            )}
          </button>
          <div className='flex min-w-0 flex-col justify-center gap-[1px]'>
            <span className='truncate font-medium text-base'>{skill.name}</span>
            <p className='truncate text-[var(--text-muted)] text-sm'>{skill.description}</p>
            <p className='truncate text-[11px] text-[var(--text-tertiary)]'>
              {summary}
              {skill.sourceUrl ? ` - ${skill.rootPath || skill.sourceUrl}` : ''}
            </p>
          </div>
        </div>
        <div className='flex flex-shrink-0 items-center gap-2'>
          {canEditInline && (
            <Button variant='default' onClick={onEdit}>
              Edit
            </Button>
          )}
          <Button variant='ghost' onClick={onDelete} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
      {isExpanded && hasTreeNodes && (
        <div className='mt-3 flex flex-col gap-3 border-[var(--border-1)] border-t pt-3'>
          {skillNodes.length > 0 && (
            <SkillNodeSection title='Skills' count={skillNodes.length}>
              {skillNodes.map((node) => (
                <div key={node.id} className='flex min-w-0 items-start gap-2'>
                  <AgentSkillsIcon className='mt-0.5 h-[13px] w-[13px] flex-shrink-0 text-[var(--text-tertiary)]' />
                  <div className='min-w-0 flex-1'>
                    <div className='truncate font-medium text-[12px] text-[var(--text-primary)]'>
                      {node.name}
                    </div>
                    {node.description && (
                      <p className='truncate text-[11px] text-[var(--text-muted)]'>
                        {node.description}
                      </p>
                    )}
                    <p className='truncate text-[11px] text-[var(--text-tertiary)]'>
                      {getSkillNodeDisplayPath(node.path)}
                    </p>
                  </div>
                </div>
              ))}
            </SkillNodeSection>
          )}

          {referenceNodes.length > 0 && (
            <SkillNodeSection title='Reference Files' count={referenceNodes.length}>
              {visibleReferenceNodes.map((node) => (
                <div key={node.id} className='flex min-w-0 items-center gap-2'>
                  <FileText className='h-[13px] w-[13px] flex-shrink-0 text-[var(--text-tertiary)]' />
                  <span className='truncate text-[12px] text-[var(--text-muted)]'>
                    {getNodeFileName(node.path)}
                  </span>
                  <span className='min-w-0 flex-1 truncate text-[11px] text-[var(--text-tertiary)]'>
                    {node.path}
                  </span>
                </div>
              ))}
              {hiddenReferenceCount > 0 && (
                <div className='text-[11px] text-[var(--text-tertiary)]'>
                  {hiddenReferenceCount} more reference files available to agents
                </div>
              )}
            </SkillNodeSection>
          )}
        </div>
      )}
    </div>
  )
}

interface SkillNodeSectionProps {
  title: string
  count: number
  children: ReactNode
}

function SkillNodeSection({ title, count, children }: SkillNodeSectionProps) {
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='font-medium text-[11px] text-[var(--text-tertiary)] uppercase tracking-wide'>
        {title} ({count})
      </div>
      <div className='flex flex-col gap-1.5'>{children}</div>
    </div>
  )
}

export function Skills() {
  const params = useParams()
  const workspaceId = params.workspaceId as string

  const { data: skills = [], isLoading, error, refetch: refetchSkills } = useSkills(workspaceId)
  const deleteSkillMutation = useDeleteSkill()

  const [searchTerm, setSearchTerm] = useState('')
  const [deletingSkills, setDeletingSkills] = useState<Set<string>>(() => new Set())
  const [editingSkill, setEditingSkill] = useState<SkillDefinition | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [skillToDelete, setSkillToDelete] = useState<{ id: string; name: string } | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(() => new Set())

  const filteredSkills = skills.filter((s) => {
    if (!searchTerm.trim()) return true
    const searchLower = searchTerm.toLowerCase()
    return (
      s.name.toLowerCase().includes(searchLower) ||
      s.description.toLowerCase().includes(searchLower) ||
      (s.nodes ?? []).some(
        (node) =>
          node.name.toLowerCase().includes(searchLower) ||
          node.path.toLowerCase().includes(searchLower) ||
          (node.description ?? '').toLowerCase().includes(searchLower)
      )
    )
  })

  const handleDeleteClick = (skillId: string) => {
    const s = skills.find((sk) => sk.id === skillId)
    if (!s) return

    setSkillToDelete({ id: skillId, name: s.name })
    setShowDeleteDialog(true)
  }

  const handleDeleteSkill = async () => {
    if (!skillToDelete) return

    setDeletingSkills((prev) => new Set(prev).add(skillToDelete.id))
    setShowDeleteDialog(false)

    try {
      await deleteSkillMutation.mutateAsync({
        workspaceId,
        skillId: skillToDelete.id,
      })
      logger.info(`Deleted skill: ${skillToDelete.id}`)
    } catch (error) {
      logger.error('Error deleting skill:', error)
    } finally {
      setDeletingSkills((prev) => {
        const next = new Set(prev)
        next.delete(skillToDelete.id)
        return next
      })
      setSkillToDelete(null)
    }
  }

  const handleSkillSaved = () => {
    setShowAddForm(false)
    setEditingSkill(null)
    refetchSkills()
  }

  const toggleExpanded = (skillId: string) => {
    setExpandedSkills((prev) => {
      const next = new Set(prev)
      if (next.has(skillId)) {
        next.delete(skillId)
      } else {
        next.add(skillId)
      }
      return next
    })
  }

  const hasSkills = skills && skills.length > 0
  const showEmptyState = !hasSkills && !showAddForm && !editingSkill
  const showNoResults = searchTerm.trim() && filteredSkills.length === 0 && skills.length > 0

  return (
    <>
      <div className='flex h-full flex-col gap-4.5'>
        <div className='flex items-center gap-2'>
          <div className='flex flex-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 transition-colors duration-100 dark:bg-[var(--surface-4)] dark:hover-hover:border-[var(--border-1)] dark:hover-hover:bg-[var(--surface-5)]'>
            <Search
              className='h-[14px] w-[14px] flex-shrink-0 text-[var(--text-tertiary)]'
              strokeWidth={2}
            />
            <Input
              placeholder='Search skills...'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isLoading}
              className='h-auto flex-1 border-0 bg-transparent p-0 font-base leading-none placeholder:text-[var(--text-tertiary)] focus-visible:ring-0 focus-visible:ring-offset-0'
            />
          </div>
          <Button onClick={() => setShowAddForm(true)} disabled={isLoading} variant='primary'>
            <Plus className='mr-1.5 h-[13px] w-[13px]' />
            Add
          </Button>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto'>
          {error ? (
            <div className='flex h-full flex-col items-center justify-center gap-2'>
              <p className='text-[var(--error)] text-xs leading-tight dark:text-[var(--error)]'>
                {error instanceof Error ? error.message : 'Failed to load skills'}
              </p>
            </div>
          ) : isLoading ? (
            <div className='flex flex-col gap-2'>
              <SkillSkeleton />
              <SkillSkeleton />
              <SkillSkeleton />
            </div>
          ) : showEmptyState ? (
            <div className='flex h-full items-center justify-center text-[var(--text-muted)] text-sm'>
              Click "Add" above to get started
            </div>
          ) : (
            <div className='flex flex-col gap-2'>
              {filteredSkills.map((s) => (
                <SkillPackCard
                  key={s.id}
                  skill={s}
                  isExpanded={expandedSkills.has(s.id)}
                  isDeleting={deletingSkills.has(s.id)}
                  onToggle={() => toggleExpanded(s.id)}
                  onEdit={() => setEditingSkill(s)}
                  onDelete={() => handleDeleteClick(s.id)}
                />
              ))}
              {showNoResults && (
                <div className='py-4 text-center text-[var(--text-muted)] text-sm'>
                  No skills found matching "{searchTerm}"
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <SkillModal
        open={showAddForm || !!editingSkill}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddForm(false)
            setEditingSkill(null)
          }
        }}
        onSave={handleSkillSaved}
        onDelete={(skillId) => {
          setEditingSkill(null)
          handleDeleteClick(skillId)
        }}
        initialValues={editingSkill ?? undefined}
      />

      <Modal open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <ModalContent size='sm'>
          <ModalHeader>Delete Skill</ModalHeader>
          <ModalBody>
            <p className='text-[var(--text-secondary)]'>
              Are you sure you want to delete{' '}
              <span className='font-medium text-[var(--text-primary)]'>{skillToDelete?.name}</span>?{' '}
              This action cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant='default' onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant='destructive' onClick={handleDeleteSkill}>
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
