import type { BrainToolExecConfig, ToolExecResponse } from '@/protocol'

/**
 * Executes a tool by calling back into Sim.
 *
 * The brain never touches the database directly. It asks Sim's internal
 * tool endpoint to run the handler, which keeps auth, permissions, and
 * persistence inside the Sim app where they belong.
 */
export async function executeToolViaSim(
  config: BrainToolExecConfig,
  toolName: string,
  args: unknown
): Promise<ToolExecResponse> {
  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': config.secret,
      },
      body: JSON.stringify({ toolName, args, context: config.context }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { success: false, error: `Tool endpoint returned ${res.status}: ${body.slice(0, 500)}` }
    }

    return (await res.json()) as ToolExecResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tool execution request failed',
    }
  }
}
