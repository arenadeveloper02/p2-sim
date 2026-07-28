const MAIN_ASSISTANT_DISPLAY_NAME = 'Arena Copilot'

/** Internal agent ids / legacy labels shown as the main workspace assistant. */
const MAIN_ASSISTANT_ALIASES = new Set([
  'mothership',
  'sim ai copilot',
  'sim copilot',
  'sim.ai copilot',
  'arena ai copilot',
  'arena copilot',
])

/**
 * Maps internal assistant/agent labels to user-facing display text in chat UI.
 */
export function resolveAssistantDisplayLabel(label: string | undefined | null): string {
  const trimmed = label?.trim()
  if (!trimmed) return MAIN_ASSISTANT_DISPLAY_NAME

  if (MAIN_ASSISTANT_ALIASES.has(trimmed.toLowerCase())) {
    return MAIN_ASSISTANT_DISPLAY_NAME
  }

  return trimmed
}
