import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { generateId } from '@sim/utils/id'
import { generateEngagementStatusMessages } from '@/local-copilot/lib/agent/engagement-status'
import { iterateWithIdleStatus } from '@/local-copilot/lib/agent/iterate-with-idle-status'
import { runToolWithStatus } from '@/local-copilot/lib/agent/run-tool-with-status'
import { MODEL_WAIT_STATUS_FALLBACK } from '@/local-copilot/lib/agent/status-messages'
import { logCopilotAction } from '@/local-copilot/lib/audit/logger'
import { recordLocalCopilotTurnUsage } from '@/local-copilot/lib/billing/record-turn-usage'
import { LocalTurnCostAccumulator } from '@/local-copilot/lib/billing/turn-cost-accumulator'
import { getLocalCopilotConfig } from '@/local-copilot/lib/config'
import {
  buildLocalCopilotContext,
  contextToPromptJson,
} from '@/local-copilot/lib/context/build-context'
import {
  compactChatHistory,
  estimateChatMessagesTokens,
  fitPromptToTokenBudget,
  LOCAL_COPILOT_PROMPT_TOKEN_BUDGET,
  resolveWorkflowContextDetail,
} from '@/local-copilot/lib/context/context-budget'
import { getLocalCopilotMemorySnapshot } from '@/local-copilot/lib/diagnostics'
import { formatOptionsTag } from '@/local-copilot/lib/format-options-tag'
import {
  appendMessage,
  createConversation,
  getMessages,
  recordToolCall,
  savePatch,
} from '@/local-copilot/lib/persistence/store'
import { getLocalCopilotProvider } from '@/local-copilot/lib/providers/registry'
import type { ChatMessage } from '@/local-copilot/lib/providers/types'
import {
  stripLeakedToolMarkers,
  synthesizeAssistantSummaryFromTools,
  type ToolTurnRecord,
} from '@/local-copilot/lib/synthesize-assistant-summary'
import {
  LOCAL_COPILOT_TOOLS,
  resolveLocalCopilotTools,
} from '@/local-copilot/lib/tools/definitions'
import type { ToolExecutionContext } from '@/local-copilot/lib/tools/executor'
import {
  buildFollowUpContinuationMessage,
  detectMandatoryFollowUp,
  formatToolResultForLlm,
  type MandatoryFollowUp,
  resolveMandatoryFollowUps,
  sortToolCallsForExecution,
} from '@/local-copilot/lib/tools/format-tool-result'
import { isWorkflowScopedDelegatedTool } from '@/local-copilot/lib/tools/mothership-delegated-tool-defs'
import type { LocalCopilotStreamEvent, WorkflowPatch } from '@/local-copilot/lib/types'
import {
  buildLocalCopilotUserTurn,
  type CopilotContextEntry,
  type CopilotFileAttachmentRef,
  getLocalCopilotUserTurnText,
} from '@/local-copilot/lib/user-turn-content'
import { MAX_TOOL_ITERATIONS } from '@/providers'

const logger = createLogger('LocalCopilotAgent')

const MAX_FORCED_FOLLOW_UP_ROUNDS = 5

