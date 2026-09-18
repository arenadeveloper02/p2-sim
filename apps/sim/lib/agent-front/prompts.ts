import {
  type AgentFrontApiEndpoint,
  type AgentFrontCombineMode,
  redactCurlForPrompt,
} from '@/lib/agent-front/apis'
import type { AgentFrontUiMode } from '@/lib/agent-front/scaffold'

export interface AgentFrontPromptContext {
  userInput: string
  uiMode: AgentFrontUiMode
  combineMode: AgentFrontCombineMode
  apis: AgentFrontApiEndpoint[]
  existingPageTsx?: string
}

/**
 * System prompt for Agent Front UI generation (form or chat).
 */
export function buildAgentFrontSystemPrompt(context: AgentFrontPromptContext): string {
  const apiLines = context.apis
    .map((api) => {
      const redacted = redactCurlForPrompt(api.curl)
      return `- name: ${api.name}; slug: ${api.slug}; curl (redacted): ${redacted}`
    })
    .join('\n')

  return `You generate a self-hosted Next.js App Router UI for calling one or more workflow APIs.

Rules:
- Output MUST match the JSON schema exactly.
- uiMode is "${context.uiMode}". Build either a form UI or a chat UI accordingly.
- The client MUST call POST /api/run with JSON. Never put API keys or execute URLs in client code.
- Combine mode is "${context.combineMode}":
  - parallel/prompt: /api/run returns { results, apis } with per-slug payloads
  - sequence: /api/run returns { steps, result }
- Render API responses clearly (summary cards, JSON viewer, tables when appropriate).
- pageTsx must be a complete 'use client' React component default export for app/page.tsx.
- Use only React and fetch — no external UI libraries.
- previewHtml must be a complete standalone HTML document that visually approximates the UI (static; buttons may be inert).
- Do not invent extra backend routes. Only POST /api/run exists.
- Keep TypeScript valid. No markdown fences in string fields.

Wired APIs:
${apiLines}`
}

/**
 * User prompt for generate or edit.
 */
export function buildAgentFrontUserPrompt(context: AgentFrontPromptContext): string {
  if (context.existingPageTsx) {
    return `Edit the existing Agent Front page based on this request:

${context.userInput}

Current app/page.tsx:
\`\`\`tsx
${context.existingPageTsx}
\`\`\`

Return updated appName, description, features, pageTsx, and previewHtml.`
  }

  return `Build an Agent Front UI from this request:

${context.userInput}

Return appName, description, features, pageTsx, and previewHtml.`
}

export const agentFrontLlmOutputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['appName', 'description', 'features', 'pageTsx', 'previewHtml'],
  properties: {
    appName: { type: 'string' },
    description: { type: 'string' },
    features: {
      type: 'array',
      items: { type: 'string' },
    },
    pageTsx: { type: 'string' },
    previewHtml: { type: 'string' },
  },
} as const
