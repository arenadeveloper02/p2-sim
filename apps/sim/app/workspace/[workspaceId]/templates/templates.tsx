'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { createLogger } from '@/lib/logs/console/logger'
import { NavigationTabs } from '@/app/workspace/[workspaceId]/templates/components/navigation-tabs'
import {
  TemplateCard,
  TemplateCardSkeleton,
} from '@/app/workspace/[workspaceId]/templates/components/template-card'
import type { WorkflowState } from '@/stores/workflows/workflow/types'

const logger = createLogger('TemplatesPage')

// Shared categories definition
export const categories = [
  { value: 'creative', label: 'Creative' },
  { value: 'ma', label: 'MA' },
  { value: 'ppc', label: 'PPC' },
  { value: 'sales', label: 'Sales' },
  { value: 'seo', label: 'SEO' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'waas', label: 'WAAS' },
] as const

export type CategoryValue = (typeof categories)[number]['value']

// Template data structure
export interface Template {
  id: string
  workflowId: string | null
  userId: string
  name: string
  description: string | null
  author: string
  views: number
  stars: number
  color: string
  icon: string
  category: CategoryValue
  state: WorkflowState
  createdAt: Date | string
  updatedAt: Date | string
  isStarred: boolean
}

interface TemplatesProps {
  initialTemplates: Template[]
  currentUserId: string
}

interface Workspace {
  id: string
  name: string
  ownerId: string
  role?: string
  membershipId?: string
  permissions?: 'admin' | 'write' | 'read' | null
}