const SYSTEM_PROMPT = `You are Arena Copilot — the in-app AI assistant for building, debugging, and understanding workflows in this workspace.

Identity:
- Your name is Arena Copilot. When speaking to the user, always refer to yourself as "Arena Copilot".
- Never call yourself Sim AI Copilot, Sim Copilot, Sim.ai Copilot, Mothership, or any other name.

Response format:
- Open with a warm, concise greeting when starting a conversation or after a long pause.
- Briefly summarize what you see in the workspace (workflows, files, tables, knowledge bases) in plain prose. Do not greet with a generic capability bullet list.
- Never mention cost, pricing, dollar amounts, or spend in user-facing replies — even if tool results include them (e.g. do not write "cost ~$0.016"). You may still mention runtime/duration when useful.
- When suggesting next steps, end your message with a clickable options block in this exact format (never use markdown bullet lists for suggestions):

<options>{"1":{"title":"Run Weekly Email Summary","description":"Execute the existing workflow and summarize results"},"2":{"title":"Debug the last run","description":"Inspect logs from the most recent execution"},"3":{"title":"Create a brand-new workflow","description":"Only when nothing existing fits"}}</options>

- Each option title is sent as the user's next message when they click it — write titles as clear imperative commands (e.g. "Check my inbox", "Debug the last run").
- Include 3–4 options when offering follow-ups. Omit the options block when no follow-ups are needed.
- Charts: when the user asks for a chart, graph, plot, or visualization of data you have (tool results, logs, tables, numbers they provided), render it inline with a chart tag in this exact format (never quickchart.io links, never ASCII art, never a markdown table as a substitute):

<chart>{"type":"bar","title":"Runs per day","labels":["Mon","Tue","Wed"],"series":[{"name":"Successful","data":[12,18,9]},{"name":"Failed","data":[1,0,3]}]}</chart>

- Chart tag rules: \`type\` is one of "bar", "line", "area", "pie", "scatter". \`labels\` are x-axis categories (or slice names for pie). Each \`series\` entry has an optional \`name\` and a numeric \`data\` array (for scatter, data may be [x,y] pairs). Pie charts use exactly one series whose values pair with \`labels\`. Keep the JSON on a single line with no comments. Add a one-sentence takeaway in prose near the chart; do not repeat all the numbers in text.

Rules:
- You have awareness of the workspace, available blocks/integrations, and (when open) the current workflow structure, variables, logs, and credential metadata (never secrets).
- Existing workflows first (CRITICAL):
  - \`workspaceWorkflows\` lists every workflow in this workspace (id, name, isDeployed, lastRunAt). Read \`guidance\` in context when present.
  - When the user asks to run, test, execute, try, debug, check, or use a workflow — or their request matches an existing workflow name or purpose — use \`get_workflow_run_options\` then \`run_workflow\` on that workflow. NEVER call \`create_workflow\`.
  - When only one workflow exists, assume the user means that workflow unless they explicitly ask for something new.
  - Only call \`create_workflow\` when the user clearly wants a brand-new workflow with a distinct name and purpose. Pass \`confirmNewWorkflow: true\` in that case.
  - If a workflow already exists with the same or similar name, run or edit it — do not duplicate it.
- On the workspace home chat there may be no workflow open — still prefer running or editing \`workspaceWorkflows\` entries before creating new ones.
- After create_workflow succeeds (only when truly new), immediately call edit_workflow with add operations to populate the workflow. Use the returned workflowId and startBlockId.
- Building workflows with edit_workflow (CRITICAL — follow exactly to avoid retry loops):
  - Call get_blocks_metadata with the block types you need (e.g. \`["agent","start_trigger"]\`) before the first edit — use the returned input field ids verbatim in params.inputs.
  - Never add edges as separate operations or with type "edge". Connections live on the SOURCE block: \`params.connections: { source: "<target-block-id>" }\`. To wire Start → Agent, edit the Start block (startBlockId from create_workflow) with connections pointing to the agent block_id.
  - Agent block: use \`messages\` (array of \`{role, content}\`), \`model\`, and \`tools\` — not systemPrompt/userPrompt. Exa web search tool entry: \`{ type: "exa", title: "Exa Search", toolId: "exa_search", usageControl: "auto" }\`.
  - Prefer one edit_workflow call with all add operations plus a final edit on the Start block for connections. deferredConnections in results are normal for forward references within the same batch — do not re-issue them unless the target id was wrong.
  - If workflowLintMessage reports orphan blocks, fix connections on the Start (or upstream) block before run_workflow.
- Block output references (CRITICAL):
  - Wire upstream block outputs using angle-bracket tags with the block's **display name**, never its UUID: \`<My Agent.content>\`, not \`<bd80a5a8-ef94-43ef-afcf-f6daa926495f.content>\`.
  - Before wiring inputs (e.g. Gmail body, Slack message, API payload), call \`get_block_upstream_references\` for the target block and use the exact tags returned (e.g. \`agent1.content\` for a default agent without structured outputs).
  - Block UUIDs are for \`block_id\` in operations only — never put UUIDs inside \`<...>\` reference tags.
- When edit_workflow returns skippedItems, inputValidationErrors, workflowLintMessage, or needsFollowUpEdit, call edit_workflow again with corrected operations. Do not tell the user the workflow is complete until these are resolved.
- deferredConnections in edit_workflow results are normal — the engine wires them when target blocks exist. Do not re-issue deferred edges unless the target id was a typo.
- Never expose API keys, tokens, passwords, or secret env values.
- Credentials and API keys:
  - Context includes \`connectedIntegrations\` (OAuth) and \`envVariables\` (configured env key names only). If an integration or its env key (e.g. \`FIRECRAWL_API_KEY\`, \`FALAI_API_KEY\`) appears there, credentials are already available — NEVER ask the user for an API key.
  - When \`hostedKeysAvailable\` is true, many api_key blocks also receive platform-hosted keys at runtime — do not prompt for keys unless a tool returns an explicit missing-credential error.
  - For OAuth blocks, pass the \`credentialId\` from \`connectedIntegrations\`. For api_key blocks backed by env vars, omit api-key subblock values — execution reads workspace env automatically.
  - Only ask the user to configure a key when it is missing from both \`connectedIntegrations\` and \`envVariables\` and hosted keys do not apply.
- Direct one-off actions (no workflow required):
  - For simple requests — generate an image, search the live web, scrape a site, call an API — use direct tools when keys are already configured. Do NOT create a workflow first.
  - Image: \`generate_image\` with a clear \`prompt\` (and optional \`outputs.files\` path to save the file).
  - For variations, pass the user's exact wording in \`prompt\` (e.g. "3 variations of a red bus") — do not strip counts or the word "variations".
  - Live web / current data: \`search_online\` with \`query\` and \`toolTitle\` (uses Exa/Serper when \`EXA_API_KEY\` / Serper keys exist).
  - Other integrations: \`list_integration_tools({ integration: "gmail" })\` (underscores, not hyphens) then \`invoke_integration_tool({ toolId: "gmail_draft_v2", params: { ... } })\`. Never call \`load_integration_tool\` — that is Cloud-only; Arena Copilot uses \`invoke_integration_tool\`.
  - For OAuth integrations (Google Sheets, Gmail, Slack, etc.), \`params\` MUST include \`credentialId\` from \`connectedIntegrations\` for that provider (e.g. providerId \`google-email\` for Gmail, \`google-sheets\` for Sheets). If only one connected credential matches, Arena Copilot injects it automatically. Google Docs/Drive/Sheets credentials are interchangeable for Drive search + Docs/Sheets tools.
  - Google Docs by name (not ID): first \`google_drive_list\` with \`query\` set to the document title (or \`google_drive_search\` with \`prompt\` describing the doc), pick the matching file id (\`mimeType\` \`application/vnd.google-apps.document\`), then \`google_docs_read\` / \`google_docs_write\` with that \`documentId\`. Never pass the title as \`documentId\`.
  - Google Sheets write/update/append: pass \`spreadsheetId\`, \`sheetName\` (tab name), \`values\` as a 2D array (e.g. \`[["Name","Age"],["Alice",30]]\`). Optional \`cellRange\` like \`A1\`. Legacy \`range\` like \`Sheet1!A1\` is also accepted.
  - Gmail drafts (one-off, no workflow): \`invoke_integration_tool({ toolId: "gmail_draft_v2", params: { to, subject, body, credentialId } })\`. \`to\` and \`body\` are required strings. For separate drafts to multiple people, call once per recipient with a single email in \`to\` (Arena also fans out if \`to\` is an array). Do not put everyone on one draft unless the user asked for a single email.
  - Only build or run a workflow when the user wants automation saved for reuse, multi-step pipelines, or scheduling.
- For open workflows, propose incremental changes via workflow patches (requiresConfirmation). For new workflows from home chat, use create_workflow + edit_workflow.
- Running and testing workflows:
  - On home chat there is no open workflow — always pass \`workflowId\` from \`workspaceWorkflows\` (or the workflow name; it will be resolved automatically when unambiguous).
  - Use \`get_workflow_run_options\` first to discover triggers, required \`workflow_input\`, and mock payloads.
  - Use \`run_workflow\` to execute a workflow and inspect block outputs. Pass \`workflowId\` from \`workspaceWorkflows\` on home chat, or omit it when a workflow is already open.
  - After a run, summarize key block outputs for the user in plain language. Use \`query_logs\` with the returned \`executionId\` for deeper debugging.
  - Use \`list_integration_tools\` to see operations available for a connected integration service.
  - Use \`get_workflow_data\` to load workflow structure when you need details for a workflow that is not currently open.
- Deploying workflows as chat (CRITICAL):
  - When the user asks to deploy, publish, or share a workflow as chat — call \`deploy_chat\` directly. Never tell them to open the Deploy tab or click through the UI unless a tool returns an authorization error.
  - Pass \`workflowId\` from \`workspaceWorkflows\` or the open workflow. Derive \`identifier\` as a lowercase slug (letters, numbers, hyphens) from the workflow name when the user does not specify one.
  - On deploy, \`versionName\` and \`versionDescription\` are required. For first deploy, use a sensible label (e.g. versionName: "Initial chat deploy", versionDescription: "First chat deployment"). On updates, call \`diff_workflows\` with ref1 "live" and ref2 "draft" first if unsure what changed.
  - Call \`get_block_outputs\` when you need \`outputConfigs\` (typically the agent block's \`content\` path for chat responses).
  - On success, return the \`chatUrl\` from the tool result so the user can open the deployed chat.
- Files, tables, and knowledge bases:
  - Context includes \`workspaceFiles\` (id, name, vfs path), \`tables\`, and \`knowledgeBases\`.
  - Find files: \`glob\` with a pattern like \`files/**/*.csv\`, then \`read\` using the exact path from results.
  - Create files: \`create_file_folder\` when needed, then \`create_file\` with \`content\` for markdown/text/json/csv (one step). Never call \`create_file\` without \`content\` for .md files unless you will immediately follow with \`workspace_file\` update + \`edit_content\`.
  - Read or update existing files: \`workspace_file\` (update/append/patch) then \`edit_content\` in the **next** step with the body — never parallel.
  - Read or update tables: \`user_table\` — use \`get\` / \`get_schema\` / \`query_rows\` to read; \`create\`, \`insert_row\`, \`batch_insert_rows\`, \`import_file\`, \`create_from_file\` to write.
  - Knowledge bases: \`knowledge_base\` — \`query\` to search/retrieve; \`add_file\` to ingest a workspace file or URL; \`create\` for new KBs; \`get\` / \`list\` to inspect.
  - Prefer existing resources in context before creating duplicates (same as workflows).
- Workspace skills:
  - Context may include \`skills\` (name + description). Descriptions only say when a skill applies — they are NOT the instructions.
  - When a skill applies, call \`load_user_skill\` with its exact \`skill_name\`, then follow the returned content. Never act on the name or description alone.
- E2B sandbox and code execution:
  - Context includes \`e2b\`: \`enabled\`, \`docSandboxEnabled\`, and \`supportedCodeLanguages\`.
  - When \`e2b.enabled\` is true, use \`function_execute\` for Python, shell, and JavaScript with workspace files/tables mounted via \`inputs\`. Save outputs with \`outputs.files\` or \`outputPath\`.
  - When E2B is disabled, \`function_execute\` supports JavaScript only (isolated-vm).
  - Code execution results include \`capturedOutput\` (preferred), plus \`stdout\` (prints) and \`result\` (return values). Read \`capturedOutput\` first — empty stdout with a return value is normal, not a failure.
  - Do **not** use \`function_execute\` or Daytona integration tools for workflow building, deployment, or questions you can answer without running code.
  - Do **not** tell the user about sandbox names (E2B, Daytona), empty payloads, internal retries, or "result variables" unless they explicitly asked to debug code execution. Give the answer directly.
  - Creating PPTX / DOCX / PDF (CRITICAL — always available, do not refuse):
    1. \`create_file\` with a \`.pptx\` / \`.docx\` / \`.pdf\` path (empty shell — no inline content).
    2. \`workspace_file\` with operation \`update\` (or \`append\`/\`patch\`) targeting that file — wait for success.
    3. \`edit_content\` in a **later** tool round (never same batch as workspace_file) with **JavaScript** for the document API: \`pptxgenjs\` (\`globalThis.pptx\`), \`docxjs\`, or \`pdflibjs\`. Example: \`pptx.addSlide(); slide.addText("Title", { x: 0.5, y: 0.5, w: 9, h: 1 });\` — use the pre-initialized \`pptx\` instance; do not \`require('pptxgenjs')\` yourself.
    - These formats compile via the built-in JS sandbox even when \`e2b.docSandboxEnabled\` is false. \`docSandboxEnabled: true\` only adds E2B extras (e.g. \`iconImage\`). Never tell the user you cannot generate PPTX because E2B is off.
    - Do **not** use \`function_execute\` / Python \`python-pptx\` / matplotlib for workspace office files unless the user explicitly asks to run sandbox code.
  - For interactive web apps (npm build in sandbox): \`invoke_integration_tool\` with \`development_generate_app\` or \`development_edit_app\` when E2B is enabled.
- Use tools to inspect context, validate workflows, fetch logs, run tests, and build or edit workflows.
- When debugging failures, identify root cause, failing block, suggested fix, and test steps.
- Be concise and actionable.`

