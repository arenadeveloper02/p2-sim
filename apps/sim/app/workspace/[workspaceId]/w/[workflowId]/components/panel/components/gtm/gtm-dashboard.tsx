'use client'

import { useState, useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BarChart3, ChevronLeft, ChevronRight, Maximize2, Minimize2, Play, Pause, MessageCircle, Send } from 'lucide-react'
import { useWorkflowExecution } from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/use-workflow-execution'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'
import { ExecutiveSummary } from './executive-summary'
import { AwarenessDashboard } from './awareness-dashboard'
import { ConsiderationDashboard } from './consideration-dashboard'
import { ConversionDashboard } from './conversion-dashboard'
import { RevenueARRDashboard } from './revenue-arr-dashboard'
import { PipelineDealsDashboard } from './pipeline-deals-dashboard'
import { GTMEfficiencyDashboard } from './gtm-efficiency-dashboard'
import { GTMChatInterface } from './gtm-chat-interface'

type DashboardTab = 'executive' | 'awareness' | 'consideration' | 'conversion' | 'revenue' | 'pipeline' | 'efficiency'

export function GTMDashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('executive')
  const [isExpanded, setIsExpanded] = useState(false)
  const [isAutoPlay, setIsAutoPlay] = useState(false)
  const [chatQuery, setChatQuery] = useState('')
  const [chatResponse, setChatResponse] = useState<any>(null)
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  
  // Get workflow execution functionality (same as normal chat)
  const { handleRunWorkflow } = useWorkflowExecution()
  const { activeWorkflowId } = useWorkflowRegistry()

  const tabs = [
    { id: 'executive' as DashboardTab, label: 'Executive Summary' },
    { id: 'awareness' as DashboardTab, label: 'Awareness' },
    { id: 'consideration' as DashboardTab, label: 'Consideration' },
    { id: 'conversion' as DashboardTab, label: 'Conversion' },
    { id: 'revenue' as DashboardTab, label: 'Revenue & ARR' },
    { id: 'pipeline' as DashboardTab, label: 'Pipeline & Deals' },
    { id: 'efficiency' as DashboardTab, label: 'GTM Efficiency' },
  ]

  const currentIndex = tabs.findIndex(t => t.id === activeTab)
  
  // Auto-slide functionality
  useEffect(() => {
    if (!isAutoPlay) return
    
    const interval = setInterval(() => {
      setActiveTab(tabs[(currentIndex + 1) % tabs.length].id)
    }, 15000) // 15 seconds
    
    return () => clearInterval(interval)
  }, [isAutoPlay, currentIndex, tabs])
  
  const goToPrevious = () => {
    setIsAutoPlay(false) // Stop auto-play when user manually navigates
    if (currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1].id)
    }
  }

  const goToNext = () => {
    setIsAutoPlay(false) // Stop auto-play when user manually navigates
    if (currentIndex < tabs.length - 1) {
      setActiveTab(tabs[currentIndex + 1].id)
    }
  }

  const handleChatSubmit = async () => {
    if (!chatQuery.trim() || !activeWorkflowId) return

    setIsLoadingChat(true)
    setChatResponse(null)

    try {
      // Execute the workflow (same as normal chat)
      // The workflow will use Google Ads block + Agent1 block
      // Agent1 will detect GTM Chat mode and process accordingly
      const result = await handleRunWorkflow({
        input: chatQuery,
        conversationId: `gtm-chat-${Date.now()}`,
      })

      // The result will come through console/execution store
      // Panel routing will handle switching to GTM tab
      // For now, just show a success message
      console.log('Workflow executed:', result)
      
      // Clear the input
      setChatQuery('')
    } catch (error) {
      console.error('Chat error:', error)
      // Show error to user
      setChatResponse({
        textAnalysis: 'Sorry, there was an error processing your request. Please try again.',
        kpis: [],
        charts: [],
        tables: [],
        recommendations: [],
      })
    } finally {
      setIsLoadingChat(false)
    }
  }

  return (
    <ScrollArea className="h-full w-full bg-gray-50">
      <div className={`p-6 space-y-6 mx-auto ${isExpanded ? 'max-w-none' : 'max-w-[1800px]'}`}>
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-blue-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">GTM Dashboard</h1>
              <p className="text-sm text-gray-600">Executive Marketing Performance Overview</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAutoPlay(!isAutoPlay)}
              className="p-2 rounded-lg border border-blue-200 bg-white hover:bg-blue-50 transition-colors"
              title={isAutoPlay ? "Pause Auto-Slide (15s)" : "Start Auto-Slide (15s)"}
            >
              {isAutoPlay ? (
                <Pause className="h-5 w-5 text-blue-600" />
              ) : (
                <Play className="h-5 w-5 text-blue-600" />
              )}
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 rounded-lg border border-blue-200 bg-white hover:bg-blue-50 transition-colors"
              title={isExpanded ? "Collapse Dashboard" : "Expand Dashboard"}
            >
              {isExpanded ? (
                <Minimize2 className="h-5 w-5 text-blue-600" />
              ) : (
                <Maximize2 className="h-5 w-5 text-blue-600" />
              )}
            </button>
          </div>
        </div>

        {/* Sub-Navigation */}
        <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
          <div className="flex items-center gap-2">
            {/* Left Arrow - Always Visible */}
            <div className="w-8 flex-shrink-0">
              <button
                onClick={goToPrevious}
                disabled={currentIndex === 0}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-blue-200 bg-white hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-blue-600" />
              </button>
            </div>

            {/* Tabs - Scrollable */}
            <div className="flex-1 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-1 min-w-max">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-2 py-1.5 rounded-md font-medium text-xs transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white border border-blue-200 text-blue-700 hover:bg-blue-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Right Arrow - Always Visible */}
            <div className="w-8 flex-shrink-0">
              <button
                onClick={goToNext}
                disabled={currentIndex === tabs.length - 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-blue-200 bg-white hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-blue-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div>
          {activeTab === 'executive' && <ExecutiveSummary />}
          {activeTab === 'awareness' && <AwarenessDashboard />}
          {activeTab === 'consideration' && <ConsiderationDashboard />}
          {activeTab === 'conversion' && <ConversionDashboard />}
          {activeTab === 'revenue' && <RevenueARRDashboard />}
          {activeTab === 'pipeline' && <PipelineDealsDashboard />}
          {activeTab === 'efficiency' && <GTMEfficiencyDashboard />}
        </div>

        {/* Divider */}
        <div className="border-t border-blue-200 my-8"></div>

        {/* GTM Chat Interface Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <MessageCircle className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Ask Questions About Your Data</h2>
              <p className="text-sm text-gray-600">Get AI-powered insights with dynamic dashboards, charts, and KPIs</p>
            </div>
          </div>

          {/* Chat Input */}
          <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatQuery}
                onChange={(e) => setChatQuery(e.target.value)}
                placeholder="Ask anything about your Google Ads performance..."
                className="flex-1 px-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleChatSubmit()
                  }
                }}
              />
              <button
                onClick={handleChatSubmit}
                disabled={!chatQuery.trim() || isLoadingChat}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <Send className="h-4 w-4" />
                Ask
              </button>
            </div>
          </div>

          {/* Chat Response */}
          {chatResponse && (
            <GTMChatInterface data={chatResponse} isLoading={isLoadingChat} />
          )}

          {/* Placeholder when no response */}
          {!chatResponse && !isLoadingChat && (
            <div className="bg-white p-8 rounded-xl border border-blue-100 shadow-sm text-center">
              <MessageCircle className="h-12 w-12 text-blue-300 mx-auto mb-3" />
              <p className="text-gray-600">Ask a question to get started with AI-powered insights</p>
              <p className="text-sm text-gray-500 mt-2">Example: "Show me campaign performance for last 30 days"</p>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  )
}
