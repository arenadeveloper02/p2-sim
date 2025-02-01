export const MODEL_TOOLS = {
  'gpt-4o': 'openai.chat',
  'o1': 'openai.chat',
  'o1-mini': 'openai.chat',
  'deepseek-v3': 'deepseek.chat',
  'deepseek-r1': 'deepseek.reasoner',
  'claude-3-5-sonnet-20241022': 'anthropic.chat',
  'gemini-pro': 'google.chat',
  'grok-2-latest': 'xai.chat'
} as const

export type ModelType = keyof typeof MODEL_TOOLS
export type ToolType = typeof MODEL_TOOLS[ModelType]