export default function Templates({ initialTemplates, currentUserId }: TemplatesProps) {
  const router = useRouter()
  const params = useParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [activeTab, setActiveTab] = useState('your')
  const [templates, setTemplates] = useState<Template[]>(initialTemplates)
  const [loading, setLoading] = useState(false)

  // Refs for scrolling to sections
  const sectionRefs = {
    your: useRef<HTMLDivElement>(null),
    recent: useRef<HTMLDivElement>(null),
    creative: useRef<HTMLDivElement>(null),
    ma: useRef<HTMLDivElement>(null),
    ppc: useRef<HTMLDivElement>(null),
    sales: useRef<HTMLDivElement>(null),
    seo: useRef<HTMLDivElement>(null),
    strategy: useRef<HTMLDivElement>(null),
    waas: useRef<HTMLDivElement>(null),
  }

  // Fetch current workspace information
  useEffect(() => {
    const fetchCurrentWorkspace = async () => {
      try {
        const response = await fetch('/api/workspaces')
        const data = await response.json()

        if (data.workspaces && Array.isArray(data.workspaces)) {
          const workspaceId = params.workspaceId as string
          const workspace = data.workspaces.find((w: Workspace) => w.id === workspaceId)
          if (workspace) {
            setCurrentWorkspace(workspace)
          }
        }
      } catch (error) {
        logger.error('Error fetching workspace:', error)
      }
    }

    fetchCurrentWorkspace()
  }, [params.workspaceId])

  // Get your templates count (created by user OR starred by user)
  const yourTemplatesCount = templates.filter(
    (template) => template.userId === currentUserId || template.isStarred === true
  ).length

  // Handle case where active tab is "your" but user has no templates
  useEffect(() => {
    if (!loading && activeTab === 'your' && yourTemplatesCount === 0) {
      setActiveTab('recent') // Switch to recent tab
    }
  }, [loading, activeTab, yourTemplatesCount])

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId)
    const sectionRef = sectionRefs[tabId as keyof typeof sectionRefs]
    if (sectionRef.current) {
      sectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  }

  const handleCreateNew = () => {
    // TODO: Open create template modal or navigate to create page
    logger.info('Create new agent')
  }

  // Handle star change callback from template card
  const handleStarChange = (templateId: string, isStarred: boolean, newStarCount: number) => {
    setTemplates((prevTemplates) =>
      prevTemplates.map((template) =>
        template.id === templateId ? { ...template, isStarred, stars: newStarCount } : template
      )
    )
  }

  const filteredTemplates = (category: CategoryValue | 'your' | 'recent') => {
    let filteredByCategory = templates

    if (category === 'your') {
      // For "your" templates, show templates created by you OR starred by you
      filteredByCategory = templates.filter(
        (template) => template.userId === currentUserId || template.isStarred === true
      )
    } else if (category === 'recent') {
      // For "recent" templates, show the 8 most recent templates
      filteredByCategory = templates
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8)
    } else {
      filteredByCategory = templates.filter((template) => template.category === category)
    }

    if (!searchQuery) return filteredByCategory

    return filteredByCategory.filter(
      (template) =>
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.author.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }

  // Helper function to render template cards with proper type handling
  const renderTemplateCard = (template: Template) => (
    <TemplateCard
      key={template.id}
      id={template.id}
      title={template.name}
      description={template.description || ''}
      author={template.author}
      usageCount={template.views.toString()}
      stars={template.stars}
      icon={template.icon}
      iconColor={template.color}
      state={template.state as { blocks?: Record<string, { type: string; name?: string }> }}
      isStarred={template.isStarred}
      workspaceName={currentWorkspace?.name}
      onStarChange={handleStarChange}
    />
  )

  // Group templates by category for display
  const getTemplatesByCategory = (category: CategoryValue | 'your' | 'recent') => {
    return filteredTemplates(category)
  }

  // Render skeleton cards for loading state
  const renderSkeletonCards = () => {
    return Array.from({ length: 8 }).map((_, index) => (
      <TemplateCardSkeleton key={`skeleton-${index}`} />
    ))
  }

  // Calculate navigation tabs with real counts or skeleton counts
  const navigationTabs = [
    // Only include "Your templates" tab if user has created or starred templates
    ...(yourTemplatesCount > 0 || loading
      ? [
          {
            id: 'your',
            label: 'Your agents',
            count: loading ? 8 : getTemplatesByCategory('your').length,
          },
        ]
      : []),
    {
      id: 'recent',
      label: 'Recent',
      count: loading ? 8 : getTemplatesByCategory('recent').length,
    },
    {
      id: 'creative',
      label: 'Creative',
      count: loading ? 8 : getTemplatesByCategory('creative').length,
    },
    { id: 'ma', label: 'MA', count: loading ? 8 : getTemplatesByCategory('ma').length },
    { id: 'ppc', label: 'PPC', count: loading ? 8 : getTemplatesByCategory('ppc').length },
    { id: 'sales', label: 'Sales', count: loading ? 8 : getTemplatesByCategory('sales').length },
    { id: 'seo', label: 'SEO', count: loading ? 8 : getTemplatesByCategory('seo').length },
    {
      id: 'strategy',
      label: 'Strategy',
      count: loading ? 8 : getTemplatesByCategory('strategy').length,
    },
    { id: 'waas', label: 'WAAS', count: loading ? 8 : getTemplatesByCategory('waas').length },
  ]

  return (
    <div className='flex h-[100vh] flex-col pl-64'>
      <div className='flex flex-1 overflow-hidden'>
        <div className='flex flex-1 flex-col overflow-auto p-6'>
          {/* Header */}
          <div className='mb-6'>
            <h1 className='mb-2 font-sans font-semibold text-3xl text-foreground tracking-[0.01em]'>
              Agents
            </h1>
            <p className='font-[350] font-sans text-muted-foreground text-sm leading-[1.5] tracking-[0.01em]'>
              Grab a agent and start building, or make
              <br />
              one from scratch.
            </p>
          </div>

          {/* Search and Create New */}
          <div className='mb-6 flex items-center justify-between'>
            <div className='flex h-9 w-[460px] items-center gap-2 rounded-lg border bg-transparent pr-2 pl-3'>
              <Search className='h-4 w-4 text-muted-foreground' strokeWidth={2} />
              <Input
                placeholder='Search agents...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='flex-1 border-0 bg-transparent px-0 font-normal font-sans text-base text-foreground leading-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0'
              />
            </div>
            {/* <Button
              onClick={handleCreateNew}
              className='flex h-9 items-center gap-2 rounded-lg bg-[var(--brand-primary-hex)] px-4 py-2 font-normal font-sans text-sm text-white hover:bg-[#601EE0]'
            >
              <Plus className='h-4 w-4' />
              Create New
            </Button> */}
          </div>

          {/* Navigation */}
          <div className='mb-6'>
            <NavigationTabs
              tabs={navigationTabs}
              activeTab={activeTab}
              onTabClick={handleTabClick}
            />
          </div>

          {/* Your Templates Section */}
          {yourTemplatesCount > 0 || loading ? (
            <div ref={sectionRefs.your} className='mb-8'>
              <div className='mb-4 flex items-center gap-2'>
                <h2 className='font-medium font-sans text-foreground text-lg'>Your agents</h2>
                <ChevronRight className='h-4 w-4 text-muted-foreground' />
              </div>

              <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                {loading
                  ? renderSkeletonCards()
                  : getTemplatesByCategory('your').map((template) => renderTemplateCard(template))}
              </div>
            </div>
          ) : null}

          {/* Recent Templates Section */}
          <div ref={sectionRefs.recent} className='mb-8'>
            <div className='mb-4 flex items-center gap-2'>
              <h2 className='font-medium font-sans text-foreground text-lg'>Recent</h2>
              <ChevronRight className='h-4 w-4 text-muted-foreground' />
            </div>

            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {loading
                ? renderSkeletonCards()
                : getTemplatesByCategory('recent').map((template) => renderTemplateCard(template))}
            </div>
          </div>

          {/* Creative Section */}
          <div ref={sectionRefs.creative} className='mb-8'>
            <div className='mb-4 flex items-center gap-2'>
              <h2 className='font-medium font-sans text-foreground text-lg'>Creative</h2>
              <ChevronRight className='h-4 w-4 text-muted-foreground' />
            </div>

            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {loading
                ? renderSkeletonCards()
                : getTemplatesByCategory('creative').map((template) =>
                    renderTemplateCard(template)
                  )}
            </div>
          </div>

          {/* MA Section */}
          <div ref={sectionRefs.ma} className='mb-8'>
            <div className='mb-4 flex items-center gap-2'>
              <h2 className='font-medium font-sans text-foreground text-lg'>MA</h2>
              <ChevronRight className='h-4 w-4 text-muted-foreground' />
            </div>

            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {loading
                ? renderSkeletonCards()
                : getTemplatesByCategory('ma').map((template) => renderTemplateCard(template))}
            </div>
          </div>

          {/* PPC Section */}
          <div ref={sectionRefs.ppc} className='mb-8'>
            <div className='mb-4 flex items-center gap-2'>
              <h2 className='font-medium font-sans text-foreground text-lg'>PPC</h2>
              <ChevronRight className='h-4 w-4 text-muted-foreground' />
            </div>

            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {loading
                ? renderSkeletonCards()
                : getTemplatesByCategory('ppc').map((template) => renderTemplateCard(template))}
            </div>
          </div>

          {/* Sales Section */}
          <div ref={sectionRefs.sales} className='mb-8'>
            <div className='mb-4 flex items-center gap-2'>
              <h2 className='font-medium font-sans text-foreground text-lg'>Sales</h2>
              <ChevronRight className='h-4 w-4 text-muted-foreground' />
            </div>

            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {loading
                ? renderSkeletonCards()
                : getTemplatesByCategory('sales').map((template) => renderTemplateCard(template))}
            </div>
          </div>

          {/* SEO Section */}
          <div ref={sectionRefs.seo} className='mb-8'>
            <div className='mb-4 flex items-center gap-2'>
              <h2 className='font-medium font-sans text-foreground text-lg'>SEO</h2>
              <ChevronRight className='h-4 w-4 text-muted-foreground' />
            </div>

            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {loading
                ? renderSkeletonCards()
                : getTemplatesByCategory('seo').map((template) => renderTemplateCard(template))}
            </div>
          </div>

          {/* Strategy Section */}
          <div ref={sectionRefs.strategy} className='mb-8'>
            <div className='mb-4 flex items-center gap-2'>
              <h2 className='font-medium font-sans text-foreground text-lg'>Strategy</h2>
              <ChevronRight className='h-4 w-4 text-muted-foreground' />
            </div>

            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {loading
                ? renderSkeletonCards()
                : getTemplatesByCategory('strategy').map((template) =>
                    renderTemplateCard(template)
                  )}
            </div>
          </div>

          {/* WAAS Section */}
          <div ref={sectionRefs.waas} className='mb-8'>
            <div className='mb-4 flex items-center gap-2'>
              <h2 className='font-medium font-sans text-foreground text-lg'>WAAS</h2>
              <ChevronRight className='h-4 w-4 text-muted-foreground' />
            </div>

            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {loading
                ? renderSkeletonCards()
                : getTemplatesByCategory('waas').map((template) => renderTemplateCard(template))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
