import { z } from 'zod'
import type { ContractBody, ContractBodyInput } from '@/lib/api/contracts/types'
import { defineRouteContract } from '@/lib/api/contracts/types'

const agentFrontApiSlotSchemas = {
  api1Name: z.string().optional(),
  api1Curl: z.string().optional(),
  api1Key: z.string().optional(),
  api2Name: z.string().optional(),
  api2Curl: z.string().optional(),
  api2Key: z.string().optional(),
  api3Name: z.string().optional(),
  api3Curl: z.string().optional(),
  api3Key: z.string().optional(),
  workspaceId: z.string().optional(),
  workflowId: z.string().optional(),
  executionId: z.string().optional(),
} as const

export const agentFrontGenerateBodySchema = z.object({
  userInput: z.string().min(1, 'userInput is required'),
  uiMode: z.enum(['form', 'chat']).optional(),
  combineMode: z.enum(['parallel', 'sequence', 'prompt']).optional(),
  repoName: z.string().optional(),
  ...agentFrontApiSlotSchemas,
})

export const agentFrontEditBodySchema = z.object({
  userInput: z.string().min(1, 'userInput is required'),
  repoName: z.string().min(1, 'repoName is required'),
  uiMode: z.enum(['form', 'chat']).optional(),
  combineMode: z.enum(['parallel', 'sequence', 'prompt']).optional(),
  ...agentFrontApiSlotSchemas,
})

const agentFrontResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  content: z.string().optional(),
  appName: z.string().optional(),
  repoName: z.string().optional(),
  description: z.string().optional(),
  features: z.array(z.string()).optional(),
  outputPath: z.string().optional(),
  absoluteOutputPath: z.string().optional(),
  fileCount: z.number().optional(),
  uiMode: z.string().optional(),
  combineMode: z.string().optional(),
  apiCount: z.number().optional(),
  apis: z
    .array(
      z.object({
        name: z.string(),
        slug: z.string(),
        wired: z.boolean(),
      })
    )
    .optional(),
  previewHtml: z.string().optional(),
  previewPath: z.string().optional(),
  cost: z
    .object({
      input: z.number(),
      output: z.number(),
      total: z.number(),
    })
    .optional(),
  model: z.string().optional(),
  tokens: z
    .object({
      input: z.number(),
      output: z.number(),
      total: z.number(),
    })
    .optional(),
})

export const agentFrontGenerateContract = defineRouteContract({
  method: 'POST',
  path: '/api/tools/agent-front/generate',
  body: agentFrontGenerateBodySchema,
  response: { mode: 'json', schema: agentFrontResultSchema },
})

export const agentFrontEditContract = defineRouteContract({
  method: 'POST',
  path: '/api/tools/agent-front/edit',
  body: agentFrontEditBodySchema,
  response: { mode: 'json', schema: agentFrontResultSchema },
})

export type AgentFrontGenerateBody = ContractBody<typeof agentFrontGenerateContract>
export type AgentFrontGenerateBodyInput = ContractBodyInput<typeof agentFrontGenerateContract>
export type AgentFrontEditBody = ContractBody<typeof agentFrontEditContract>
export type AgentFrontEditBodyInput = ContractBodyInput<typeof agentFrontEditContract>
