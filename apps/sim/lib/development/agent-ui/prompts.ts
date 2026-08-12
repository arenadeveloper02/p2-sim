export interface AgentUiPromptContext {
  enabled: boolean
  apiCurl?: string
  apiKey?: string
}

/**
 * Agent UI mandates for generated/edited self-hosted Next.js apps.
 */
export const AGENT_UI_DEVELOPMENT_MANDATES = `## Agent UI mandates (non-negotiable)
- This is a self-hosted Next.js App Router app. Do NOT assume Vercel, GitHub, or Neon provisioning.
- Always include Postgres + Prisma (prisma/schema.prisma, lib/prisma.ts, lib/actions.ts). Persist app data with Prisma — never localStorage/sessionStorage.
- Include a static file preview.html at the project root: a standalone HTML snapshot of the main UI for browser preview (no Next.js, no API calls). Match layout, copy, and colors of the live app.
- README must explain self-host: bun install, copy .env.example to .env, set DATABASE_URL, bunx prisma migrate dev (or prisma db push), bun dev, then open http://localhost:3000. Mention opening preview.html to preview the UI without running the app.
- .env.example must include DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/dbname".
- Never put API keys, tokens, or secrets in client components, preview.html, or README.`

const AGENT_UI_API_MANDATES = `## Workflow API wiring (when a curl is provided)
- Parse the curl for method, URL, headers, and JSON body shape.
- Implement Submit on the main form to POST the form values to a same-origin Route Handler at app/api/run/route.ts.
- That Route Handler must call the curl URL server-side with header X-API-Key from process.env.SIM_API_KEY. Never expose SIM_API_KEY to the browser.
- Put SIM_EXECUTE_URL and SIM_API_KEY in .env.example (empty SIM_API_KEY). Use process.env.SIM_EXECUTE_URL as the execute URL.
- Show loading, error, and the JSON/result returned by the workflow API.
- If no curl is provided, do not call any workflow API on Submit — UI and Postgres only.`

/**
 * Appends Agent UI mandates when agent UI mode is enabled.
 */
export function appendAgentUiSystemPrompt(
  systemPrompt: string,
  context?: AgentUiPromptContext
): string {
  if (!context?.enabled) {
    return systemPrompt
  }

  const apiSection = context.apiCurl?.trim() ? `\n\n${AGENT_UI_API_MANDATES}` : ''
  return `${systemPrompt}\n\n${AGENT_UI_DEVELOPMENT_MANDATES}${apiSection}`
}

/**
 * Redacts API key values from a curl string before sending it to the LLM.
 */
export function redactSecretsInCurl(curl: string): string {
  return curl
    .replace(/(X-API-Key:\s*)([^\s'"]+)/gi, '$1$SIM_API_KEY')
    .replace(/(-H|--header)\s+(['"])X-API-Key:\s*[^'"]+\2/gi, '$1 $2X-API-Key: $SIM_API_KEY$2')
}

/**
 * Appends redacted curl instructions to the user prompt in Agent UI mode.
 */
export function appendAgentUiUserInstructions(
  userInput: string,
  context?: AgentUiPromptContext
): string {
  if (!context?.enabled) {
    return userInput
  }

  const curl = context.apiCurl?.trim()
  if (!curl) {
    return `${userInput}\n\nNo workflow API curl was provided. Do not wire Submit to an external workflow API.`
  }

  return `${userInput}\n\nExact workflow API curl (secrets redacted). Wire the generated app to this call via app/api/run/route.ts using process.env.SIM_API_KEY:\n${redactSecretsInCurl(curl)}`
}