export interface RunAgentParams {
  userId: string
  workspaceId: string
  workflowId?: string
  message: string
  conversationId?: string
  chatId?: string
  /** Scopes workspace_file → edit_content intents (mothership user message id when available). */
  messageId?: string
  /** Copilot run id for Usage joins (`usage_log.run_id`). */
  runId?: string
  selectedBlockId?: string
  executionId?: string
  /** Parent workflow execution when Local runs inside a mothership block. */
  parentExecutionId?: string
  signal?: AbortSignal
  /** Prior turns from mothership chat (`copilot_messages`). */
  priorMessages?: ChatMessage[]
  /** When false, skip `local_copilot_*` persistence (mothership chat owns the transcript). */
  persistLocally?: boolean
  /**
   * When false, accumulate cost but do not write `usage_log` (workflow logger owns
   * mothership-block cost via `result.cost`). Defaults to true for interactive chat.
   */
  writeChatLedger?: boolean
  /** Workspace permission for write tools (create_file, user_table create, knowledge_base add_file). */
  userPermission?: string
  /** Mothership request context entries (upload hints, resource tags, etc.). */
  contexts?: CopilotContextEntry[]
  /** Raw file attachment refs from the chat request (fallback when context is missing). */
  fileAttachments?: CopilotFileAttachmentRef[]
  /** Workspace markdown snapshot from mothership payload. */
  workspaceContext?: string
}

