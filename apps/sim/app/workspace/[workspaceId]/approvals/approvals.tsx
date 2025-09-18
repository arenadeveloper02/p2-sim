'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { CheckCircle, Clock, Search } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('Approvals')

interface ApprovalWorkflow {
  id: string
  name: string
  workflowId: string
  mappedWorkflowId: string
  status: string
  category: string | null
  description: string | null
  createdAt: string
  updatedAt: string
  ownerName: string | null
  ownerEmail: string
  approverName: string | null
  approverEmail: string
}

// Header component following the knowledge pattern
function ApprovalsHeader() {
  return (
    <div className='flex items-center justify-between px-6 pt-[14px] pb-6'>
      <div className='flex items-center gap-2'>
        <CheckCircle className='h-[18px] w-[18px] text-muted-foreground' />
        <span className='font-medium text-sm'>Approvals</span>
      </div>
    </div>
  )
}

export function Approvals() {
  const params = useParams()
  const router = useRouter()
  const workspaceId = params.workspaceId as string

  const [pendingApprovals, setPendingApprovals] = useState<ApprovalWorkflow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

  // Fetch pending approvals
  const fetchApprovals = async (isLoadMore = false, searchTerm = '') => {
    try {
      if (!isLoadMore) {
        setIsLoading(true)
        setOffset(0)
      } else {
        setIsLoadingMore(true)
      }

      const currentOffset = isLoadMore ? offset : 0
      const params = new URLSearchParams({
        workspaceId,
        limit: '100',
        offset: currentOffset.toString(),
        ...(searchTerm && { search: searchTerm }),
      })

      const response = await fetch(`/api/approvals?${params}`)

      if (!response.ok) {
        throw new Error('Failed to fetch approvals')
      }

      const data = await response.json()

      if (isLoadMore) {
        setPendingApprovals((prev) => [...prev, ...(data.approvals || [])])
        setOffset((prev) => prev + 100)
      } else {
        setPendingApprovals(data.approvals || [])
        setOffset(100)
      }

      setHasMore(data.hasMore || false)
      setTotalCount(data.totalCount || 0)
      setError(null)
    } catch (err) {
      logger.error('Error fetching approvals:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }

  // Initial fetch
  useEffect(() => {
    fetchApprovals()
  }, [workspaceId])

  // Search with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery !== '') {
        fetchApprovals(false, searchQuery)
      } else {
        fetchApprovals(false, '')
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery])

  const handleRowClick = (approval: ApprovalWorkflow) => {
    // Navigate to the workflow in the AGENTS APPROVAL workspace for review
    router.push(`/workspace/${workspaceId}/w/${approval.workflowId}`)
  }

  const getCategoryBadgeColor = (category: string | null) => {
    switch (category?.toLowerCase()) {
      case 'creative':
        return 'bg-purple-100 text-purple-800'
      case 'ma':
        return 'bg-blue-100 text-blue-800'
      case 'ppc':
        return 'bg-green-100 text-green-800'
      case 'sales':
        return 'bg-orange-100 text-orange-800'
      case 'seo':
        return 'bg-yellow-100 text-yellow-800'
      case 'strategy':
        return 'bg-red-100 text-red-800'
      case 'waas':
        return 'bg-indigo-100 text-indigo-800'
      case 'product':
        return 'bg-pink-100 text-pink-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const handleLoadMore = () => {
    fetchApprovals(true, searchQuery)
  }

  return (
    <div className='flex h-screen flex-col pl-64'>
      {/* Header */}
      <ApprovalsHeader />

      <div className='flex flex-1 overflow-hidden'>
        <div className='flex flex-1 flex-col overflow-hidden'>
          {/* Main Content */}
          <div className='flex-1 overflow-auto'>
            <div className='px-6 pb-6'>
              {/* Search Section */}
              <div className='mb-4 flex items-center justify-between pt-1'>
                <div className='relative w-96'>
                  <Search className='-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground' />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder='Search approvals...'
                    className='pl-10'
                  />
                </div>

                <Badge variant='secondary' className='text-sm'>
                  {pendingApprovals.length} of {totalCount} Pending
                </Badge>
              </div>

              {/* Error State */}
              {error && (
                <div className='mb-4 rounded-md border border-red-200 bg-red-50 p-4'>
                  <p className='text-red-800 text-sm'>Error loading approvals: {error}</p>
                </div>
              )}

              {/* Content Area */}
              {isLoading ? (
                <div className='space-y-4'>
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className='h-16 animate-pulse rounded-md bg-muted' />
                  ))}
                </div>
              ) : pendingApprovals.length === 0 ? (
                <div className='flex h-64 items-center justify-center'>
                  <div className='text-center'>
                    <div className='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted'>
                      <Clock className='h-6 w-6 text-muted-foreground' />
                    </div>
                    <h3 className='font-medium text-lg'>No pending approvals</h3>
                    <p className='text-muted-foreground text-sm'>
                      All workflows have been reviewed and processed.
                    </p>
                  </div>
                </div>
              ) : (
                <div className='rounded-md border bg-background'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Workflow Name</TableHead>
                        <TableHead>Submitted By</TableHead>
                        <TableHead>Assigned To</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead className='w-[100px]'>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingApprovals.map((approval) => (
                        <TableRow
                          key={approval.id}
                          className='cursor-pointer transition-colors hover:bg-muted/50'
                          onClick={() => handleRowClick(approval)}
                        >
                          <TableCell className='font-medium'>{approval.name}</TableCell>
                          <TableCell>
                            <div className='flex flex-col'>
                              <span className='text-sm'>{approval.ownerName || 'Unknown'}</span>
                              <span className='text-muted-foreground text-xs'>
                                {approval.ownerEmail}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className='flex flex-col'>
                              <span className='text-sm'>{approval.approverName || 'Unknown'}</span>
                              <span className='text-muted-foreground text-xs'>
                                {approval.approverEmail}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {approval.category && (
                              <Badge
                                variant='secondary'
                                className={getCategoryBadgeColor(approval.category)}
                              >
                                {approval.category.toUpperCase()}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className='max-w-[300px]'>
                            {approval.description ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div>
                                    <p className='line-clamp-4 text-sm leading-relaxed'>
                                      {approval.description}
                                    </p>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className='max-h-[200px] max-w-[400px] p-4'>
                                  <ScrollArea className='h-full w-full'>
                                    <p className='whitespace-pre-wrap text-sm leading-relaxed'>
                                      {approval.description}
                                    </p>
                                  </ScrollArea>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <p className='text-muted-foreground text-sm'>
                                No description provided
                              </p>
                            )}
                          </TableCell>
                          <TableCell className='text-sm'>
                            {formatDistanceToNow(new Date(approval.createdAt), { addSuffix: true })}
                          </TableCell>
                          <TableCell>
                            <Button
                              size='sm'
                              variant='outline'
                              className='hover:border-[var(--brand-primary-hex)] hover:bg-[var(--brand-primary-hex)] hover:text-white'
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRowClick(approval)
                              }}
                            >
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Load More Button */}
              {hasMore && !isLoading && (
                <div className='mt-6 flex justify-center'>
                  <Button
                    variant='outline'
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className='hover:border-[var(--brand-primary-hex)] hover:bg-[var(--brand-primary-hex)] hover:text-white'
                  >
                    {isLoadingMore
                      ? 'Loading...'
                      : `Load More (${totalCount - pendingApprovals.length} remaining)`}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
