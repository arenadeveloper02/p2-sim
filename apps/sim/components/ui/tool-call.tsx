'use client'

import { useState } from 'react'
import { CheckCircle, ChevronDown, ChevronRight, Loader2, Settings, XCircle, BarChart3, TrendingUp, DollarSign } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import type { ToolCallGroup, ToolCallState } from '@/lib/copilot/types'
import { cn } from '@/lib/utils'

interface ToolCallProps {
  toolCall: ToolCallState
  isCompact?: boolean
}

interface ToolCallGroupProps {
  group: ToolCallGroup
  isCompact?: boolean
}

interface ToolCallIndicatorProps {
  type: 'status' | 'thinking' | 'execution'
  content: string
  toolNames?: string[]
}

// Detection State Component
export function ToolCallDetection({ content }: { content: string }) {
  return (
    <div className='flex min-w-0 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-blue-800 dark:bg-blue-950'>
      <Loader2 className='h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400' />
      <span className='min-w-0 truncate text-blue-800 dark:text-blue-200'>{content}</span>
    </div>
  )
}

// Execution State Component
export function ToolCallExecution({ toolCall, isCompact = false }: ToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(!isCompact)

  return (
    <div className='min-w-0 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant='ghost'
            className='w-full min-w-0 justify-between px-3 py-4 hover:bg-amber-100 dark:hover:bg-amber-900'
          >
            <div className='flex min-w-0 items-center gap-2 overflow-hidden'>
              <Settings className='h-4 w-4 shrink-0 animate-pulse text-amber-600 dark:text-amber-400' />
              <span className='min-w-0 truncate font-mono text-amber-800 text-xs dark:text-amber-200'>
                {toolCall.displayName || toolCall.name}
              </span>
              {toolCall.progress && (
                <Badge
                  variant='outline'
                  className='shrink-0 text-amber-700 text-xs dark:text-amber-300'
                >
                  {toolCall.progress}
                </Badge>
              )}
            </div>
            {isExpanded ? (
              <ChevronDown className='h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400' />
            ) : (
              <ChevronRight className='h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400' />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className='min-w-0 max-w-full px-3 pb-3'>
          <div className='min-w-0 max-w-full space-y-2'>
            <div className='flex items-center gap-2 text-amber-700 text-xs dark:text-amber-300'>
              <Loader2 className='h-3 w-3 shrink-0 animate-spin' />
              <span>Executing...</span>
            </div>
            {toolCall.parameters &&
              Object.keys(toolCall.parameters).length > 0 &&
              (toolCall.name === 'make_api_request' ||
                toolCall.name === 'set_environment_variables' ||
                toolCall.name === 'set_global_workflow_variables') && (
                <div className='min-w-0 max-w-full rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950'>
                  {toolCall.name === 'make_api_request' ? (
                    <div className='w-full overflow-hidden rounded border border-muted bg-card'>
                      <div className='grid grid-cols-2 gap-0 border-muted/60 border-b bg-muted/40 px-2 py-1.5'>
                        <div className='font-medium text-[10px] text-muted-foreground uppercase tracking-wide'>
                          Method
                        </div>
                        <div className='font-medium text-[10px] text-muted-foreground uppercase tracking-wide'>
                          Endpoint
                        </div>
                      </div>
                      <div className='grid grid-cols-[auto_1fr] items-center gap-2 px-2 py-2'>
                        <div>
                          <span className='inline-flex rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs'>
                            {String((toolCall.parameters as any).method || '').toUpperCase() ||
                              'GET'}
                          </span>
                        </div>
                        <div className='min-w-0'>
                          <span
                            className='block overflow-x-auto whitespace-nowrap font-mono text-foreground text-xs'
                            title={String((toolCall.parameters as any).url || '')}
                          >
                            {String((toolCall.parameters as any).url || '') || 'URL not provided'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {toolCall.name === 'set_environment_variables'
                    ? (() => {
                        const variables =
                          (toolCall.parameters as any).variables &&
                          typeof (toolCall.parameters as any).variables === 'object'
                            ? (toolCall.parameters as any).variables
                            : {}
                        const entries = Object.entries(variables)
                        return (
                          <div className='w-full overflow-hidden rounded border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'>
                            <div className='grid grid-cols-2 gap-0 border-amber-200/60 border-b px-2 py-1.5 dark:border-amber-800/60'>
                              <div className='font-medium text-[10px] text-amber-700 uppercase tracking-wide dark:text-amber-300'>
                                Name
                              </div>
                              <div className='font-medium text-[10px] text-amber-700 uppercase tracking-wide dark:text-amber-300'>
                                Value
                              </div>
                            </div>
                            {entries.length === 0 ? (
                              <div className='px-2 py-2 text-muted-foreground text-xs'>
                                No variables provided
                              </div>
                            ) : (
                              <div className='divide-y divide-amber-200 dark:divide-amber-800'>
                                {entries.map(([k, v]) => (
                                  <div
                                    key={k}
                                    className='grid grid-cols-[auto_1fr] items-center gap-2 px-2 py-1.5'
                                  >
                                    <div className='truncate font-medium text-amber-800 text-xs dark:text-amber-200'>
                                      {k}
                                    </div>
                                    <div className='min-w-0'>
                                      <span className='block overflow-x-auto whitespace-nowrap font-mono text-amber-700 text-xs dark:text-amber-300'>
                                        {String(v)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })()
                    : null}

                  {toolCall.name === 'set_global_workflow_variables'
                    ? (() => {
                        const ops = Array.isArray((toolCall.parameters as any).operations)
                          ? ((toolCall.parameters as any).operations as any[])
                          : []
                        return (
                          <div className='w-full overflow-hidden rounded border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'>
                            <div className='grid grid-cols-3 gap-0 border-amber-200/60 border-b px-2 py-1.5 dark:border-amber-800/60'>
                              <div className='font-medium text-[10px] text-amber-700 uppercase tracking-wide dark:text-amber-300'>
                                Name
                              </div>
                              <div className='font-medium text-[10px] text-amber-700 uppercase tracking-wide dark:text-amber-300'>
                                Type
                              </div>
                              <div className='font-medium text-[10px] text-amber-700 uppercase tracking-wide dark:text-amber-300'>
                                Value
                              </div>
                            </div>
                            {ops.length === 0 ? (
                              <div className='px-2 py-2 text-muted-foreground text-xs'>
                                No operations provided
                              </div>
                            ) : (
                              <div className='divide-y divide-amber-200 dark:divide-amber-800'>
                                {ops.map((op, idx) => (
                                  <div
                                    key={idx}
                                    className='grid grid-cols-3 items-center gap-0 px-2 py-1.5'
                                  >
                                    <div className='min-w-0'>
                                      <span className='truncate text-amber-800 text-xs dark:text-amber-200'>
                                        {String(op.name || '')}
                                      </span>
                                    </div>
                                    <div>
                                      <span className='rounded border px-1 py-0.5 text-[10px] text-muted-foreground'>
                                        {String(op.type || '')}
                                      </span>
                                    </div>
                                    <div className='min-w-0'>
                                      {op.value !== undefined ? (
                                        <span className='block overflow-x-auto whitespace-nowrap font-mono text-amber-700 text-xs dark:text-amber-300'>
                                          {String(op.value)}
                                        </span>
                                      ) : (
                                        <span className='text-muted-foreground text-xs'>—</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })()
                    : null}
                </div>
              )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

// Completion State Component
export function ToolCallCompletion({ toolCall, isCompact = false }: ToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isSuccess = toolCall.state === 'completed'
  const isError = toolCall.state === 'error'
  const isAborted = toolCall.state === 'aborted'

  const formatDuration = (duration?: number) => {
    if (!duration) return ''
    return duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`
  }

  return (
    <div
      className={cn(
        'min-w-0 rounded-lg border',
        isSuccess && 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950',
        isError && 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950',
        isAborted && 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950'
      )}
    >
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant='ghost'
            className={cn(
              'w-full min-w-0 justify-between px-3 py-4',
              isSuccess && 'hover:bg-green-100 dark:hover:bg-green-900',
              isError && 'hover:bg-red-100 dark:hover:bg-red-900',
              isAborted && 'hover:bg-orange-100 dark:hover:bg-orange-900'
            )}
          >
            <div className='flex min-w-0 items-center gap-2 overflow-hidden'>
              {isSuccess && (
                <CheckCircle className='h-4 w-4 shrink-0 text-green-600 dark:text-green-400' />
              )}
              {isError && <XCircle className='h-4 w-4 shrink-0 text-red-600 dark:text-red-400' />}
              {isAborted && (
                <XCircle className='h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400' />
              )}
              <span
                className={cn(
                  'min-w-0 truncate font-mono text-xs',
                  isSuccess && 'text-green-800 dark:text-green-200',
                  isError && 'text-red-800 dark:text-red-200',
                  isAborted && 'text-orange-800 dark:text-orange-200'
                )}
              >
                {toolCall.displayName || toolCall.name}
              </span>
              {toolCall.duration && (
                <Badge
                  variant='outline'
                  className={cn(
                    'shrink-0 text-xs',
                    isSuccess && 'text-green-700 dark:text-green-300',
                    isError && 'text-red-700 dark:text-red-300',
                    isAborted && 'text-orange-700 dark:text-orange-300'
                  )}
                  style={{ fontSize: '0.625rem' }}
                >
                  {formatDuration(toolCall.duration)}
                </Badge>
              )}
            </div>
            <div className='flex shrink-0 items-center'>
              {isExpanded ? (
                <ChevronDown
                  className={cn(
                    'h-4 w-4',
                    isSuccess && 'text-green-600 dark:text-green-400',
                    isError && 'text-red-600 dark:text-red-400'
                  )}
                />
              ) : (
                <ChevronRight
                  className={cn(
                    'h-4 w-4',
                    isSuccess && 'text-green-600 dark:text-green-400',
                    isError && 'text-red-600 dark:text-red-400'
                  )}
                />
              )}
            </div>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className='min-w-0 max-w-full px-3 pb-3'>
          <div className='min-w-0 max-w-full space-y-2'>
            {toolCall.parameters &&
              Object.keys(toolCall.parameters).length > 0 &&
              (toolCall.name === 'make_api_request' ||
                toolCall.name === 'set_environment_variables') && (
                <div
                  className={cn(
                    'min-w-0 max-w-full rounded p-2',
                    isSuccess && 'bg-green-100 dark:bg-green-900',
                    isError && 'bg-red-100 dark:bg-red-900'
                  )}
                >
                  <div
                    className={cn(
                      'mb-1 font-medium text-xs',
                      isSuccess && 'text-green-800 dark:text-green-200',
                      isError && 'text-red-800 dark:text-red-200'
                    )}
                  >
                    Parameters:
                  </div>
                  <div
                    className={cn(
                      'min-w-0 max-w-full break-all font-mono text-xs',
                      isSuccess && 'text-green-700 dark:text-green-300',
                      isError && 'text-red-700 dark:text-red-300'
                    )}
                  >
                    {JSON.stringify(toolCall.parameters, null, 2)}
                  </div>
                </div>
              )}

            {/* Google Ads Dashboard - NEW: Show enhanced visualization for Google Ads data */}
            {toolCall.result && (
              // Check for all possible data structures
              (toolCall.result.output && toolCall.result.output.results && Array.isArray(toolCall.result.output.results) && toolCall.result.output.grand_totals) ||
              (toolCall.result.results && Array.isArray(toolCall.result.results) && toolCall.result.grand_totals) ||
              (Array.isArray(toolCall.result) && toolCall.result[0] && toolCall.result[0].campaigns && toolCall.result[0].account_totals)
            ) && (
              <GoogleAdsDashboard data={toolCall.result} />
            )}

            {/* Default result display for non-Google Ads data */}
            {toolCall.result && 
             !((toolCall.result.output && toolCall.result.output.results && Array.isArray(toolCall.result.output.results) && toolCall.result.output.grand_totals) ||
               (toolCall.result.results && Array.isArray(toolCall.result.results) && toolCall.result.grand_totals) ||
               (Array.isArray(toolCall.result) && toolCall.result[0] && toolCall.result[0].campaigns && toolCall.result[0].account_totals)) && (
              <div className='min-w-0 max-w-full rounded bg-green-100 p-2 dark:bg-green-900'>
                <div className='mb-1 font-medium text-green-800 text-xs dark:text-green-200'>
                  Result:
                </div>
                <div className='min-w-0 max-w-full break-all font-mono text-green-700 text-xs dark:text-green-300'>
                  {typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}
                </div>
              </div>
            )}

            {toolCall.error && (
              <div className='min-w-0 max-w-full rounded bg-red-100 p-2 dark:bg-red-900'>
                <div className='mb-1 font-medium text-red-800 text-xs dark:text-red-200'>
                  Error:
                </div>
                <div className='min-w-0 max-w-full break-all font-mono text-red-700 text-xs dark:text-red-300'>
                  {toolCall.error}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

// Group Component for Multiple Tool Calls
export function ToolCallGroupComponent({ group, isCompact = false }: ToolCallGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const completedCount = group.toolCalls.filter((t) => t.state === 'completed').length
  const totalCount = group.toolCalls.length
  const isAllCompleted = completedCount === totalCount
  const hasErrors = group.toolCalls.some((t) => t.state === 'error')

  return (
    <div className='min-w-0 space-y-2'>
      {group.summary && (
        <div className='flex min-w-0 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-blue-800 dark:bg-blue-950'>
          <Settings className='h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400' />
          <span className='min-w-0 truncate text-blue-800 dark:text-blue-200'>{group.summary}</span>
          {!isAllCompleted && (
            <Badge variant='outline' className='shrink-0 text-blue-700 text-xs dark:text-blue-300'>
              {completedCount}/{totalCount}
            </Badge>
          )}
        </div>
      )}

      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant='ghost'
            className='w-full min-w-0 justify-between px-3 py-3 text-sm hover:bg-muted'
          >
            <div className='flex min-w-0 items-center gap-2 overflow-hidden'>
              <span className='min-w-0 truncate text-muted-foreground'>
                {isAllCompleted ? 'Completed' : 'In Progress'} ({completedCount}/{totalCount})
              </span>
              {hasErrors && (
                <Badge variant='destructive' className='shrink-0 text-xs'>
                  Errors
                </Badge>
              )}
            </div>
            {isExpanded ? (
              <ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground' />
            ) : (
              <ChevronRight className='h-4 w-4 shrink-0 text-muted-foreground' />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className='min-w-0 max-w-full space-y-2'>
          {group.toolCalls.map((toolCall) => (
            <div key={toolCall.id} className='min-w-0 max-w-full'>
              {toolCall.state === 'executing' && (
                <ToolCallExecution toolCall={toolCall} isCompact={isCompact} />
              )}
              {(toolCall.state === 'completed' || toolCall.state === 'error') && (
                <ToolCallCompletion toolCall={toolCall} isCompact={isCompact} />
              )}
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

// Status Indicator Component
export function ToolCallIndicator({ type, content, toolNames }: ToolCallIndicatorProps) {
  if (type === 'status' && toolNames) {
    return (
      <div className='flex min-w-0 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-blue-800 dark:bg-blue-950'>
        <Loader2 className='h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400' />
        <span className='min-w-0 truncate text-blue-800 dark:text-blue-200'>
          🔄 {toolNames.join(' • ')}
        </span>
      </div>
    )
  }

  return (
    <div className='flex min-w-0 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-blue-800 dark:bg-blue-950'>
      <Loader2 className='h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400' />
      <span className='min-w-0 truncate text-blue-800 dark:text-blue-200'>{content}</span>
    </div>
  )
}

// Google Ads Dashboard Component (NEW - Won't affect existing functionality)
export function GoogleAdsDashboard({ data }: { data: any }) {
  const [activeTab, setActiveTab] = useState('overview')
  
  console.log('📊 GoogleAdsDashboard received data:', data)
  
  // Handle all data structures
  let account, campaigns, totals
  
  if (data.output && data.output.results && Array.isArray(data.output.results)) {
    // Structure: {success: true, output: {results: [...], grand_totals: {...}}}
    account = data.output.results[0]
    campaigns = account?.campaigns || []
    totals = data.output.grand_totals || {}
  } else if (Array.isArray(data) && data[0] && data[0].campaigns) {
    // Structure: Array with account data
    account = data[0]
    campaigns = account.campaigns || []
    totals = account.account_totals || {}
  } else if (data.results && Array.isArray(data.results)) {
    // Structure: Object with results array
    account = data.results[0]
    campaigns = account?.campaigns || []
    totals = data.grand_totals || {}
  } else {
    return null // Return null if not Google Ads data
  }

  // Prepare chart data
  const chartData = campaigns.slice(0, 5).map((campaign: any) => ({
    name: campaign.name.replace('P2_AMI_', ''),
    cost: campaign.cost,
    conversions: campaign.conversions,
    clicks: campaign.clicks,
    roas: campaign.roas
  }))

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

  return (
    <div className="w-full space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-blue-600" />
        <h2 className="text-xl font-semibold">Google Ads Performance Dashboard</h2>
        <Badge variant="secondary">{account?.account_name}</Badge>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totals.cost?.toFixed(2) || '0'}</div>
            <p className="text-xs text-muted-foreground">
              March 2025
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.conversions?.toFixed(0) || '0'}</div>
            <p className="text-xs text-muted-foreground">
              {totals.conversion_rate?.toFixed(1) || '0'}% conversion rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clicks</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.clicks?.toLocaleString() || '0'}</div>
            <p className="text-xs text-muted-foreground">
              {totals.ctr?.toFixed(2) || '0'}% CTR
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg CPC</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totals.avg_cpc?.toFixed(2) || '0'}</div>
            <p className="text-xs text-muted-foreground">
              Cost per click
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Campaign Performance Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value, name) => [
                  name === 'cost' ? `$${value}` : value,
                  name === 'cost' ? 'Spend' : name === 'conversions' ? 'Conversions' : 'Clicks'
                ]} />
                <Bar dataKey="cost" fill="#0088FE" name="cost" />
                <Bar dataKey="conversions" fill="#00C49F" name="conversions" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Campaign Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Spend Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="cost"
                >
                  {chartData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`$${value}`, 'Spend']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Table */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Clicks</TableHead>
                <TableHead>Impressions</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Conversions</TableHead>
                <TableHead>ROAS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign: any, index: number) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{campaign.name}</TableCell>
                  <TableCell>{campaign.clicks?.toLocaleString()}</TableCell>
                  <TableCell>{campaign.impressions?.toLocaleString()}</TableCell>
                  <TableCell>${campaign.cost?.toFixed(2)}</TableCell>
                  <TableCell>{campaign.conversions?.toFixed(1)}</TableCell>
                  <TableCell>{campaign.roas?.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