export async function* runLocalCopilotAgent(
  params: RunAgentParams
): AsyncGenerator<LocalCopilotStreamEvent, void, undefined> {
  const startedAt = Date.now()
  const config = getLocalCopilotConfig()
  logger.info('Arena Copilot agent starting', {
    workspaceId: params.workspaceId,
    workflowId: params.workflowId ?? null,
    chatId: params.chatId ?? null,
    provider: config.provider,
    model: config.model,
    hasApiKey: Boolean(config.apiKey),
    messageChars: params.message.length,
    priorTurns: params.priorMessages?.length ?? 0,
    memory: getLocalCopilotMemorySnapshot(),
  })

  let structuredContext
  try {
    structuredContext = await buildLocalCopilotContext({
      userId: params.userId,
      workspaceId: params.workspaceId,
      ...(params.workflowId ? { workflowId: params.workflowId } : {}),
      selectedBlockId: params.selectedBlockId,
      executionId: params.executionId,
    })
  } catch (error) {
    logger.error('Arena Copilot context build failed', {
      workspaceId: params.workspaceId,
      workflowId: params.workflowId ?? null,
      error: getErrorMessage(error, 'context build failed'),
      memory: getLocalCopilotMemorySnapshot(),
    })
    throw error
  }

  logger.info('Arena Copilot context built', {
    workspaceId: params.workspaceId,
    workflowId: params.workflowId ?? null,
    workspaceWorkflowCount: structuredContext.workspaceWorkflows?.length ?? 0,
    availableBlockCount: structuredContext.availableBlocks?.length ?? 0,
    durationMs: Date.now() - startedAt,
    memory: getLocalCopilotMemorySnapshot(),
  })

  const persistLocally = params.persistLocally !== false
  const writeChatLedger = params.writeChatLedger !== false
  const turnCost = new LocalTurnCostAccumulator()

  let conversationId = params.conversationId
  if (persistLocally) {
    if (!conversationId) {
      conversationId = await createConversation({
        userId: params.userId,
        workspaceId: params.workspaceId,
        workflowId: params.workflowId,
        model: config.model,
        provider: config.provider,
      })
    }

    await appendMessage({
      conversationId,
      role: 'user',
      content: { text: params.message },
    })

    await logCopilotAction({
      userId: params.userId,
      workspaceId: params.workspaceId,
      workflowId: params.workflowId,
      conversationId,
      action: 'chat_message',
      summary: params.message.slice(0, 200),
    })
  }

  const historyMessages: ChatMessage[] = params.priorMessages?.length
    ? compactChatHistory(params.priorMessages)
    : conversationId
      ? compactChatHistory(
          (await getMessages(conversationId)).slice(0, -1).flatMap((row) => {
            const content = row.content as { text?: string }
            if (!content.text) return []
            return [{ role: row.role as 'user' | 'assistant', content: content.text }]
          })
        )
      : []

  const workflowDetail = resolveWorkflowContextDetail(structuredContext)
  const contextJson = contextToPromptJson(structuredContext, { workflowDetail })
  const userTurn = await buildLocalCopilotUserTurn({
    message: params.message,
    ...(params.contexts?.length ? { contexts: params.contexts } : {}),
    ...(params.fileAttachments?.length ? { fileAttachments: params.fileAttachments } : {}),
    ...(params.chatId ? { chatId: params.chatId } : {}),
  })
  const userTurnText = getLocalCopilotUserTurnText(userTurn)

  const messages: ChatMessage[] = fitPromptToTokenBudget(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: `Current context:\n${contextJson}`,
      },
      ...(params.workspaceContext
        ? [{ role: 'system' as const, content: `Workspace snapshot:\n${params.workspaceContext}` }]
        : []),
      ...historyMessages,
      userTurn,
    ],
    LOCAL_COPILOT_PROMPT_TOKEN_BUDGET
  )

  const tools = await resolveLocalCopilotTools(params.workspaceId)

  logger.info('Arena Copilot prompt budget applied', {
    workflowDetail,
    historyTurns: historyMessages.length,
    contextEntries: params.contexts?.length ?? 0,
    fileAttachments: params.fileAttachments?.length ?? 0,
    estimatedPromptTokens: estimateChatMessagesTokens(messages),
    toolDefinitionCount: tools.length,
    skillToolEnabled: tools.length > LOCAL_COPILOT_TOOLS.length,
    memory: getLocalCopilotMemorySnapshot(),
  })

  const provider = getLocalCopilotProvider()
  const turnMessageId = params.messageId?.trim() || generateId()
  const toolCtx: ToolExecutionContext = {
    userId: params.userId,
    workspaceId: params.workspaceId,
    workflowId: params.workflowId,
    chatId: params.chatId,
    messageId: turnMessageId,
    abortSignal: params.signal,
    userPermission: params.userPermission,
    structuredContext,
    selectedBlockId: params.selectedBlockId,
    lastUserMessage: userTurnText,
  }

  /** Loads the heavy tool executor graph on first tool call only. */
  let toolExecutorModule: typeof import('@/local-copilot/lib/tools/executor') | null = null
  async function getToolExecutor() {
    if (!toolExecutorModule) {
      const loadStartedAt = Date.now()
      logger.info('Arena Copilot lazy-loading tool executor', {
        workspaceId: params.workspaceId,
        memory: getLocalCopilotMemorySnapshot(),
      })
      toolExecutorModule = await import('@/local-copilot/lib/tools/executor')
      logger.info('Arena Copilot tool executor loaded', {
        workspaceId: params.workspaceId,
        durationMs: Date.now() - loadStartedAt,
        memory: getLocalCopilotMemorySnapshot(),
      })
    }
    return toolExecutorModule
  }
  let assistantText = ''
  let proposedPatch: WorkflowPatch | undefined
  let recommendations: string[] = []
  const turnToolRecords: ToolTurnRecord[] = []
  const maxToolRounds = MAX_TOOL_ITERATIONS
  let pendingFollowUps: MandatoryFollowUp[] = []
  let forcedFollowUpRounds = 0

  for (let round = 0; round < maxToolRounds; round++) {
    const pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = []
    let roundInputTokens = 0
    let roundOutputTokens = 0

    // Status heartbeats cover the immediate first line + rotation while the
    // model stream is quiet (including pauses after the first token).
    for await (const event of iterateWithIdleStatus({
      source: provider.chatCompletionStream({
        model: config.model,
        messages,
        tools,
        signal: params.signal,
      }),
      abortSignal: params.signal,
      messages: MODEL_WAIT_STATUS_FALLBACK,
      idleMs: 0,
      intervalMs: 4000,
      enrichMessages: (abortSignal) =>
        generateEngagementStatusMessages({
          phase: 'model_wait',
          userHint: params.message,
          signal: abortSignal,
        }),
    })) {
      if (event.type === 'status') {
        yield event
        continue
      }

      const chunk = event.item
      if (chunk.type === 'text' && chunk.content) {
        const cleaned = stripLeakedToolMarkers(chunk.content, { trim: false })
        if (!cleaned) continue
        assistantText += cleaned
        yield { type: 'text_delta', content: cleaned }
      }
      if (chunk.type === 'tool_call' && chunk.toolCall) {
        pendingToolCalls.push(chunk.toolCall)
      }
      if (chunk.type === 'done' && chunk.usage) {
        roundInputTokens = chunk.usage.inputTokens
        roundOutputTokens = chunk.usage.outputTokens
      }
    }

    logger.info('Arena Copilot model round finished', {
      round,
      toolCallCount: pendingToolCalls.length,
      toolNames: pendingToolCalls.map((call) => call.name),
      assistantChars: assistantText.length,
      inputTokens: roundInputTokens,
      outputTokens: roundOutputTokens,
      memory: getLocalCopilotMemorySnapshot(),
    })

    if (roundInputTokens > 0 || roundOutputTokens > 0) {
      // Arena Copilot (local mothership) accumulates model cost for one end-of-turn
      // ledger write. Sim Cloud mothership uses Go pricing + `workspace-chat` /
      // `mothership_block` via `/api/billing/update-cost` — keep these separate.
      turnCost.addModelUsage({
        model: config.model,
        inputTokens: roundInputTokens,
        outputTokens: roundOutputTokens,
        provider: config.provider,
      })
    }

    if (pendingToolCalls.length === 0) {
      if (
        pendingFollowUps.length > 0 &&
        forcedFollowUpRounds < MAX_FORCED_FOLLOW_UP_ROUNDS &&
        round < maxToolRounds - 1
      ) {
        forcedFollowUpRounds += 1
        const continuation = buildFollowUpContinuationMessage(pendingFollowUps)
        messages.push({ role: 'user', content: continuation })
        logger.info('Arena Copilot forcing mandatory follow-up continuation', {
          round,
          forcedFollowUpRounds,
          pendingFollowUpIds: pendingFollowUps.map((item) => item.id),
        })
        continue
      }

      if (pendingFollowUps.length > 0) {
        logger.warn('Arena Copilot ended with unresolved mandatory follow-ups', {
          round,
          pendingFollowUpIds: pendingFollowUps.map((item) => item.id),
        })
      }
      break
    }

    const orderedToolCalls = sortToolCallsForExecution(pendingToolCalls)

    messages.push({
      role: 'assistant',
      content: assistantText,
      toolCalls: orderedToolCalls,
    })
    assistantText = ''

    for (const call of orderedToolCalls) {
      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = JSON.parse(call.arguments || '{}') as Record<string, unknown>
      } catch {
        parsedArgs = {}
      }

      yield {
        type: 'tool_call_start',
        toolCallId: call.id,
        toolName: call.name,
        args: parsedArgs,
      }

      const { executeLocalCopilotTool, refreshToolContext } = await getToolExecutor()
      const toolStartedAt = Date.now()
      logger.info('Arena Copilot tool starting', {
        toolName: call.name,
        toolCallId: call.id,
        workflowId: toolCtx.workflowId ?? null,
        memory: getLocalCopilotMemorySnapshot(),
      })
      const toolStatus = runToolWithStatus({
        toolCallId: call.id,
        toolName: call.name,
        args: parsedArgs,
        abortSignal: params.signal,
        execute: (onProgress) =>
          executeLocalCopilotTool(call.name, parsedArgs, { ...toolCtx, onProgress }),
      })
      let result = await toolStatus.next()
      while (!result.done) {
        yield result.value
        result = await toolStatus.next()
      }
      const toolResult = result.value
      logger.info('Arena Copilot tool finished', {
        toolName: call.name,
        toolCallId: call.id,
        success: toolResult.success,
        error: toolResult.error ?? null,
        durationMs: Date.now() - toolStartedAt,
        memory: getLocalCopilotMemorySnapshot(),
      })

      if (toolResult.createdWorkflowId) {
        toolCtx.workflowId = toolResult.createdWorkflowId
        const refreshed = await refreshToolContext(toolCtx)
        toolCtx.structuredContext = refreshed.structuredContext
      } else if (call.name === 'create_workflow' && !toolResult.success) {
        const output =
          toolResult.result && typeof toolResult.result === 'object'
            ? (toolResult.result as Record<string, unknown>)
            : {}
        if (
          output.useRunWorkflowInstead === true &&
          typeof output.existingWorkflowId === 'string' &&
          output.existingWorkflowId.trim()
        ) {
          toolCtx.workflowId = output.existingWorkflowId.trim()
        }
      } else if (call.name === 'edit_workflow' && toolResult.success) {
        const refreshed = await refreshToolContext(toolCtx)
        toolCtx.structuredContext = refreshed.structuredContext
      } else if (toolResult.success && isWorkflowScopedDelegatedTool(call.name)) {
        const output =
          toolResult.result && typeof toolResult.result === 'object'
            ? (toolResult.result as Record<string, unknown>)
            : {}
        const resolvedWorkflowId =
          typeof output.workflowId === 'string' && output.workflowId.trim()
            ? output.workflowId.trim()
            : typeof parsedArgs.workflowId === 'string' && parsedArgs.workflowId.trim()
              ? parsedArgs.workflowId.trim()
              : undefined
        if (resolvedWorkflowId) {
          toolCtx.workflowId = resolvedWorkflowId
        }
      }

      yield {
        type: 'tool_call_result',
        toolCallId: call.id,
        toolName: call.name,
        success: toolResult.success,
        output: toolResult.result,
        ...(toolResult.error ? { error: toolResult.error } : {}),
        ...(toolResult.resources?.length ? { resources: toolResult.resources } : {}),
      }

      turnToolRecords.push({
        name: call.name,
        success: toolResult.success,
        result: toolResult.result,
      })

      turnCost.addToolBilling({
        toolName: call.name,
        billing: toolResult.billing,
      })

      if (persistLocally && conversationId) {
        await recordToolCall({
          conversationId,
          toolCallId: call.id,
          toolName: call.name,
          arguments: parsedArgs,
          result: toolResult.result,
        })
      }

      if (toolResult.patch) {
        proposedPatch = toolResult.patch
        if (toolResult.patch.recommendations) {
          recommendations = [...recommendations, ...toolResult.patch.recommendations]
        }
      }

      const formattedToolResult = formatToolResultForLlm(call.name, toolResult.result)
      const mandatoryFollowUp = detectMandatoryFollowUp(call.name, formattedToolResult)
      if (mandatoryFollowUp) {
        pendingFollowUps = [
          ...pendingFollowUps.filter((item) => item.id !== mandatoryFollowUp.id),
          mandatoryFollowUp,
        ]
      }
      pendingFollowUps = resolveMandatoryFollowUps(
        pendingFollowUps,
        call.name,
        toolResult.success,
        toolResult.result
      )

      messages.push({
        role: 'tool',
        toolCallId: call.id,
        content: formattedToolResult,
      })
    }
  }

  if (!assistantText.trim() && turnToolRecords.length > 0) {
    const synthesized = synthesizeAssistantSummaryFromTools(turnToolRecords)
    if (synthesized) {
      assistantText = synthesized
      yield { type: 'text_delta', content: synthesized }
    }
  }

  if (recommendations.length) {
    const optionsTag = formatOptionsTag(recommendations)
    assistantText += optionsTag
    yield { type: 'text_delta', content: optionsTag }
  }

  let patchId: string | undefined
  if (proposedPatch && params.workflowId) {
    if (persistLocally && conversationId) {
      patchId = await savePatch({
        conversationId,
        userId: params.userId,
        workflowId: params.workflowId,
        patch: proposedPatch,
      })
    }
    yield { type: 'patch_proposed', patch: proposedPatch, patchId: patchId ?? '' }
  } else if (proposedPatch) {
    yield {
      type: 'text_delta',
      content:
        '\n\n*(Workflow patch proposed — open a workflow in the editor to review and apply changes.)*',
    }
  }

  let messageId = ''
  if (persistLocally && conversationId) {
    messageId = await appendMessage({
      conversationId,
      role: 'assistant',
      content: {
        text: assistantText,
        patchId,
        recommendations: recommendations.length ? recommendations : undefined,
      },
    })
  }

  const costSummary = turnCost.summarize()

  logger.info('Arena Copilot turn complete', {
    conversationId: conversationId ?? null,
    messageId: messageId || null,
    patchId: patchId ?? null,
    workspaceId: params.workspaceId,
    workflowId: params.workflowId ?? null,
    historyTurns: historyMessages.length,
    assistantChars: assistantText.length,
    toolCallCount: turnToolRecords.length,
    toolNames: turnToolRecords.map((record) => record.name),
    hasPatch: Boolean(proposedPatch),
    turnCost: costSummary.total,
    writeChatLedger,
    durationMs: Date.now() - startedAt,
    memory: getLocalCopilotMemorySnapshot(),
  })

  if (writeChatLedger) {
    await recordLocalCopilotTurnUsage({
      userId: params.userId,
      workspaceId: params.workspaceId,
      workflowId: params.workflowId,
      chatId: params.chatId,
      runId: params.runId,
      conversationId: conversationId ?? undefined,
      messageId: turnMessageId,
      summary: costSummary,
      executionActor: { actorUserId: params.userId, actorType: 'user' },
      parentExecutionId: params.parentExecutionId,
      rootExecutionId: params.parentExecutionId,
      triggeringChatId: params.chatId,
      triggeringRunId: params.runId,
    })
  }

  yield {
    type: 'done',
    messageId: messageId || turnMessageId,
    ...(costSummary.total > 0
      ? {
          cost: {
            input: costSummary.input,
            output: costSummary.output,
            total: costSummary.total,
          },
        }
      : {}),
  }
}

export function formatSSE(event: LocalCopilotStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}
