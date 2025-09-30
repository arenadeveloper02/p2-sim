import { useMemo } from 'react'
import CopilotMarkdownRenderer from '../../../copilot/components/copilot-message/components/markdown-renderer'
import { GoogleAdsDashboard } from '@/components/ui/tool-call'
import { isBase64, renderBs64Img } from './constants'

interface ChatMessageProps {
  message: {
    id: string
    content: any
    timestamp: string | Date
    type: 'user' | 'workflow'
    isStreaming?: boolean
  }
}

// Maximum character length for a word before it's broken up
const MAX_WORD_LENGTH = 25

const WordWrap = ({ text }: { text: string }) => {
  if (!text) return null

  // Split text into words, keeping spaces and punctuation
  const parts = text.split(/(\s+)/g)

  return (
    <>
      {parts.map((part, index) => {
        // If the part is whitespace or shorter than the max length, render it as is
        if (part.match(/\s+/) || part.length <= MAX_WORD_LENGTH) {
          return <span key={index}>{part}</span>
        }

        // For long words, break them up into chunks
        const chunks = []
        for (let i = 0; i < part.length; i += MAX_WORD_LENGTH) {
          chunks.push(part.substring(i, i + MAX_WORD_LENGTH))
        }

        return (
          <span key={index} className='break-all'>
            {chunks.map((chunk, chunkIndex) => (
              <span key={chunkIndex}>{chunk}</span>
            ))}
          </span>
        )
      })}
    </>
  )
}

export function ChatMessage({ message }: ChatMessageProps) {
  // Format message content as text
  const formattedContent = useMemo(() => {
    if (typeof message.content === 'object' && message.content !== null) {
      return JSON.stringify(message.content, null, 2)
    }
    return String(message.content || '')
  }, [message.content])

  // Render human messages as chat bubbles
  if (message.type === 'user') {
    return (
      <div className='w-full py-2'>
        <div className='flex justify-end'>
          <div className='max-w-[80%]'>
            <div className='rounded-[10px] bg-secondary px-3 py-2'>
              <div className='whitespace-pre-wrap break-words font-normal text-foreground text-sm leading-normal'>
                <WordWrap text={formattedContent} />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderContent = (content: any) => {
    if (!content) {
      return null
    }
    

    if (message.type === 'workflow' && typeof content === 'string') {
      // Look for JSON wrapped in markdown blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/)
      if (jsonMatch) {
        try {
          const parsedData = JSON.parse(jsonMatch[1])
          console.log('🎯 PARSED GOOGLE ADS DATA:', parsedData)
          
          // NEW: Check if this is deep dive analysis data
          if (parsedData && parsedData.analysisType === 'deep_dive_complete' && parsedData.monthlyData) {
            console.log('✅ RENDERING DEEP DIVE ANALYSIS!')
            // For now, show as formatted JSON - full dashboard can be added later
            return (
              <div className="p-4 bg-blue-50 dark:bg-blue-900 rounded">
                <h3 className="font-bold text-lg mb-2">📊 Deep Dive Analysis Complete</h3>
                <div className="space-y-2">
                  <p><strong>Months Analyzed:</strong> {parsedData.summary?.totalMonths}</p>
                  <p><strong>Total Spends:</strong> ${parsedData.summary?.totalSpends?.toFixed(2)}</p>
                  <p><strong>Total Leads:</strong> {parsedData.summary?.totalLeads?.toFixed(0)}</p>
                  <p><strong>Average CPL:</strong> ${parsedData.summary?.avgCPL?.toFixed(2)}</p>
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer font-semibold">View Monthly Breakdown</summary>
                  <pre className="mt-2 text-xs overflow-auto">{JSON.stringify(parsedData.monthlyData, null, 2)}</pre>
                </details>
              </div>
            )
          }
          
          // Check if this is regular Google Ads data
          const isGoogleAdsData = (
            (parsedData && typeof parsedData === 'object' && parsedData.results && Array.isArray(parsedData.results) && parsedData.grand_totals) ||
            (parsedData && typeof parsedData === 'object' && parsedData.output && parsedData.output.results && Array.isArray(parsedData.output.results)) ||
            (Array.isArray(parsedData) && parsedData[0] && parsedData[0].campaigns && parsedData[0].account_totals)
          )
          
          console.log('🔍 Is parsed Google Ads data?', isGoogleAdsData)
          
          if (isGoogleAdsData) {
            console.log('✅ RENDERING GOOGLE ADS DASHBOARD FROM PARSED JSON!')
            return <GoogleAdsDashboard data={parsedData} />
          }
        } catch (error) {
          console.log('❌ Failed to parse JSON:', error)
        }
      }
    }
    
    // Check if this is Google Ads data as object (fallback)
    if (content && typeof content === 'object') {
      // Check for deep dive summary
      if (content.type === 'deep_dive_summary' && content.summary) {
        console.log('✅ RENDERING DEEP DIVE SUMMARY!')
        return <CopilotMarkdownRenderer content={content.summary} />
      }
      
      // Check for deep dive analysis data
      if (content.analysisType === 'deep_dive_complete' && content.monthlyData) {
        console.log('✅ RENDERING DEEP DIVE ANALYSIS FROM OBJECT!')
        return (
          <div className="p-4 bg-blue-50 dark:bg-blue-900 rounded">
            <h3 className="font-bold text-lg mb-2">📊 Deep Dive Analysis Complete</h3>
            <div className="space-y-2">
              <p><strong>Months Analyzed:</strong> {content.summary?.totalMonths}</p>
              <p><strong>Total Spends:</strong> ${content.summary?.totalSpends?.toFixed(2)}</p>
              <p><strong>Total Leads:</strong> {content.summary?.totalLeads?.toFixed(0)}</p>
              <p><strong>Average CPL:</strong> ${content.summary?.avgCPL?.toFixed(2)}</p>
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer font-semibold">View Monthly Breakdown</summary>
              <pre className="mt-2 text-xs overflow-auto max-h-96">{JSON.stringify(content.monthlyData, null, 2)}</pre>
            </details>
          </div>
        )
      }
      
      const isGoogleAdsData = (
        (content.output && content.output.results && Array.isArray(content.output.results) && content.output.grand_totals) ||
        (content.results && Array.isArray(content.results) && content.grand_totals) ||
        (Array.isArray(content) && content[0] && content[0].campaigns && content[0].account_totals)
      )
      
      if (isGoogleAdsData) {
        console.log('✅ RENDERING GOOGLE ADS DASHBOARD FROM OBJECT!')
        return <GoogleAdsDashboard data={content} />
      }
    }
    
    if (isBase64(content)) {
      return renderBs64Img({ isBase64: true, imageData: message.content })
    }
    if (formattedContent) {
      return <CopilotMarkdownRenderer content={formattedContent} />
    }
  }

  // Render agent/workflow messages as full-width text
  return (
    <div className='w-full py-2 pl-[2px]'>
      <div className='overflow-wrap-anywhere relative whitespace-normal break-normal font-normal text-sm leading-normal'>
        <div className='whitespace-pre-wrap break-words bg-secondary p-3 text-foreground'>
          {/* <WordWrap text={formattedContent} /> */}
          {renderContent(message?.content)}
          {message.isStreaming && (
            <span className='ml-1 inline-block h-4 w-2 animate-pulse bg-primary' />
          )}
        </div>
      </div>
    </div>
  )
}
