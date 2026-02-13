/**
 * Our Copilot Block Configuration
 * Smart AI-powered copilot with tool integration
 */

import React from 'react'
import type { BlockConfig } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

// Simple SVG icon component that matches BlockIcon type
const CopilotIcon = (props: any) => 
  React.createElement('svg', { 
    ...props, 
    viewBox: "0 0 24 24", 
    fill: "none", 
    xmlns: "http://www.w3.org/2000/svg" 
  }, 
    React.createElement('circle', { cx: "12", cy: "12", r: "10", fill: "#6366f1" }),
    React.createElement('circle', { cx: "9", cy: "10", r: "2", fill: "white" }),
    React.createElement('circle', { cx: "15", cy: "10", r: "2", fill: "white" }),
    React.createElement('circle', { cx: "12", cy: "16", r: "2", fill: "white" })
  )

export interface OurCopilotResponse extends ToolResponse {
  message: string
  toolCalls?: any[]
  reasoning?: string
  confidence?: number
  suggestions?: string[]
  followUpQuestions?: string[]
}

export const OurCopilotBlock: BlockConfig<OurCopilotResponse> = {
  type: 'our_copilot',
  name: 'Our Copilot',
  description: 'Smart AI-powered copilot with tool integration and memory',
  longDescription:
    'Our own intelligent copilot agent that uses Anthropic/OpenAI models to understand your requests, select appropriate tools, execute them, and provide helpful responses. Features memory management, workflow context awareness, and learning capabilities.',
  docsLink: 'https://docs.sim.ai/blocks/our-copilot',
  category: 'tools',
  bgColor: '#6366f1',
  icon: CopilotIcon,
  subBlocks: [
    {
      id: 'message',
      title: 'Message',
      type: 'long-input',
      placeholder:
        'Ask me anything! I can help you with workflows, execute tools, analyze data, and more. For example: "Show me Google Ads performance for last month", "Create a workflow that sends an email", "Compare campaign performance between periods"',
      rows: 3,
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `You are an AI copilot assistant. Help users craft effective messages for the copilot.

### EXAMPLES OF GOOD MESSAGES:
- "Show me Google Ads campaign performance for the last 30 days"
- "Compare October 2025 vs October 2024 performance"
- "Create a workflow that sends a daily report email"
- "Analyze my top performing keywords and suggest optimizations"
- "Help me debug why my workflow isn't working"
- "Generate a monthly performance report for my campaigns"

### CAPABILITIES:
- **Tool Execution**: Can execute Google Ads, Facebook Ads, email, and other tools
- **Data Analysis**: Analyze performance data and generate insights
- **Workflow Help**: Create, debug, and optimize workflows
- **Comparisons**: Compare performance across time periods
- **Reports**: Generate detailed reports and summaries

### TIPS FOR BETTER RESULTS:
- Be specific about time periods (e.g., "last 30 days", "October 2025")
- Mention specific tools or platforms you want to use
- Include context about your goals
- Ask for specific metrics or formats

Generate a clear, specific message that will help the copilot understand exactly what the user wants to accomplish.`,
      },
    },
    {
      id: 'workflowId',
      title: 'Workflow Context (Optional)',
      type: 'short-input',
      placeholder: 'Enter workflow ID to provide context',
      required: false,
      mode: 'advanced',
    },
    {
      id: 'llmProvider',
      title: 'AI Provider',
      type: 'dropdown',
      options: [
        { id: 'anthropic', label: 'Anthropic (Claude)' },
        { id: 'openai', label: 'OpenAI (GPT)' },
      ],
      defaultValue: 'anthropic',
      required: false,
      mode: 'advanced',
    },
    {
      id: 'temperature',
      title: 'Creativity Level',
      type: 'slider',
      min: 0,
      max: 2,
      step: 0.1,
      defaultValue: 0.7,
      required: false,
      mode: 'advanced',
    },
    {
      id: 'maxTokens',
      title: 'Max Response Length',
      type: 'dropdown',
      options: [
        { id: '2000', label: 'Short (2K tokens)' },
        { id: '4000', label: 'Medium (4K tokens)' },
        { id: '8000', label: 'Long (8K tokens)' },
      ],
      defaultValue: '4000',
      required: false,
      mode: 'advanced',
    },
    {
      id: 'responseStyle',
      title: 'Response Style',
      type: 'dropdown',
      options: [
        { id: 'concise', label: 'Concise' },
        { id: 'friendly', label: 'Friendly' },
        { id: 'detailed', label: 'Detailed' },
        { id: 'technical', label: 'Technical' },
      ],
      defaultValue: 'friendly',
      required: false,
      mode: 'advanced',
    },
    {
      id: 'autoExecuteTools',
      title: 'Auto-execute Tools',
      type: 'switch',
      defaultValue: false,
      required: false,
      mode: 'advanced',
    },
    {
      id: 'showReasoning',
      title: 'Show Reasoning',
      type: 'switch',
      defaultValue: false,
      required: false,
      mode: 'advanced',
    },
    {
      id: 'stream',
      title: 'Stream Response',
      type: 'switch',
      defaultValue: true,
      required: false,
      mode: 'advanced',
    },
  ],
  tools: {
    access: ['our_copilot_chat'],
    config: {
      tool: () => 'our_copilot_chat',
      params: (params) => ({
        message: params.message,
        workflowId: params.workflowId,
        preferences: {
          llmProvider: params.llmProvider || 'anthropic',
          temperature: parseFloat(params.temperature || '0.7'),
          maxTokens: parseInt(params.maxTokens || '4000'),
          responseStyle: params.responseStyle || 'friendly',
          autoExecuteTools: params.autoExecuteTools || false,
          showReasoning: params.showReasoning || false,
        },
        stream: params.stream !== false,
      }),
    },
  },
  inputs: {
    message: { type: 'string', description: 'User message to the copilot' },
    workflowId: { type: 'string', description: 'Workflow ID for context' },
    llmProvider: { type: 'string', description: 'AI provider to use' },
    temperature: { type: 'number', description: 'Creativity level (0-2)' },
    maxTokens: { type: 'number', description: 'Maximum response tokens' },
    responseStyle: { type: 'string', description: 'Response style preference' },
    autoExecuteTools: { type: 'boolean', description: 'Whether to auto-execute tools' },
    showReasoning: { type: 'boolean', description: 'Whether to show reasoning' },
    stream: { type: 'boolean', description: 'Whether to stream response' },
  },
  outputs: {
    message: { type: 'string', description: 'Copilot response message' },
    toolCalls: { type: 'json', description: 'Tools executed by the copilot' },
    reasoning: { type: 'string', description: 'Copilot reasoning process' },
    confidence: { type: 'number', description: 'Confidence level of response' },
    suggestions: { type: 'json', description: 'Suggested follow-up actions' },
    followUpQuestions: { type: 'json', description: 'Suggested follow-up questions' },
    executionTime: { type: 'number', description: 'Time taken to process request' },
  },
}
