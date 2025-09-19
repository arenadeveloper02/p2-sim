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

  const [allApprovals, setAllApprovals] = useState<ApprovalWorkflow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [offset, setOffset] = useState(100)

  const fetchApprovals = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/approvals?workspaceId=${workspaceId}&limit=1000`)

      if (!response.ok) {
        throw new Error('Failed to fetch approvals')
      }

      const data = await response.json()
      setAllApprovals(data.approvals || [])
      setError(null)
    } catch (err) {
      logger.error('Error fetching approvals:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchApprovals()
  }, [workspaceId])

  // Client-side filtering
  const filteredApprovals = allApprovals.filter((approval) => {
    if (!searchQuery) return true

    const searchLower = searchQuery.toLowerCase()
    return (
      approval.name.toLowerCase().includes(searchLower) ||
      approval.ownerName?.toLowerCase().includes(searchLower) ||
      approval.ownerEmail.toLowerCase().includes(searchLower) ||
      approval.approverName?.toLowerCase().includes(searchLower) ||
      approval.approverEmail.toLowerCase().includes(searchLower) ||
      approval.category?.toLowerCase().includes(searchLower) ||
      approval.description?.toLowerCase().includes(searchLower)
    )
  })

  // Client-side pagination
  const paginatedApprovals = filteredApprovals.slice(0, offset)
  const hasMoreItems = filteredApprovals.length > offset

  const handleLoadMore = () => {
    setOffset((prev) => prev + 100)
  }

  const handleRowClick = (approval: ApprovalWorkflow) => {
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

  return (
    <div className='flex h-screen flex-col pl-64'>
      <ApprovalsHeader />

      <div className='flex flex-1 overflow-hidden'>
        <div className='flex flex-1 flex-col overflow-hidden'>
          <div className='flex-1 overflow-auto'>
            <div className='px-6 pb-6'>
              <div className='mb-4 flex items-center justify-between pt-1'>
                <div className='relative w-96'>
                  <Search className='-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground' />
                  <Input
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setOffset(100) // Reset pagination on search
                    }}
                    placeholder='Search approvals...'
                    className='pl-10'
                  />
                </div>
              </div>

              {error && (
                <div className='mb-4 rounded-md border border-red-200 bg-red-50 p-4'>
                  <p className='text-red-800 text-sm'>Error loading approvals: {error}</p>
                </div>
              )}

              {isLoading ? (
                <div className='space-y-4'>
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className='h-16 animate-pulse rounded-md bg-muted' />
                  ))}
                </div>
              ) : filteredApprovals.length === 0 ? (
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
                      {paginatedApprovals.map((approval) => (
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

              {hasMoreItems && !isLoading && (
                <div className='mt-6 flex justify-center'>
                  <Button
                    variant='outline'
                    onClick={handleLoadMore}
                    className='hover:border-[var(--brand-primary-hex)] hover:bg-[var(--brand-primary-hex)] hover:text-white'
                  >
                    Load More ({filteredApprovals.length - paginatedApprovals.length} remaining)
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
