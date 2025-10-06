'use client'

import { ScrollArea } from '@/components/ui/scroll-area'
import { TrendingUp, TrendingDown, DollarSign, Target, Users, BarChart3 } from 'lucide-react'

interface GTMChatData {
  textAnalysis: string
  kpis: Array<{
    label: string
    value: string
    change?: string
    trend?: 'up' | 'down' | 'neutral'
    icon?: string
  }>
  charts: Array<{
    type: 'line' | 'bar' | 'pie'
    title: string
    data: any
  }>
  tables: Array<{
    title: string
    columns: string[]
    rows: string[][]
  }>
  recommendations: string[]
}

interface GTMChatInterfaceProps {
  data: GTMChatData
  isLoading?: boolean
}

export function GTMChatInterface({ data, isLoading }: GTMChatInterfaceProps) {
  const getIcon = (iconName?: string) => {
    switch (iconName) {
      case 'dollar-sign':
        return <DollarSign className="h-5 w-5 text-blue-600" />
      case 'target':
        return <Target className="h-5 w-5 text-green-600" />
      case 'users':
        return <Users className="h-5 w-5 text-purple-600" />
      default:
        return <BarChart3 className="h-5 w-5 text-blue-600" />
    }
  }

  const getTrendIcon = (trend?: 'up' | 'down' | 'neutral') => {
    if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-600" />
    if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-600" />
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full w-full bg-gray-50">
      <div className="p-6 space-y-6 max-w-[1800px] mx-auto">
        {/* Text Analysis */}
        {data.textAnalysis && (
          <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Analysis</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{data.textAnalysis}</p>
          </div>
        )}

        {/* KPI Cards */}
        {data.kpis && data.kpis.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.kpis.map((kpi, index) => (
              <div
                key={index}
                className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-blue-50 rounded-lg">{getIcon(kpi.icon)}</div>
                  <span className="text-xs text-gray-500 font-medium">{kpi.label}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-gray-900">{kpi.value}</p>
                  {kpi.change && (
                    <div className="flex items-center gap-1">
                      {getTrendIcon(kpi.trend)}
                      <span
                        className={`text-sm font-medium ${
                          kpi.trend === 'up'
                            ? 'text-green-600'
                            : kpi.trend === 'down'
                            ? 'text-red-600'
                            : 'text-gray-600'
                        }`}
                      >
                        {kpi.change}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Charts - Simple Bar Chart Visualization */}
        {data.charts && data.charts.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data.charts.map((chart, index) => (
              <div
                key={index}
                className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{chart.title}</h3>
                <div className="h-64 flex items-end justify-around gap-2 border-b border-l border-gray-200 p-4">
                  {chart.data?.labels?.map((label: string, idx: number) => {
                    const value = chart.data?.datasets?.[0]?.data?.[idx] || 0
                    const maxValue = Math.max(...(chart.data?.datasets?.[0]?.data || [1]))
                    const heightPercent = (value / maxValue) * 100
                    
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                        <div className="w-full flex items-end justify-center" style={{ height: '200px' }}>
                          <div
                            className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors"
                            style={{ height: `${heightPercent}%` }}
                            title={`${label}: ${value}`}
                          />
                        </div>
                        <span className="text-xs text-gray-600 text-center">{label}</span>
                        <span className="text-sm font-semibold text-gray-900">{value}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tables */}
        {data.tables && data.tables.length > 0 && (
          <div className="space-y-6">
            {data.tables.map((table, index) => (
              <div
                key={index}
                className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden"
              >
                <div className="p-4 border-b border-blue-100">
                  <h3 className="text-lg font-semibold text-gray-900">{table.title}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        {table.columns.map((column, colIndex) => (
                          <th
                            key={colIndex}
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {table.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-gray-50">
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recommendations */}
        {data.recommendations && data.recommendations.length > 0 && (
          <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recommendations</h3>
            <ul className="space-y-2">
              {data.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">•</span>
                  <span className="text-gray-700">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
