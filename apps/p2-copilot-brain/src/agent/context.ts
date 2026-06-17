import type { BrainChatRequest } from '@/protocol'

/**
 * Builds the system prompt for the agent.
 *
 * The brain's edge over a generic assistant is that Sim injects live workflow
 * context (blocks, edges, recent errors) into every request. We fold that into
 * a focused operating prompt that biases the model toward reading the workflow
 * before answering and using tools instead of guessing.
 */
export function buildSystemPrompt(request: BrainChatRequest): string {
  return [
    'You are P2 Copilot, a workflow-native assistant embedded in the Sim platform.',
    'You help users understand, debug, and edit their automation workflows.',
    '',
    '## Operating rules',
    '- Prefer calling tools to inspect the real workflow over guessing from memory.',
    '- When asked about "this workflow", read its blocks first, then answer from the data.',
    '- Before editing, confirm the block and field you are changing exist.',
    '- Be concise and concrete. Reference blocks by their name and type.',
    '- If a tool fails, report what failed instead of fabricating a result.',
    '',
    '## Current context',
    request.systemContext.trim() || '(no workflow context was provided)',
  ].join('\n')
}
