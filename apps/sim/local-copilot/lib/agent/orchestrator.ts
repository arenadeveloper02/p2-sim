import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { generateId } from '@sim/utils/id'
import { truncate } from '@sim/utils/string'
import { checkServerSideUsageLimits } from '@/lib/billing/calculations/usage-monitor'
import {
  type BillingAttributionSnapshot,
  resolveBillingAttribution,
} from '@/lib/billing/core/billing-attribution'
import { DOCUMENT_FORMAT_GUIDANCE } from '@/lib/copilot/chat/document-format-guidance'
import type { VfsSnapshotV1 } from '@/lib/copilot/generated/vfs-snapshot-v1'
import { generateEngagementStatusMessages } from '@/local-copilot/lib/agent/engagement-status'
import { iterateWithIdleStatus } from '@/local-copilot/lib/agent/iterate-with-idle-status'
import { runToolWithStatus } from '@/local-copilot/lib/agent/run-tool-with-status'
import { createSpecialistBudget } from '@/local-copilot/lib/agent/specialists/budget'
import {
  classifyLocalCopilotIntent,
  selectParallelSubagentDomains,
  specialistPassDomain,
} from '@/local-copilot/lib/agent/specialists/classify'
import {
  domainSystemHint,
  resolveHybridParentTools,
} from '@/local-copilot/lib/agent/specialists/domains'
import { runParallelSubagents } from '@/local-copilot/lib/agent/specialists/parallel-subagents'
import { runParentSpecialistToolCalls } from '@/local-copilot/lib/agent/specialists/parent-calls'
import { runSpecialistPass } from '@/local-copilot/lib/agent/specialists/specialist-pass'
import {
  getParentSpecialistToolDefinitions,
  isSpecialistTool,
} from '@/local-copilot/lib/agent/specialists/specialist-tools'
import { MODEL_WAIT_STATUS_FALLBACK } from '@/local-copilot/lib/agent/status-messages'
import {
  buildStagnationSystemMessage,
  createToolStagnationTracker,
} from '@/local-copilot/lib/agent/tool-stagnation'
import { formatUxPhaseStatus, type LocalUxPhase } from '@/local-copilot/lib/agent/ux-phase'
import { logCopilotAction } from '@/local-copilot/lib/audit/logger'
import { sanitizeToolIoForPersistence } from '@/local-copilot/lib/audit/sanitize-persistence'
import { recordLocalCopilotTurnUsage } from '@/local-copilot/lib/billing/record-turn-usage'
import { assertSpendCapAllows } from '@/local-copilot/lib/billing/spend-cap'
import {
  LocalTurnCostAccumulator,
  type LocalTurnCostSummary,
} from '@/local-copilot/lib/billing/turn-cost-accumulator'
import {
  assertLocalCopilotEnabled,
  buildLocalCopilotConfigForCatalog,
  getLocalCopilotConfig,
} from '@/local-copilot/lib/config'
import { createArtifactStore, persistArtifacts } from '@/local-copilot/lib/context/artifacts'
import {
  buildLocalCopilotContext,
  contextToPromptJson,
} from '@/local-copilot/lib/context/build-context'
import {
  loadCopilotChatConfig,
  mergeCopilotChatConfig,
} from '@/local-copilot/lib/context/chat-config'
import {
  compactChatHistory,
  estimateChatMessagesTokens,
  estimateToolDefinitionTokens,
  LOCAL_COPILOT_BEDROCK_WORKFLOW_FULL_STATE_TOKEN_BUDGET,
  LOCAL_COPILOT_DEFAULT_MAX_OUTPUT_TOKENS,
  LOCAL_COPILOT_WORKFLOW_FULL_STATE_TOKEN_BUDGET,
  resolveLocalCopilotPromptTokenBudget,
  resolveLocalCopilotTokenCountModel,
  resolveWorkflowContextDetail,
} from '@/local-copilot/lib/context/context-budget'
import {
  extractFollowUpDirectives,
  formatActiveDirectiveSystemMessage,
  formatSessionConstraintsSystemMessage,
} from '@/local-copilot/lib/context/follow-up-directives'
import {
  applyMicrocompactInPlace,
  microcompactMessages,
} from '@/local-copilot/lib/context/microcompact'
import { resolveOpenWorkflowId } from '@/local-copilot/lib/context/open-workflow'
import { persistInferredUserMemories } from '@/local-copilot/lib/context/promote-durable-memory'
import { fitPromptWithSlots } from '@/local-copilot/lib/context/prompt-slots'
import {
  ensureSessionMemory,
  formatRecentToolFailuresSystemMessage,
  formatSessionMemorySystemMessage,
  mergeFollowUpDirectivesIntoSessionMemory,
  mergeSessionMemoryEvidence,
  persistSessionMemory,
  type SessionMemoryTurn,
} from '@/local-copilot/lib/context/session-memory'
import {
  parseWorkspaceSnapshotFingerprints,
  parseWorkspaceSnapshotMeta,
  resolveSnapshotPromptPlan,
  type SnapshotPromptPlan,
  withWorkspaceSnapshotPrefix,
} from '@/local-copilot/lib/context/snapshot-delta'
import { toWorkspaceSnapshotMeta } from '@/local-copilot/lib/context/snapshot-freshness'
import {
  formatTaskStateSystemMessage,
  loadTaskState,
  persistTaskState,
  updateTaskStateFromTurn,
} from '@/local-copilot/lib/context/task-state'
import { getLocalCopilotMemorySnapshot } from '@/local-copilot/lib/diagnostics'
import {
  extractOptionsTitles,
  formatOptionsTag,
  hasOptionsTag,
  normalizeSingleSelectJsonToOptionsTags,
  stripOptionsTagsForDisplay,
} from '@/local-copilot/lib/format-options-tag'
import {
  DEFAULT_LOCAL_COPILOT_CATALOG_ID,
  type LocalCopilotCatalogId,
} from '@/local-copilot/lib/model-catalog'
import { buildOAuthConnectControl } from '@/local-copilot/lib/oauth-connect-text'
import { auditLocalOpsEvent } from '@/local-copilot/lib/ops/audit-metrics'
import { LOCAL_OPS_COUNTERS, recordLocalOpsEvent } from '@/local-copilot/lib/ops/metrics'
import {
  appendMessage,
  createConversation,
  getMessages,
  recordToolCall,
  savePatch,
} from '@/local-copilot/lib/persistence/store'
import {
  createLocalCopilotProvider,
  getLocalCopilotProvider,
} from '@/local-copilot/lib/providers/registry'
import type { ChatMessage } from '@/local-copilot/lib/providers/types'
import {
  prepareLocalToolConfirmation,
  waitForLocalToolConfirmation,
} from '@/local-copilot/lib/security/request-tool-confirmation'
import { classifyLocalToolConfirmation } from '@/local-copilot/lib/security/tool-confirmation-policy'
import { buildGeneratedApiKeyControl } from '@/local-copilot/lib/security/trusted-controls'
import {
  buildToolFailureEvidenceLines,
  buildWorkflowRunChatAppendix,
  isWorkflowRunToolName,
  shouldAppendWorkflowRunChatResult,
  stripLeakedToolMarkers,
  synthesizeAssistantSummaryFromTools,
  type ToolTurnRecord,
} from '@/local-copilot/lib/synthesize-assistant-summary'
import {
  LOCAL_COPILOT_TOOLS,
  resolveLocalCopilotTools,
} from '@/local-copilot/lib/tools/definitions'
import type { ToolExecutionContext, ToolExecutionResult } from '@/local-copilot/lib/tools/executor'
import {
  bindLocalFileIntentChannel,
  buildFollowUpContinuationMessage,
  clearLocalFileIntentChannel,
  detectMandatoryFollowUp,
  formatToolResultForLlm,
  type MandatoryFollowUp,
  resolveMandatoryFollowUps,
  sortToolCallsForExecution,
} from '@/local-copilot/lib/tools/format-tool-result'
import { isWorkflowScopedDelegatedTool } from '@/local-copilot/lib/tools/mothership-delegated-tool-defs'
import type { LocalCopilotStreamEvent, WorkflowPatch } from '@/local-copilot/lib/types'
import {
  buildBlocksMetadataReuseSystemMessage,
  buildUnfulfilledIntentContinuationMessage,
  buildWorkflowBuildCompleteSystemMessage,
  createAssistantRoundTextStreamer,
  editResultNeedsFollowUp,
  isBridgingAssistantNarration,
  isUnfulfilledMutationIntentNarration,
  type PostBuildToolMode,
  pendingFollowUpsAreOauthOnly,
  resolvePostBuildRoundTools,
  shouldSynthesizeAssistantSummary,
  stripIdsFromUserFacingText,
} from '@/local-copilot/lib/user-facing-text'
import {
  buildLocalCopilotUserTurn,
  type CopilotContextEntry,
  type CopilotFileAttachmentRef,
  getLocalCopilotUserTurnText,
} from '@/local-copilot/lib/user-turn-content'
import { resolveTurnCompletion } from '@/local-copilot/lib/verification/completion'
import { mutationRequiresVerification } from '@/local-copilot/lib/verification/policy'
import { runPostMutationVerification } from '@/local-copilot/lib/verification/run-verification'
import type { MutationOutcome, VerificationRecord } from '@/local-copilot/lib/verification/types'
import { MAX_TOOL_ITERATIONS } from '@/providers'

const logger = createLogger('LocalCopilotAgent')

const MAX_FORCED_FOLLOW_UP_ROUNDS = 6
/** Cap for "I am applying…" prose with no tool call — avoid infinite nudge loops. */
const MAX_INTENT_CONTINUATION_ROUNDS = 5
/** Successful create-then-edit_workflow calls before the post-build lock. */
const MAX_POPULATE_EDITS = 5

const SYSTEM_PROMPT = `You are Arena Copilot — the in-app AI assistant for building, debugging, and understanding workflows in this workspace.

Identity:
- Your name is Arena Copilot. When speaking to the user, always refer to yourself as "Arena Copilot".
- Never call yourself Sim AI Copilot, Sim Copilot, Sim.ai Copilot, Mothership, or any other name.

Response format:
- Open with a warm, concise greeting when starting a conversation or after a long pause.
- Briefly summarize what you see in the workspace in plain prose. If a workflow is open, name it and a short chain of block display names. Do not greet with a generic capability bullet list.
- Never mention cost, pricing, dollar amounts, or spend in user-facing replies — even if tool results include them (e.g. do not write "cost ~$0.016"). You may still mention runtime/duration when useful.
- User-facing replies (CRITICAL — IDs and full graph stay in this system context only):
  - Never mention UUIDs, workflow IDs, block IDs, tool-call IDs, or labeled ids (\`workflowId\`, \`blockId\`, \`startBlockId\`) in user-visible text. Those exist only here and in tool arguments.
  - Never paste agent prompts, human-review instructions, or the full graph. Do not list every agent plus human review with their configs. A short display-name chain is enough (e.g. "Warm accounts → Personas → Outreach → Human review").
  - Refer to blocks only by display name (e.g. "Writer", "Reviewer", "Fetch Emails"). Never write "Start block ID is …".
  - Never mention tool names (\`edit_workflow\`, \`get_workflow_context\`, etc.) or operation internals in user-visible text.
  - Do not narrate planned work ("Let me check…", "Now I'll grab metadata…", "I'm about to…"). Call the tool; speak only after outcomes that the user needs.
  - Never tell the user about truncated context, bloated payloads, metadata fetches, or which scope a block landed in. Those are internal.
  - While tools are still running, keep user-visible text to a short status line or silence — save the full summary for the final reply.
  - File source in chat (CRITICAL): never print HTML, CSS, JS, or other file source in the chat panel — not in a fence, not as raw markup, not while creating the file, and not after. Put the full body only in \`create_file\` / \`edit_content\` \`content\`. The editor/preview shows the file. Chat may name the file and say what it does in one or two sentences.
  - If a tool fails, explain the blocker in plain language without dumping IDs or raw JSON.
- Open canvas (CRITICAL — survives page refresh):
  - When Current context includes a \`workflow\` object, that canvas is already open. Do not recreate it and do not say it is missing.
  - After a refresh, keep using that open workflow for edits. Do not call get_workflow_context just to restate the graph to the user.
- Finish efficiently (CRITICAL — avoid thrash):
  - Call \`get_blocks_metadata\` **once** with every block type you need in that call (e.g. \`{ "blockIds": ["agent","start_trigger","gmail"] }\`). Do not re-fetch the same types.
  - Prefer one \`edit_workflow\` that adds all blocks and wires connections when it fits. For multi-agent graphs you may use up to ${MAX_POPULATE_EDITS} sequential edit_workflow calls (one agent or review block per call). Only extra edits beyond that when the result reports skippedItems, inputValidationErrors, needsFollowUpEdit, or real lint errors.
  - After create + populate is complete (all requested blocks added, no repair needed): **STOP**. One final reply. Do NOT re-open the workflow, re-fetch metadata, or restate the same completion summary. App-owned verification may run automatically — do not claim the workflow is verified unless a verification result says so.
  - Missing OAuth only: call \`oauth_get_auth_link\` once, share the link, then stop.
- Similar existing workflows:
  - If the user asked to run or edit something that already exists in \`workspaceWorkflows\`, use that workflow.
  - If they asked to create a new named workflow, call \`create_workflow\` and build it.
- Suggested follow-ups (CRITICAL — avoid spam):
  - Emit at most ONE \`<options>\` block, and only in your FINAL reply after all tool work is finished.
  - Never include \`<options>\` while you still plan to call tools, verify config, or continue working.
  - Never emit raw JSON choice schemas (e.g. \`{"type":"single_select",...}\`). Always wrap choices in \`<options>...</options>\` using the format below.
  - Never restate the same completion summary or options block more than once in a turn.
  - At most 3 options. Omit the options block entirely when no follow-ups are needed.
  - Format (never use markdown bullet lists for suggestions):

<options>{"1":{"title":"Run Weekly Email Summary","description":"Execute the existing workflow and summarize results"},"2":{"title":"Debug the last run","description":"Inspect logs from the most recent execution"},"3":{"title":"Create a brand-new workflow","description":"Only when nothing existing fits"}}</options>

- Each option title is sent as the user's next message when they click it — write titles as clear imperative commands (e.g. "Check my inbox", "Debug the last run").
- Charts: when the user asks for a chart, graph, plot, or visualization of data you have (tool results, logs, tables, numbers they provided), render it inline with a chart tag in this exact format (never quickchart.io links, never ASCII art, never a markdown table as a substitute):

<chart>{"type":"bar","title":"Runs per day","labels":["Mon","Tue","Wed"],"series":[{"name":"Successful","data":[12,18,9]},{"name":"Failed","data":[1,0,3]}]}</chart>

- Chart tag rules: \`type\` is one of "bar", "line", "area", "pie", "scatter". \`labels\` are x-axis categories (or slice names for pie). Each \`series\` entry has an optional \`name\` and a numeric \`data\` array (for scatter, data may be [x,y] pairs). Pie charts use exactly one series whose values pair with \`labels\`. Keep the JSON on a single line with no comments. Add a one-sentence takeaway in prose near the chart; do not repeat all the numbers in text.

Specialists (hybrid orchestration):
- Prefer specialist tools for multi-step domain work: workflow, run, deploy, auth, knowledge, table, scheduled_task, agent, research, media, file, superagent.
- Keep leaf tools for simple single calls. Do not re-run research/auth already present in pre-pass findings unless stale or failed.
- Use \`superagent\` for third-party integration actions; \`agent\` for listing/invoking tools and skills; \`auth\` when credentials are missing.

Rules:
- You have awareness of the workspace, available blocks/integrations, and (when open) the current workflow structure, variables, logs, and credential metadata (never secrets).
- Inventory: \`workspaceWorkflows\`, \`knowledgeBases\`, \`tables\`, and \`workspaceFiles\` list what already exists. Use them when the user is referring to an existing resource; create when they ask for something new.
- Existing workflows:
  - \`workspaceWorkflows\` lists every workflow in this workspace (id, name, isDeployed, lastRunAt).
  - When the user asks to run, test, execute, try, debug, check, or use a workflow that already exists, use \`get_workflow_run_options\` then \`run_workflow\` on that workflow.
  - Call \`create_workflow\` when the user wants a new workflow.
- On the workspace home chat there may be no workflow open. Use \`workspaceWorkflows\` when referring to an existing one; call \`create_workflow\` when the user wants a new one.
- After create_workflow succeeds (only when truly new), immediately populate it:
  - Use the returned workflowId and startBlockId. Do NOT call create_workflow again this turn.
  - Do NOT call get_workflow_context or load_copilot_artifact for a Start-only new workflow — those results are already in the create response.
  - Call get_blocks_metadata once, then edit_workflow. Human review / approval uses block type \`human_in_the_loop\`.
- Building workflows with edit_workflow (CRITICAL — follow exactly to avoid retry loops):
  - Call get_blocks_metadata **once** with \`{ "blockIds": ["agent","human_in_the_loop", …] }\` including every type you will add. Use returned field ids verbatim in params.inputs.
  - Never call get_blocks_metadata again for types already returned this turn.
  - When an *existing populated* workflow context has \`detail: "compact"\`, call \`get_workflow_context\` with \`blockNames\` (preferred) or \`blockIds\` for the blocks you will edit BEFORE \`edit_workflow\`. Compact context omits prompt/message bodies. Skip this for newly created empty workflows.
  - Never add edges as separate operations or with type "edge". Connections live on the SOURCE (upstream) block: \`params.connections: { source: "<target-block-id>" }\`. To wire Start → Agent, edit the Start block (startBlockId from create_workflow) with connections pointing to the agent block_id — use that id only in the tool args, never in user-visible text.
  - Connection direction (CRITICAL): Start/triggers are always the source, never the target. Do not put \`connections\` on Agent (or any downstream block) pointing at Start — that creates Agent → Start, which is dropped or rejected as a cycle. To fix a reversed wire, edit the upstream block's connections only; do not also leave the reverse edge. Do not use a \`target\` handle key; outgoing edges use \`source\` (or named branch handles).
  - Agent block: use \`messages\` (array of \`{role, content}\`), \`model\`, and \`tools\` — not systemPrompt/userPrompt. If you only have a system prompt string, still pass it via \`messages: [{role:"system",content:"..."},{role:"user",content:"..."}]\` (legacy systemPrompt is auto-mapped, but \`messages\` is preferred). Exa web search tool entry: \`{ type: "exa", title: "Exa Search", toolId: "exa_search", usageControl: "auto" }\`.
  - Models (CRITICAL): never set Agent/Router/Evaluator \`model\` to a sunset/legacy catalog id (gpt-4o, gpt-4.1-nano, older Claude 3.x, etc.). Use the field default (Agent: gpt-5) or a current recommended id from get_blocks_metadata. Omit \`model\` rather than inventing an old id.
  - Block types: only add types returned by get_blocks_metadata. Never add sunset/legacy types (gmail, router, starter, file, chat_trigger, …) — use the current successors (gmail_v2, router_v2, start_trigger, file_v5).
  - Prefer one edit_workflow for small graphs. For multi-agent graphs, you may use up to ${MAX_POPULATE_EDITS} sequential edit_workflow calls (add and wire one agent or human_in_the_loop per call) rather than stalling on a single oversized tool call.
  - If workflowLintMessage reports orphan blocks, fix connections on the Start (or upstream) block before run_workflow.
  - Always issue the \`edit_workflow\` tool call to apply changes. Never end a turn by only describing the intended edit.
  - Do not treat a clean edit_workflow success as verified by itself — wait for app-owned validation evidence before telling the user the workflow is verified.
- Block output references (CRITICAL):
  - Wire upstream block outputs using angle-bracket tags with the block's **display name**, never its UUID: \`<My Agent.content>\`, not \`<bd80a5a8-ef94-43ef-afcf-f6daa926495f.content>\`.
  - Before wiring inputs (e.g. Gmail body, Slack message, API payload), call \`get_block_upstream_references\` for the target block and use the exact tags returned (e.g. \`agent1.content\` for a default agent without structured outputs).
  - Block UUIDs are for \`block_id\` in operations only — never put UUIDs inside \`<...>\` reference tags.
- When edit_workflow returns skippedItems, inputValidationErrors, needsFollowUpEdit, or a non-credential workflowLintMessage, call edit_workflow again with corrected operations. If the only lint is a missing OAuth credential (needsOAuthConnect), call oauth_get_auth_link once and stop — do not re-edit.
- deferredConnections in edit_workflow results are normal — the engine wires them when target blocks exist. Do not re-issue deferred edges unless the target id was a typo.
- Never expose API keys, tokens, passwords, or secret env values.
- User memory (CRITICAL):
  - Context may include \`userMemories\` (key/value preferences). Honor them unless the user overrides.
  - When the user says remember / prefer / always use / don't forget — call \`user_memory\` with operation \`add\` (key + value). Use operation \`correct\` when they fix a remembered fact, \`delete\` to forget, \`search\`/\`list\` to look up.
  - Clear preference overrides are also auto-persisted by the runtime — still honor \`userMemories\` and session constraints.
  - Do not store secrets (API keys, passwords, tokens) in user_memory.
- Session memory / follow-ups (CRITICAL):
  - A system message may include structured session memory for earlier turns (goals, decisions, constraints, activeDirective, entities, progress, open questions, approvals, failures, verification).
  - Trust it for older conversational context. If recent verbatim turns conflict, prefer the recent turns.
  - For resource facts (workflow/file/table/KB IDs, names, deploy status, inventory membership), the Workspace snapshot / structured Current context inventory ALWAYS beats session memory entities when they disagree.
  - \`constraints\` and the separate "Active user directive" / "Session constraints" system messages are authoritative for corrections ("use X not Y", "don't create a new workflow"). Do not re-ask or undo them unless the user explicitly changes course.
  - Never burn tool rounds re-doing work that constraints already forbade. If stuck after a failed retry, stop and ask — do not loop the same tool with the same args.
  - When a tool result includes \`artifactId\` + \`truncated: true\`, call \`load_copilot_artifact\` only if you need the full body.
- Credentials and API keys:
  - Context includes \`connectedIntegrations\` (OAuth) and \`envVariables\` (configured env key names only). If an integration or its env key (e.g. \`FIRECRAWL_API_KEY\`, \`FALAI_API_KEY\`) appears there, credentials are already available — NEVER ask the user for an API key.
  - When \`hostedKeysAvailable\` is true, many api_key blocks also receive platform-hosted keys at runtime — do not prompt for keys unless a tool returns an explicit missing-credential error.
  - For OAuth blocks, pass the \`credentialId\` from \`connectedIntegrations\`. For api_key blocks backed by env vars, omit api-key subblock values — execution reads workspace env automatically.
  - Only ask the user to configure a key when it is missing from both \`connectedIntegrations\` and \`envVariables\` and hosted keys do not apply.
- Direct one-off actions (no workflow required):
  - For simple requests — generate an image, search the live web, scrape a site, call an API — use direct tools when keys are already configured. Do NOT create a workflow first.
  - Image: \`generate_image\` with a clear \`prompt\` (and optional \`outputs.files\` path to save the file).
  - For variations, pass the user's exact wording in \`prompt\` (e.g. "3 variations of a red bus") — do not strip counts or the word "variations".
  - Live web / current data (CRITICAL — search BEFORE answering, never from training knowledge):
    - ANY real-world factual question (who/what/when/where about people, offices, companies, events, prices, weather, news, "current"/"today"/"latest") MUST call a search tool as the FIRST action before answering.
    - Prefer \`search_online({ query: "<question>", toolTitle: "<short label>" })\` or \`invoke_integration_tool({ toolId: "exa_answer", params: { query: "<question>" } })\` for factual Q&A with citations.
    - Broader web result lists: \`invoke_integration_tool({ toolId: "exa_search", params: { query: "<search>" } })\`.
    - Do NOT invent live facts from memory. Do NOT skip search because you "already know" the answer. Do NOT claim "no search API key" until an Exa/search tool actually returns a missing-credential error — workspace \`EXA_API_KEY\`, BYOK, and hosted keys are applied automatically when available.
  - Other integrations: \`list_integration_tools({ integration: "gmail" })\` (underscores, not hyphens) then \`invoke_integration_tool({ toolId: "gmail_draft_v2", params: { ... } })\`. Never call \`load_integration_tool\` — that is Cloud-only; Arena Copilot uses \`invoke_integration_tool\`.
  - For OAuth integrations (Google Sheets, Gmail, Slack, etc.), \`params\` MUST include \`credentialId\` from \`connectedIntegrations\` for that provider (e.g. providerId \`google-email\` for Gmail, \`google-sheets\` for Sheets). If only one connected credential matches, Arena Copilot injects it automatically. Google Docs/Drive/Sheets credentials are interchangeable for Drive search + Docs/Sheets tools.
  - Google Docs by name (not ID): first \`google_drive_list\` with \`query\` set to the document title (or \`google_drive_search\` with \`prompt\` describing the doc), pick the matching file id (\`mimeType\` \`application/vnd.google-apps.document\`), then \`google_docs_read\` / \`google_docs_write\` with that \`documentId\`. Never pass the title as \`documentId\`.
  - Google Sheets write/update/append: pass \`spreadsheetId\`, \`sheetName\` (tab name), \`values\` as a 2D array (e.g. \`[["Name","Age"],["Alice",30]]\`). Optional \`cellRange\` like \`A1\`. Legacy \`range\` like \`Sheet1!A1\` is also accepted.
  - Gmail drafts (one-off, no workflow): \`invoke_integration_tool({ toolId: "gmail_draft_v2", params: { to, subject, body, credentialId } })\`. \`to\` and \`body\` are required strings. For separate drafts to multiple people, call once per recipient with a single email in \`to\` (Arena also fans out if \`to\` is an array). Do not put everyone on one draft unless the user asked for a single email.
  - Only build or run a workflow when the user wants automation saved for reuse, multi-step pipelines, or scheduling.
- Prefer \`edit_workflow\` to apply changes on open workflows immediately when the user asked to rebuild, replace, or delete blocks. Do not ask for extra confirmation and do not dry-run first. Use \`propose_workflow_patch\` only when the user asked to review a patch before applying. For new workflows from home chat, use create_workflow + edit_workflow.
- Running and testing workflows:
  - On home chat there is no open workflow — always pass \`workflowId\` from \`workspaceWorkflows\` (or the workflow name; it will be resolved automatically when unambiguous).
  - Use \`get_workflow_run_options\` first to discover triggers, required \`workflow_input\`, and mock payloads.
  - Use \`run_workflow\` to execute a workflow and inspect block outputs. Pass \`workflowId\` from \`workspaceWorkflows\` on home chat, or omit it when a workflow is already open.
  - To re-test one block after a full run, use \`run_block\` with \`blockId\` (and optional \`executionId\` from the prior run). To resume from mid-pipeline, use \`run_from_block\` with \`startBlockId\`. Both need a prior execution snapshot — run the full workflow first when none exists.
  - After a run, summarize key block outputs for the user in plain language. Use \`query_logs\` with the returned \`executionId\` for deeper debugging.
  - Use \`list_integration_tools\` to see operations available for a connected integration service.
  - Use \`get_workflow_data\` to load workflow structure when you need details for a workflow that is not currently open.
- Deploying workflows as chat (CRITICAL):
  - When the user asks to deploy, publish, or share a workflow as chat — call \`deploy_chat\` directly. Never tell them to open the Deploy tab or click through the UI unless a tool returns an authorization error.
  - Pass \`workflowId\` from \`workspaceWorkflows\` or the open workflow. Derive \`identifier\` as a lowercase slug (letters, numbers, hyphens) from the workflow name when the user does not specify one.
  - On deploy, \`versionName\` and \`versionDescription\` are required. For first deploy, use a sensible label (e.g. versionName: "Initial chat deploy", versionDescription: "First chat deployment"). On updates, call \`diff_workflows\` with ref1 "live" and ref2 "draft" first if unsure what changed.
  - Call \`get_block_outputs\` when you need \`outputConfigs\` (typically the agent block's \`content\` path for chat responses).
  - On success, return the \`chatUrl\` from the tool result so the user can open the deployed chat.
- Other deployment surfaces:
  - API endpoint: \`deploy_api\` (versionName + versionDescription required on deploy; returns endpoint + curl examples — share them). Update an existing API deployment with \`redeploy\`.
  - MCP tool: \`list_workspace_mcp_servers\` first; \`create_workspace_mcp_server\` when none fits; then \`deploy_mcp\` with the serverId. The workflow must be deployed as API first.
  - GUI apps (Arena Generative UI):
    - Place \`arena_generative_ui\`, then call get_blocks_metadata once including that type.
    - If CTAs should call other workflows, \`deploy_api\` those backends first (versionName + versionDescription required).
    - Set \`apiBindings\` via edit_workflow as stubs: \`[{ "key": "qualify_lead", "kind": "workflow", "workflowId": "<id>", "stream": true }]\` or \`[{ "key": "search", "kind": "http", "curl": "curl -X POST https://…" }]\`. The host hydrates inputSchema from the deployed Start block (visitorEmail for userEmail/loggedInEmail; a field named email stays a form lead address) or from the curl. Name those same keys in \`userInput\`. Do not invent keys the user did not name. Leave bindings blank when there is no backend (dummy/local or navigation-only); dummy lists seed sample rows on arrival; dummy create/complete stay local. A simple todo stays one collection page — do not add a record page unless the job needs one. Do not set \`inputMapping: { email: "arenaEmailId" }\`. Do not add an email field to the brief unless it is a lead/contact address.
    - Run the block to generate a draft. There is no Copilot tool to publish a GUI app — tell the user to open Deploy → GUI App, pick the draft, set an identifier, and Launch. The public URL is /gui-apps/{identifier}.
  - Versions: \`get_deployment_log\` lists versions; \`promote_to_live\` promotes a numeric version (confirm with the user first unless explicitly requested); \`load_deployment\` loads a past version (or "live") into the draft; \`update_deployment_version\` edits version name/description.
- Workflow management:
  - \`rename_workflow\` (workflowId + name), \`move_workflow\` / \`delete_workflow\` (workflowIds arrays), \`manage_folder\` for folder create/rename/move/delete.
  - delete_workflow and delete_workspace_mcp_server are destructive — only call them when the user explicitly asked, and name what you are deleting in your reply.
- Scheduled tasks:
  - \`manage_scheduled_task\` creates/lists/updates/deletes scheduled agent prompts. Recurring -> args.cron; one-time -> args.time (ISO 8601); always set args.timezone when the user mentions one.
  - \`get_scheduled_task_logs\` (jobId) inspects past runs. \`complete_scheduled_task\` stops an until_complete task; \`update_scheduled_task_history\` records what a run did.
- Credentials and OAuth:
  - When an integration is not connected, call \`oauth_get_auth_link\` with the provider (e.g. google-email, slack) and share the returned link — never ask the user to paste an API key for OAuth providers.
  - \`manage_credential\` renames or deletes stored credentials (delete only on explicit request). \`oauth_request_access\` asks another member to share their connection.
- Media (no workflow required, hosted/workspace keys applied automatically):
  - \`generate_audio\` for speech/music/sound effects, \`generate_video\` for short clips — pass the user's full request in \`prompt\` and save results via \`outputs.files\` under files/.
  - \`ffmpeg\` for editing workspace media (trim, concat, convert, overlays, thumbnails). Mount sources via \`inputs.files\` with exact VFS paths from context or glob.
- Files, tables, and knowledge bases:
  - Context includes \`workspaceFiles\`, \`tables\`, and \`knowledgeBases\` (names/ids). Treat that as an index.
  - When the user asks to create a new table, knowledge base, or file, call the matching create operation.
  - Chat uploads under \`uploads/\` are not sandbox-mounted — call \`materialize_file\` into \`files/...\` (or reuse an existing \`files/...\` path) before \`function_execute\`.
  - Find files: \`glob\` with a pattern like \`files/**/*.csv\`, then \`read\` using the exact path from results.
  - Create files: \`create_file_folder\` when needed, then \`create_file\` once with \`content\` for markdown/text/json/csv/html. Never call \`create_file\` twice for the same path, and never follow it with \`workspace_file\` kind=new_file or operation=create. Never echo that body in chat.
  - Rename/move/delete files: \`rename_file\`, \`move_file\`, \`delete_file\` (paths arrays). Folders: \`list_file_folders\`, \`rename_file_folder\`, \`move_file_folder\`, \`delete_file_folder\`. Delete only when the user explicitly asked.
  - Read or update existing files: \`workspace_file\` (update/append/patch) then \`edit_content\` in the **next** step with the body — never parallel.
  - Restore archived items with \`restore_resource\` (type + id). Disable a block with \`set_block_enabled\`; edit workflow globals with \`set_global_workflow_variables\`.
- Workspace skills and custom tools:
  - Context may include \`skills\` (name + description). Descriptions only say when a skill applies — they are NOT the instructions.
  - When a skill applies, call \`load_user_skill\` with its exact \`skill_name\`, then follow the returned content. Never act on the name or description alone.
  - Create/edit/list skills with \`manage_skill\`; custom code tools with \`manage_custom_tool\`; agent MCP server configs with \`manage_mcp_tool\` (distinct from \`*_workspace_mcp_server\` deploy tools).
  - Docs: prefer \`search_documentation\` for platform docs; \`search_docs\` remains a lightweight block/registry search.
- E2B sandbox and code execution:
  - Context includes \`e2b\`: \`enabled\`, \`docSandboxEnabled\`, and \`supportedCodeLanguages\`.
  - When \`e2b.enabled\` is true, use \`function_execute\` for Python, shell, and JavaScript with workspace files/tables mounted via \`inputs\`. Save outputs with \`outputs.files\` or \`outputPath\`.
  - When E2B is disabled, \`function_execute\` supports JavaScript only (isolated-vm).
  - Code execution results include \`capturedOutput\` (preferred), plus \`stdout\` (prints) and \`result\` (return values). Read \`capturedOutput\` first — empty stdout with a return value is normal, not a failure.
  - Do **not** use \`function_execute\` or Daytona integration tools for workflow building, deployment, or questions you can answer without running code.
  - Do **not** tell the user about sandbox names (E2B, Daytona), empty payloads, internal retries, or "result variables" unless they explicitly asked to debug code execution. Give the answer directly.
  - Creating PPTX / DOCX / PDF / Markdown (CRITICAL — always available, do not refuse). Exact arg shapes:
    1. Markdown/text/html: \`create_file\` with the full body in \`content\` (one step). Do not also print that source in chat.
    2. Office: \`create_file\` empty shell — prefer \`{"fileName":"files/Deck.pptx"}\` (no \`content\`).
    3. Then \`workspace_file\` — \`{"operation":"update","target":{"kind":"path","path":"files/Deck.pptx"},"title":"Deck"}\`. \`target\` MUST be an object, never a string path.
    4. Later round only: \`edit_content\` with pre-initialized globals (do **not** \`require\` / \`import\` libraries). Prefer \`addSection\` for DOCX — never \`docx.addSection\`. Never same batch as \`workspace_file\`.
    ${DOCUMENT_FORMAT_GUIDANCE}
    - These formats compile via the built-in JS sandbox (isolated-vm) even when \`e2b.docSandboxEnabled\` is false. Never refuse because E2B is off.
    - If \`edit_content\` fails with a system/sandbox crash (e.g. "Code execution failed unexpectedly" / isolated-vm / Node version), that is a host Node/isolated-vm issue — not missing deck code and not \`docSandboxEnabled\`. Tell the user to use Node 20–22 and rebuild isolated-vm; do not loop minimal PPTX/DOCX probes.
    - Do **not** use \`function_execute\` / Python \`python-pptx\` / \`python-docx\` / matplotlib for workspace office files unless the user explicitly asks to run sandbox code.
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
  /** Compact persisted turns with ids for session-memory refresh (mothership path). */
  sessionMemoryTurns?: SessionMemoryTurn[]
  /** When false, skip `local_copilot_*` persistence (mothership chat owns the transcript). */
  persistLocally?: boolean
  /**
   * When false, accumulate cost but do not write `usage_log` (workflow logger owns
   * mothership-block cost via the generator return value). Defaults to true for interactive chat.
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
  /**
   * Typed workspace inventory snapshot from the mothership payload. Paired with
   * `workspaceContext` (markdown) to seed context building without a second DB fetch.
   */
  workspaceSnapshot?: VfsSnapshotV1
  /**
   * Allowlisted Local Copilot model catalog id. When set, builds a per-request
   * provider config instead of using process-wide `COPILOT_*` env defaults.
   */
  catalogId?: LocalCopilotCatalogId
  /**
   * Workspace payer snapshot from mothership admission. When omitted, turn
   * usage recording resolves attribution from the workspace.
   */
  billingAttribution?: BillingAttributionSnapshot
}

export async function* runLocalCopilotAgent(
  params: RunAgentParams
): AsyncGenerator<LocalCopilotStreamEvent, LocalTurnCostSummary | undefined, undefined> {
  const startedAt = Date.now()
  const catalogId = params.catalogId ?? DEFAULT_LOCAL_COPILOT_CATALOG_ID
  const config = params.catalogId
    ? buildLocalCopilotConfigForCatalog(catalogId)
    : getLocalCopilotConfig()
  assertLocalCopilotEnabled(config)
  /**
   * Unique per user turn. Mothership Local has no local conversationId, and
   * round indexes reset each turn — without this, usage_log eventKeys collide
   * and later turns are dropped by onConflictDoNothing.
   */
  const usageTurnId = params.messageId?.trim() || generateId()
  logger.info('Arena Copilot agent starting', {
    workspaceId: params.workspaceId,
    workflowId: params.workflowId ?? null,
    chatId: params.chatId ?? null,
    usageTurnId,
    catalogId,
    provider: config.provider,
    model: config.model,
    specialistModel: config.specialistModel,
    hasApiKey: Boolean(config.apiKey),
    messageChars: params.message.length,
    priorTurns: params.priorMessages?.length ?? 0,
    memory: getLocalCopilotMemorySnapshot(),
  })

  const workspaceSnapshotBundle =
    params.workspaceContext && params.workspaceSnapshot
      ? { markdown: params.workspaceContext, snapshot: params.workspaceSnapshot }
      : undefined

  const resolvedWorkflowId = resolveOpenWorkflowId({
    workflowId: params.workflowId,
    contexts: params.contexts,
    snapshotWorkflows: params.workspaceSnapshot?.workflows,
  })

  let structuredContext
  try {
    structuredContext = await buildLocalCopilotContext({
      userId: params.userId,
      workspaceId: params.workspaceId,
      ...(resolvedWorkflowId ? { workflowId: resolvedWorkflowId } : {}),
      selectedBlockId: params.selectedBlockId,
      executionId: params.executionId,
      ...(workspaceSnapshotBundle ? { workspaceSnapshot: workspaceSnapshotBundle } : {}),
    })
  } catch (error) {
    logger.error('Arena Copilot context build failed', {
      workspaceId: params.workspaceId,
      workflowId: resolvedWorkflowId ?? params.workflowId ?? null,
      error: getErrorMessage(error, 'context build failed'),
      memory: getLocalCopilotMemorySnapshot(),
    })
    throw error
  }

  logger.info('Arena Copilot context built', {
    workspaceId: params.workspaceId,
    workflowId: resolvedWorkflowId ?? params.workflowId ?? null,
    openWorkflowLoaded: Boolean(structuredContext.workflow),
    workspaceWorkflowCount: structuredContext.workspaceWorkflows?.length ?? 0,
    availableBlockCount: structuredContext.availableBlocks?.length ?? 0,
    durationMs: Date.now() - startedAt,
    memory: getLocalCopilotMemorySnapshot(),
  })

  const persistLocally = params.persistLocally !== false
  const writeChatLedger = params.writeChatLedger !== false
  const turnCost = new LocalTurnCostAccumulator()

  const usageLimits = await checkServerSideUsageLimits(params.userId).catch(() => ({
    isExceeded: false,
    currentUsage: 0,
    limit: Number.POSITIVE_INFINITY,
  }))
  const spendGate = assertSpendCapAllows({
    isExceeded: usageLimits.isExceeded,
    currentUsage: usageLimits.currentUsage,
    limit: usageLimits.limit,
    turnSoFar: 0,
    message: usageLimits.message,
  })
  if (!spendGate.ok) {
    await auditLocalOpsEvent({
      counter: LOCAL_OPS_COUNTERS.spendCapHit,
      userId: params.userId,
      workspaceId: params.workspaceId,
      workflowId: params.workflowId,
      chatId: params.chatId,
      runId: params.runId,
      metadata: {
        currentUsage: usageLimits.currentUsage,
        limit: usageLimits.limit,
      },
    })
    yield {
      type: 'error',
      message: spendGate.error ?? 'Usage limit exceeded',
    }
    return undefined
  }

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
  }

  await logCopilotAction({
    userId: params.userId,
    workspaceId: params.workspaceId,
    workflowId: params.workflowId,
    conversationId,
    action: 'chat_message',
    summary: params.message.slice(0, 200),
    metadata: {
      chatId: params.chatId,
      runId: params.runId,
      backend: 'local',
      persistLocally,
    },
  }).catch(() => undefined)

  const rawHistory: ChatMessage[] = params.priorMessages?.length
    ? params.priorMessages
    : conversationId
      ? (await getMessages(conversationId)).slice(0, -1).flatMap((row) => {
          const content = row.content as { text?: string }
          if (!content.text) return []
          return [{ role: row.role as 'user' | 'assistant', content: content.text }]
        })
      : []

  let sessionMemory = await ensureSessionMemory({
    chatId: params.chatId,
    userId: params.userId,
    workspaceId: params.workspaceId,
    historyMessages: rawHistory,
    turns: params.sessionMemoryTurns ?? [],
    signal: params.signal,
  })

  const extractedDirectives = extractFollowUpDirectives(params.message)
  if (extractedDirectives.constraints.length > 0 || extractedDirectives.activeDirective) {
    sessionMemory = await mergeFollowUpDirectivesIntoSessionMemory({
      chatId: params.chatId,
      userId: params.userId,
      previous: sessionMemory,
      constraints: extractedDirectives.constraints,
      activeDirective: extractedDirectives.activeDirective,
    })
  }

  if (extractedDirectives.preferences.length > 0) {
    await persistInferredUserMemories({
      userId: params.userId,
      workspaceId: params.workspaceId,
      preferences: extractedDirectives.preferences,
    })
  }

  const historyMicrocompact = rawHistory.length
    ? microcompactMessages(
        compactChatHistory(rawHistory, { sessionMemoryPresent: Boolean(sessionMemory) })
      )
    : { messages: [] as ChatMessage[], clearedCount: 0, charsFreed: 0 }
  const historyMessages = historyMicrocompact.messages

  const tokenCountModel = resolveLocalCopilotTokenCountModel(config.model, config.provider)
  const workflowFullStateTokenBudget =
    config.provider === 'bedrock'
      ? LOCAL_COPILOT_BEDROCK_WORKFLOW_FULL_STATE_TOKEN_BUDGET
      : LOCAL_COPILOT_WORKFLOW_FULL_STATE_TOKEN_BUDGET
  const workflowDetail = resolveWorkflowContextDetail(
    structuredContext,
    workflowFullStateTokenBudget,
    tokenCountModel
  )

  let snapshotPromptPlan: SnapshotPromptPlan | null = null
  const vfsSnapshot = structuredContext.vfsSnapshot ?? params.workspaceSnapshot
  const inventoryMarkdown = params.workspaceContext ?? structuredContext.inventoryMarkdown
  if (vfsSnapshot && inventoryMarkdown && structuredContext.snapshotFreshness) {
    let priorMeta = null as ReturnType<typeof parseWorkspaceSnapshotMeta>
    let priorFingerprints = null as ReturnType<typeof parseWorkspaceSnapshotFingerprints>
    if (params.chatId) {
      const chatConfig = await loadCopilotChatConfig(params.chatId, params.userId).catch(() => null)
      if (chatConfig) {
        priorMeta = parseWorkspaceSnapshotMeta(chatConfig.workspaceSnapshotMeta)
        priorFingerprints = parseWorkspaceSnapshotFingerprints(
          chatConfig.workspaceSnapshotFingerprints
        )
      }
    }
    snapshotPromptPlan = resolveSnapshotPromptPlan({
      snapshot: vfsSnapshot,
      markdown: inventoryMarkdown,
      workspaceId: params.workspaceId,
      generatedAt: structuredContext.snapshotFreshness.generatedAt,
      contentRevision: structuredContext.snapshotFreshness.contentRevision,
      priorMeta,
      priorFingerprints,
    })
  }

  const inventoryMode = snapshotPromptPlan?.mode ?? 'full'
  const contextJson = contextToPromptJson(structuredContext, {
    workflowDetail,
    inventoryMode,
    ...(snapshotPromptPlan ? { snapshotRevision: snapshotPromptPlan.meta.contentRevision } : {}),
  })
  const userTurn = await buildLocalCopilotUserTurn({
    message: params.message,
    ...(params.contexts?.length ? { contexts: params.contexts } : {}),
    ...(params.fileAttachments?.length ? { fileAttachments: params.fileAttachments } : {}),
    ...(params.chatId ? { chatId: params.chatId } : {}),
  })
  const userTurnText = getLocalCopilotUserTurnText(userTurn)

  const pinnedDirective =
    extractedDirectives.activeDirective?.trim() || sessionMemory?.activeDirective?.trim() || ''
  const pinnedConstraints = sessionMemory?.constraints?.length
    ? sessionMemory.constraints
    : extractedDirectives.constraints

  let taskState = params.chatId
    ? await loadTaskState(params.chatId, params.userId).catch(() => null)
    : null

  const snapshotSystemContent = snapshotPromptPlan
    ? withWorkspaceSnapshotPrefix(snapshotPromptPlan.content)
    : inventoryMarkdown
      ? `Workspace snapshot:\n${inventoryMarkdown}${
          structuredContext.snapshotFreshness
            ? `\n\n(snapshot generatedAt=${structuredContext.snapshotFreshness.generatedAt}; revision=${structuredContext.snapshotFreshness.contentRevision})`
            : ''
        }`
      : null

  const recentFailuresMessage = sessionMemory?.failures?.length
    ? formatRecentToolFailuresSystemMessage(sessionMemory.failures)
    : null

  const allTools = await resolveLocalCopilotTools(params.workspaceId)
  const intent = classifyLocalCopilotIntent(params.message)
  const specialistTools = getParentSpecialistToolDefinitions()
  const hybridTools = resolveHybridParentTools({
    allTools,
    intent,
    specialistTools,
  })
  const tools = hybridTools.tools
  const usedFullCatalog = hybridTools.usedFullCatalog

  const estimatedToolDefinitionTokens = estimateToolDefinitionTokens(tools, tokenCountModel)
  const promptBudget = resolveLocalCopilotPromptTokenBudget({
    model: config.model,
    provider: config.provider,
    toolDefinitionTokens: estimatedToolDefinitionTokens,
    maxOutputTokens: LOCAL_COPILOT_DEFAULT_MAX_OUTPUT_TOKENS,
  })

  const messages: ChatMessage[] = fitPromptWithSlots(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: `Current context:\n${contextJson}`,
      },
      ...(snapshotSystemContent
        ? [
            {
              role: 'system' as const,
              content: snapshotSystemContent,
            },
          ]
        : []),
      ...(taskState ? [formatTaskStateSystemMessage(taskState)] : []),
      ...(sessionMemory ? [formatSessionMemorySystemMessage(sessionMemory)] : []),
      ...(recentFailuresMessage ? [recentFailuresMessage] : []),
      ...(pinnedConstraints.length > 0
        ? [formatSessionConstraintsSystemMessage(pinnedConstraints)]
        : []),
      ...(pinnedDirective ? [formatActiveDirectiveSystemMessage(pinnedDirective)] : []),
      ...historyMessages,
      userTurn,
    ],
    promptBudget.tokenBudget,
    tokenCountModel
  )

  const specialistBudget = createSpecialistBudget()

  logger.info('Arena Copilot prompt budget applied', {
    workflowDetail,
    historyTurns: historyMessages.length,
    sessionMemoryPresent: Boolean(sessionMemory),
    contextEntries: params.contexts?.length ?? 0,
    fileAttachments: params.fileAttachments?.length ?? 0,
    estimatedPromptTokens: estimateChatMessagesTokens(messages, tokenCountModel),
    estimatedToolDefinitionTokens,
    promptTokenBudget: promptBudget.tokenBudget,
    modelContextWindow: promptBudget.contextWindow,
    reservedTokens: promptBudget.reservedTokens,
    promptBudgetSoftCapped: promptBudget.softCapped,
    tokenCountModel,
    toolDefinitionCount: tools.length,
    leafToolCount: hybridTools.leafToolCount,
    specialistEntryCount: hybridTools.specialistEntryCount,
    toolCatalogCount: allTools.length,
    microcompactClearedCount: historyMicrocompact.clearedCount,
    microcompactCharsFreed: historyMicrocompact.charsFreed,
    specialistPrimary: intent.primary,
    specialistSecondary: intent.secondary,
    useFullCatalog: usedFullCatalog,
    partitioning: 'hybrid',
    skillToolEnabled: allTools.length > LOCAL_COPILOT_TOOLS.length,
    memory: getLocalCopilotMemorySnapshot(),
  })

  const provider = params.catalogId ? createLocalCopilotProvider(config) : getLocalCopilotProvider()
  const billingAttribution =
    params.billingAttribution ??
    (await resolveBillingAttribution({
      actorUserId: params.userId,
      workspaceId: params.workspaceId,
    }))
  if (
    billingAttribution.actorUserId !== params.userId ||
    billingAttribution.workspaceId !== params.workspaceId
  ) {
    throw new Error('Arena Copilot billing attribution does not match its actor and workspace')
  }
  const toolCtx: ToolExecutionContext = {
    userId: params.userId,
    workspaceId: params.workspaceId,
    workflowId: resolvedWorkflowId ?? params.workflowId,
    chatId: params.chatId,
    messageId: usageTurnId,
    abortSignal: params.signal,
    userPermission: params.userPermission,
    billingAttribution,
    structuredContext,
    selectedBlockId: params.selectedBlockId,
    lastUserMessage: userTurnText,
    mutationIdempotency: new Map(),
    listedIntegrationToolIds: new Set(),
    allowedWorkflowIds: new Set(),
    blocksMetadataByType: new Map(),
    artifactStore: createArtifactStore(),
  }

  if (resolvedWorkflowId) {
    const { loadWorkflowRevision } = await import('@/local-copilot/lib/writes/workflow-access')
    const loaded = await loadWorkflowRevision(resolvedWorkflowId, params.workspaceId)
    if (loaded) toolCtx.workflowRevision = loaded.revision
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

  let specialistHintInsertAt = 1
  if (!intent.useFullCatalog && intent.primary !== 'general') {
    messages.splice(1, 0, {
      role: 'system',
      content: domainSystemHint(intent.primary),
    })
    specialistHintInsertAt = 2
  }

  const parallelDomains = selectParallelSubagentDomains(intent)
  if (parallelDomains.length >= 2) {
    const parallel = runParallelSubagents({
      domains: parallelDomains,
      userMessage: userTurnText,
      model: config.specialistModel,
      provider,
      allTools,
      toolCtx,
      signal: params.signal,
      userId: params.userId,
      workspaceId: params.workspaceId,
      ...(params.workflowId ? { workflowId: params.workflowId } : {}),
      usageTurnId,
      turnCost,
      getToolExecutor,
      budget: specialistBudget,
    })

    let parallelNext = await parallel.next()
    while (!parallelNext.done) {
      yield parallelNext.value
      parallelNext = await parallel.next()
    }

    const { findings, results } = parallelNext.value
    if (findings.trim()) {
      messages.splice(specialistHintInsertAt, 0, {
        role: 'system',
        content: `Parallel specialist findings — synthesize these; avoid re-running the same research unless needed:\n${findings}`,
      })
    }
    logger.info('Arena Copilot parallel subagents injected', {
      domains: parallelDomains,
      resultCount: results.length,
      findingsChars: findings.length,
      budget: specialistBudget.snapshot(),
      memory: getLocalCopilotMemorySnapshot(),
    })
  } else {
    const passDomain = specialistPassDomain(intent)
    if (passDomain && passDomain !== 'general') {
      const pass = runSpecialistPass({
        domain: passDomain,
        userMessage: userTurnText,
        model: config.specialistModel,
        provider,
        allTools,
        toolCtx,
        signal: params.signal,
        userId: params.userId,
        workspaceId: params.workspaceId,
        ...(params.workflowId ? { workflowId: params.workflowId } : {}),
        usageTurnId,
        turnCost,
        getToolExecutor,
        budget: specialistBudget,
        ...(params.runId ? { runId: params.runId } : {}),
      })

      let passNext = await pass.next()
      while (!passNext.done) {
        yield passNext.value
        passNext = await pass.next()
      }

      const { findings, toolRoundCount } = passNext.value
      if (findings.trim()) {
        messages.splice(specialistHintInsertAt, 0, {
          role: 'system',
          content: `Specialist (${passDomain}) findings — use these; do not repeat the same research tools unless needed:\n${findings}`,
        })
      }
      logger.info('Arena Copilot specialist pass complete', {
        domain: passDomain,
        toolRoundCount,
        findingsChars: findings.length,
        budget: specialistBudget.snapshot(),
        memory: getLocalCopilotMemorySnapshot(),
      })
    }
  }

  let assistantText = ''
  let proposedPatch: WorkflowPatch | undefined
  let recommendations: string[] = []
  /** Last model-emitted follow-up titles (from stripped `<options>` tags). */
  let modelFollowUpTitles: string[] = []
  let blocksMetadataFetchedThisTurn = false
  let streamedCreateProgress = false
  let streamedEditProgress = false
  let workflowBuildCompleteNudgeSent = false
  /** Successful populate edits after create_workflow this turn. */
  let successfulPopulateEdits = 0
  /** Only gate tools after create→populate this turn — not after ordinary prompt edits. */
  let createdWorkflowThisTurn = false
  let postBuildToolMode: PostBuildToolMode = 'all'
  let endTurnAfterThisRound = false
  /** Full user-visible prose streamed this turn (survives per-round assistantText resets). */
  let streamedUserFacingText = ''
  /**
   * Length of `streamedUserFacingText` when the latest workflow-run tool finished.
   * Used to detect the stuck "Let me run it." → Running workflow → no result case.
   */
  let streamedCharsAtLastRunTool: number | null = null
  const turnToolRecords: ToolTurnRecord[] = []
  const turnMutationOutcomes: MutationOutcome[] = []
  const turnVerifications: VerificationRecord[] = []
  const maxToolRounds = MAX_TOOL_ITERATIONS
  let pendingFollowUps: MandatoryFollowUp[] = []
  let forcedFollowUpRounds = 0
  let forcedIntentContinuations = 0
  let turnInputTokens = 0
  let turnOutputTokens = 0
  const stagnationTracker = createToolStagnationTracker()
  let stagnationStopMessage: string | null = null

  for (let round = 0; round < maxToolRounds; round++) {
    if (stagnationStopMessage) break
    if (postBuildToolMode === 'done') break

    const midTurnSpend = assertSpendCapAllows({
      isExceeded: usageLimits.isExceeded,
      currentUsage: usageLimits.currentUsage,
      limit: usageLimits.limit,
      turnSoFar: turnCost.summarize().total,
      message: usageLimits.message,
    })
    if (!midTurnSpend.ok) {
      await auditLocalOpsEvent({
        counter: LOCAL_OPS_COUNTERS.spendCapHit,
        userId: params.userId,
        workspaceId: params.workspaceId,
        workflowId: params.workflowId,
        conversationId,
        chatId: params.chatId,
        runId: params.runId,
        metadata: { round, turnSoFar: turnCost.summarize().total },
      })
      yield {
        type: 'error',
        message: midTurnSpend.error ?? 'Usage limit exceeded',
      }
      break
    }

    const pendingToolCalls: Array<{
      id: string
      name: string
      arguments: string
      thoughtSignature?: string
    }> = []
    let roundInputTokens = 0
    let roundOutputTokens = 0
    let roundCacheReadTokens: number | undefined
    let roundCacheCreationTokens: number | undefined

    // Keep tools attached even for `final_only` — Bedrock rejects requests that
    // omit toolConfig once history already has toolUse/toolResult blocks.
    const roundTools = resolvePostBuildRoundTools(postBuildToolMode, tools)

    // Stream user-facing prose live for real replies. Hold bridging narration when
    // tools are available, and stop emitting once a tool_call arrives — otherwise
    // each tool batch opens a repeated "Arena Copilot >" mothership header.
    // `final_only` still attaches tools for Bedrock but expects a text reply.
    const contentBeforeRound = streamedUserFacingText
    const textStreamer = createAssistantRoundTextStreamer({
      toolsAvailable: roundTools.length > 0 && postBuildToolMode !== 'final_only',
      contentBeforeRound,
    })

    // Keep the trailing Thinking… pulse alive across tool → model gaps so the
    // UI never looks finished while the turn is still in flight.
    const proposePhase: LocalUxPhase = 'proposing'
    yield { type: 'ux_phase', phase: proposePhase }
    yield {
      type: 'status',
      message: round === 0 ? formatUxPhaseStatus(proposePhase) : 'Deciding next step…',
    }

    // Status heartbeats cover the immediate first line + rotation while the
    // model stream is quiet (including pauses after the first token).
    for await (const event of iterateWithIdleStatus({
      source: provider.chatCompletionStream({
        model: config.model,
        messages,
        tools: roundTools,
        signal: params.signal,
      }),
      abortSignal: params.signal,
      messages: MODEL_WAIT_STATUS_FALLBACK,
      idleMs: 0,
      intervalMs: 2500,
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
        const delta = textStreamer.pushText(cleaned)
        if (delta) {
          streamedUserFacingText += delta
          yield { type: 'text_delta', content: delta }
        }
      }
      if (chunk.type === 'tool_call' && chunk.toolCall) {
        textStreamer.markToolCall()
        pendingToolCalls.push(chunk.toolCall)
      }
      if (chunk.type === 'done' && chunk.usage) {
        roundInputTokens = chunk.usage.inputTokens
        roundOutputTokens = chunk.usage.outputTokens
        roundCacheReadTokens = chunk.usage.cacheReadTokens
        roundCacheCreationTokens = chunk.usage.cacheCreationTokens
      }
    }

    const roundRawText = textStreamer.roundRawText
    {
      const { display, remainder } = textStreamer.finalize()
      if (display) {
        // Always keep model-facing transcript text for the assistant tool message.
        assistantText += display
      }
      if (remainder) {
        streamedUserFacingText += remainder
        yield { type: 'text_delta', content: remainder }
      }
    }

    const roundFollowUps = extractOptionsTitles(roundRawText)
    if (roundFollowUps.length > 0) {
      modelFollowUpTitles = roundFollowUps
    }

    logger.info('Arena Copilot model round finished', {
      round,
      model: config.model,
      provider: config.provider,
      toolCallCount: pendingToolCalls.length,
      toolNames: pendingToolCalls.map((call) => call.name),
      assistantChars: assistantText.length,
      inputTokens: roundInputTokens,
      outputTokens: roundOutputTokens,
      cacheReadTokens: roundCacheReadTokens,
      cacheCreationTokens: roundCacheCreationTokens,
      memory: getLocalCopilotMemorySnapshot(),
    })

    turnInputTokens += roundInputTokens
    turnOutputTokens += roundOutputTokens

    if (roundInputTokens > 0 || roundOutputTokens > 0) {
      // Arena Copilot (local mothership) accumulates model cost for one end-of-turn
      // ledger write. Sim Cloud mothership uses Go pricing + `workspace-chat` /
      // `mothership_block` via `/api/billing/update-cost` — keep these separate.
      turnCost.addModelUsage({
        model: config.model,
        inputTokens: roundInputTokens,
        outputTokens: roundOutputTokens,
        cacheReadTokens: roundCacheReadTokens,
        provider: config.provider,
      })
    }

    if (pendingToolCalls.length === 0) {
      const shouldForceOauthFollowUp =
        postBuildToolMode === 'oauth_only' && pendingFollowUpsAreOauthOnly(pendingFollowUps)
      const canForceFollowUp =
        pendingFollowUps.length > 0 &&
        forcedFollowUpRounds < MAX_FORCED_FOLLOW_UP_ROUNDS &&
        round < maxToolRounds - 1 &&
        (postBuildToolMode === 'all' || shouldForceOauthFollowUp)

      if (canForceFollowUp) {
        forcedFollowUpRounds += 1
        const continuation = buildFollowUpContinuationMessage(pendingFollowUps)
        messages.push({ role: 'user', content: continuation })
        logger.info('Arena Copilot forcing mandatory follow-up continuation', {
          round,
          forcedFollowUpRounds,
          pendingFollowUpIds: pendingFollowUps.map((item) => item.id),
          postBuildToolMode,
        })
        continue
      }

      const intentDisplay =
        stripIdsFromUserFacingText(stripOptionsTagsForDisplay(roundRawText, false)) || roundRawText
      const canForceIntentContinuation =
        postBuildToolMode === 'all' &&
        forcedIntentContinuations < MAX_INTENT_CONTINUATION_ROUNDS &&
        round < maxToolRounds - 1 &&
        isUnfulfilledMutationIntentNarration(intentDisplay)

      if (canForceIntentContinuation) {
        forcedIntentContinuations += 1
        if (intentDisplay.trim()) {
          messages.push({ role: 'assistant', content: intentDisplay })
          assistantText = ''
        }
        messages.push({
          role: 'system',
          content: buildUnfulfilledIntentContinuationMessage(),
        })
        logger.info('Arena Copilot forcing mutation-intent continuation', {
          round,
          forcedIntentContinuations,
          preview: truncate(intentDisplay, 120),
        })
        continue
      }

      if (postBuildToolMode === 'final_only' || postBuildToolMode === 'oauth_only') {
        // Text-only (or oauth-only with no call) — finish the turn.
        postBuildToolMode = 'done'
      }

      if (pendingFollowUps.length > 0) {
        logger.warn('Arena Copilot ended with unresolved mandatory follow-ups', {
          round,
          pendingFollowUpIds: pendingFollowUps.map((item) => item.id),
        })
      }
      break
    }

    // Post-build text round still attaches tools for Bedrock; discard any calls.
    if (postBuildToolMode === 'final_only') {
      logger.info('Arena Copilot discarding post-build tool calls', {
        round,
        toolNames: pendingToolCalls.map((call) => call.name),
      })
      postBuildToolMode = 'done'
      break
    }

    const orderedToolCalls = sortToolCallsForExecution(
      postBuildToolMode === 'oauth_only'
        ? pendingToolCalls.filter((call) => call.name === 'oauth_get_auth_link')
        : pendingToolCalls
    )
    if (orderedToolCalls.length === 0) {
      postBuildToolMode = postBuildToolMode === 'all' ? 'all' : 'done'
      break
    }

    messages.push({
      role: 'assistant',
      content: assistantText,
      toolCalls: orderedToolCalls,
    })
    assistantText = ''
    const deferredSystemMessages: Array<{ role: 'system'; content: string }> = []
    const completedToolCallIds = new Set<string>()

    const specialistCalls = orderedToolCalls.filter((call) => isSpecialistTool(call.name))
    const specialistOutcomes = new Map<
      string,
      { success: boolean; findings: string; error?: string; output: unknown }
    >()

    if (specialistCalls.length > 0) {
      const specialistRunner = runParentSpecialistToolCalls({
        calls: specialistCalls,
        lastUserMessage: userTurnText,
        model: config.specialistModel,
        provider,
        allTools,
        toolCtx,
        signal: params.signal,
        userId: params.userId,
        workspaceId: params.workspaceId,
        ...(params.workflowId ? { workflowId: params.workflowId } : {}),
        usageTurnId,
        getToolExecutor,
        budget: specialistBudget,
        parentDepth: 0,
        turnCost,
      })

      let specialistNext = await specialistRunner.next()
      while (!specialistNext.done) {
        yield specialistNext.value
        specialistNext = await specialistRunner.next()
      }

      for (const outcome of specialistNext.value) {
        specialistOutcomes.set(outcome.toolCallId, {
          success: outcome.success,
          findings: outcome.findings,
          ...(outcome.error ? { error: outcome.error } : {}),
          output: {
            success: outcome.success,
            message: outcome.findings,
            domain: outcome.toolName,
            ...(outcome.result?.structured ? { structured: outcome.result.structured } : {}),
            ...(outcome.result?.verifications?.length
              ? { verifications: outcome.result.verifications }
              : {}),
          },
        })
        if (outcome.result?.verifications?.length) {
          turnVerifications.push(...outcome.result.verifications)
        }
        if (outcome.result?.mutationOutcomes?.length) {
          turnMutationOutcomes.push(...outcome.result.mutationOutcomes)
        }
      }
    }

    for (const call of orderedToolCalls) {
      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = JSON.parse(call.arguments || '{}') as Record<string, unknown>
      } catch {
        parsedArgs = {}
      }

      if (isSpecialistTool(call.name)) {
        const outcome = specialistOutcomes.get(call.id) ?? {
          success: false,
          findings: `Specialist (${call.name}) produced no result`,
          error: `Specialist (${call.name}) produced no result`,
          output: {
            success: false,
            message: `Specialist (${call.name}) produced no result`,
          },
        }

        turnToolRecords.push({
          name: call.name,
          success: outcome.success,
          result: outcome.output,
          ...(outcome.error ? { error: outcome.error } : {}),
        })
        if (isWorkflowRunToolName(call.name)) {
          streamedCharsAtLastRunTool = streamedUserFacingText.length
        }

        if (persistLocally && conversationId) {
          const sanitized = sanitizeToolIoForPersistence({
            arguments: parsedArgs,
            result: outcome.output,
          })
          await recordToolCall({
            conversationId,
            toolCallId: call.id,
            toolName: call.name,
            arguments: sanitized.arguments,
            result: sanitized.result,
          })
        }

        await logCopilotAction({
          userId: params.userId,
          workspaceId: params.workspaceId,
          workflowId: params.workflowId,
          conversationId,
          action: 'specialist_delegation',
          summary: call.name,
          status: outcome.success ? 'success' : 'failure',
          metadata: {
            chatId: params.chatId,
            runId: params.runId,
            backend: 'local',
            toolCallId: call.id,
            domain: call.name,
          },
        }).catch(() => undefined)

        const formattedToolResult = formatToolResultForLlm(call.name, outcome.output, {
          artifactStore: toolCtx.artifactStore,
        })
        pendingFollowUps = resolveMandatoryFollowUps(
          pendingFollowUps,
          call.name,
          outcome.success,
          outcome.output
        )

        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: formattedToolResult,
        })
        completedToolCallIds.add(call.id)

        if (outcome.success && call.name === 'workflow' && !streamedCreateProgress) {
          const progress = synthesizeAssistantSummaryFromTools([
            { name: call.name, success: true, result: outcome.output },
          ])
          if (progress?.trim()) {
            streamedCreateProgress = true
            const safe = stripIdsFromUserFacingText(progress)
            const chunk = assistantText ? `\n\n${safe}` : safe
            assistantText += chunk
            streamedUserFacingText += chunk
            yield { type: 'text_delta', content: chunk }
          }
        }

        const stagnationHit = stagnationTracker.record(
          call.name,
          call.arguments || '{}',
          outcome.success,
          outcome.output
        )
        if (stagnationHit) {
          if (pendingFollowUps.length > 0) {
            deferredSystemMessages.push({
              role: 'system',
              content:
                buildStagnationSystemMessage(stagnationHit) +
                ' Required follow-up tools are still pending — call them now instead of retrying the stalled tool.',
            })
          } else {
            stagnationStopMessage = stagnationHit.message
            deferredSystemMessages.push({
              role: 'system',
              content: buildStagnationSystemMessage(stagnationHit),
            })
            logger.warn('Arena Copilot tool stagnation detected', {
              toolName: stagnationHit.toolName,
              count: stagnationHit.count,
              fingerprint: stagnationHit.fingerprint,
            })
            break
          }
        }
        continue
      }

      yield {
        type: 'tool_call_start',
        toolCallId: call.id,
        toolName: call.name,
        args: parsedArgs,
      }

      const { executeLocalCopilotTool, refreshToolContext } = await getToolExecutor()
      const confirmationRequirement = classifyLocalToolConfirmation(call.name, parsedArgs)
      let toolResult: ToolExecutionResult | undefined
      if (confirmationRequirement) {
        const confirmationReady = await prepareLocalToolConfirmation({
          runId: params.runId,
          toolCallId: call.id,
          toolName: call.name,
          args: parsedArgs,
          abortSignal: params.signal,
        })
        if (confirmationReady) {
          yield { type: 'ux_phase', phase: 'waiting_approval' }
          yield {
            type: 'status',
            message: formatUxPhaseStatus('waiting_approval'),
          }
          yield {
            type: 'confirmation_required',
            toolCallId: call.id,
            toolName: call.name,
            requirement: confirmationRequirement,
          }
        }
        const confirmationDecision = confirmationReady
          ? await waitForLocalToolConfirmation({
              toolCallId: call.id,
              abortSignal: params.signal,
            })
          : 'unavailable'
        if (confirmationDecision !== 'approved') {
          const message =
            confirmationDecision === 'rejected'
              ? 'The user rejected this action.'
              : `The action was not executed because confirmation was ${confirmationDecision}.`
          toolResult = {
            toolName: call.name,
            success: false,
            result: {
              success: false,
              confirmationRequired: true,
              confirmationDecision,
              message,
            },
            error: message,
          }
          await logCopilotAction({
            userId: params.userId,
            workspaceId: params.workspaceId,
            workflowId: params.workflowId,
            conversationId,
            action: 'tool_confirmation',
            summary: `${call.name}:${confirmationDecision}`,
            status: confirmationDecision === 'rejected' ? 'rejected' : 'failure',
            metadata: {
              chatId: params.chatId,
              runId: params.runId,
              backend: 'local',
              toolCallId: call.id,
              toolName: call.name,
              confirmationDecision,
              category: confirmationRequirement.category,
            },
          }).catch(() => undefined)
        } else {
          await logCopilotAction({
            userId: params.userId,
            workspaceId: params.workspaceId,
            workflowId: params.workflowId,
            conversationId,
            action: 'tool_confirmation',
            summary: `${call.name}:approved`,
            status: 'success',
            metadata: {
              chatId: params.chatId,
              runId: params.runId,
              backend: 'local',
              toolCallId: call.id,
              toolName: call.name,
              confirmationDecision: 'approved',
              category: confirmationRequirement.category,
            },
          }).catch(() => undefined)
        }
      }

      const toolStartedAt = Date.now()
      logger.info('Arena Copilot tool starting', {
        toolName: call.name,
        toolCallId: call.id,
        workflowId: toolCtx.workflowId ?? null,
        memory: getLocalCopilotMemorySnapshot(),
      })
      if (!toolResult) {
        yield { type: 'ux_phase', phase: 'executing' }
        yield { type: 'status', message: formatUxPhaseStatus('executing') }
        toolCtx.fileIntentChannelId = bindLocalFileIntentChannel(
          call.name,
          call.id,
          toolCtx.fileIntentChannelId
        )
        const toolStatus = runToolWithStatus({
          toolCallId: call.id,
          toolName: call.name,
          args: parsedArgs,
          abortSignal: params.signal,
          execute: (onProgress) =>
            executeLocalCopilotTool(call.name, parsedArgs, {
              ...toolCtx,
              onProgress,
              activeToolCallId: call.id,
            }),
        })
        let result = await toolStatus.next()
        while (!result.done) {
          yield result.value
          result = await toolStatus.next()
        }
        toolResult = result.value
      }
      toolCtx.fileIntentChannelId = clearLocalFileIntentChannel(
        call.name,
        toolCtx.fileIntentChannelId
      )
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
        toolCtx.workflowRevision = refreshed.workflowRevision
      } else if (call.name === 'edit_workflow' && toolResult.success) {
        const output =
          toolResult.result && typeof toolResult.result === 'object'
            ? (toolResult.result as Record<string, unknown>)
            : {}
        const resolvedWorkflowId =
          (typeof output.workflowId === 'string' && output.workflowId.trim()) ||
          (typeof parsedArgs.workflowId === 'string' && parsedArgs.workflowId.trim()) ||
          toolCtx.workflowId
        if (resolvedWorkflowId) {
          toolCtx.workflowId = resolvedWorkflowId
        }
        const refreshed = await refreshToolContext(toolCtx)
        toolCtx.structuredContext = refreshed.structuredContext
        toolCtx.workflowRevision = refreshed.workflowRevision
      } else if (
        toolResult.success &&
        (isWorkflowScopedDelegatedTool(call.name) || call.name === 'validate_workflow')
      ) {
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

      if (mutationRequiresVerification(call.name)) {
        turnMutationOutcomes.push({ toolName: call.name, success: toolResult.success })
      }

      if (toolResult.success && mutationRequiresVerification(call.name)) {
        yield { type: 'ux_phase', phase: 'verifying' }
        yield { type: 'status', message: formatUxPhaseStatus('verifying') }
        const verification = await runPostMutationVerification({
          toolCallId: call.id,
          toolName: call.name,
          mutationSuccess: true,
          mutationResult: toolResult.result,
          workflowId: toolCtx.workflowId,
          executeVerifier: async (verifierName, args) => {
            const verifierWorkflowId =
              typeof args.workflowId === 'string' && args.workflowId.trim()
                ? args.workflowId.trim()
                : toolCtx.workflowId
            return executeLocalCopilotTool(verifierName, args, {
              ...toolCtx,
              ...(verifierWorkflowId ? { workflowId: verifierWorkflowId } : {}),
            })
          },
        })
        if (verification) {
          turnVerifications.push(verification)
          yield { type: 'verification_completed', record: verification }
          await logCopilotAction({
            userId: params.userId,
            workspaceId: params.workspaceId,
            workflowId: toolCtx.workflowId ?? params.workflowId,
            conversationId,
            action: 'verification',
            summary: `${verification.toolName} → ${verification.verifierToolName}`,
            status: verification.status === 'failed' ? 'failure' : 'success',
            metadata: verification as unknown as Record<string, unknown>,
          }).catch(() => undefined)
        }
      }

      turnToolRecords.push({
        name: call.name,
        success: toolResult.success,
        result: toolResult.result,
        ...(toolResult.error ? { error: toolResult.error } : {}),
      })
      if (isWorkflowRunToolName(call.name)) {
        streamedCharsAtLastRunTool = streamedUserFacingText.length
      }

      turnCost.addToolBilling({
        toolName: call.name,
        billing: toolResult.billing,
      })

      if (persistLocally && conversationId) {
        const sanitized = sanitizeToolIoForPersistence({
          arguments: parsedArgs,
          result: toolResult.result,
        })
        await recordToolCall({
          conversationId,
          toolCallId: call.id,
          toolName: call.name,
          arguments: sanitized.arguments,
          result: sanitized.result,
        })
      }

      await logCopilotAction({
        userId: params.userId,
        workspaceId: params.workspaceId,
        workflowId: params.workflowId,
        conversationId,
        action: 'tool_call',
        summary: call.name,
        status: toolResult.success ? 'success' : 'failure',
        metadata: {
          chatId: params.chatId,
          runId: params.runId,
          backend: 'local',
          toolCallId: call.id,
          toolName: call.name,
          ...sanitizeToolIoForPersistence({
            arguments: parsedArgs,
            result:
              toolResult.result && typeof toolResult.result === 'object'
                ? {
                    success: toolResult.success,
                    error: toolResult.error,
                  }
                : { success: toolResult.success },
          }),
        },
      }).catch(() => undefined)

      if (!toolResult.success && mutationRequiresVerification(call.name)) {
        recordLocalOpsEvent({
          counter: LOCAL_OPS_COUNTERS.mutationFailed,
          userId: params.userId,
          workspaceId: params.workspaceId,
          workflowId: params.workflowId,
          conversationId,
          chatId: params.chatId,
          runId: params.runId,
          metadata: { toolName: call.name },
        })
      }

      if (toolResult.patch) {
        proposedPatch = toolResult.patch
        if (toolResult.patch.recommendations) {
          recommendations = [...recommendations, ...toolResult.patch.recommendations]
        }
      }

      const formattedToolResult = formatToolResultForLlm(call.name, toolResult.result, {
        artifactStore: toolCtx.artifactStore,
      })
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
      completedToolCallIds.add(call.id)

      if (call.name === 'get_blocks_metadata' && toolResult.success) {
        if (blocksMetadataFetchedThisTurn) {
          deferredSystemMessages.push({
            role: 'system',
            content: buildBlocksMetadataReuseSystemMessage(),
          })
        }
        blocksMetadataFetchedThisTurn = true
      }

      if (
        call.name === 'edit_workflow' &&
        toolResult.success &&
        createdWorkflowThisTurn &&
        !editResultNeedsFollowUp(formattedToolResult) &&
        (pendingFollowUps.length === 0 || pendingFollowUpsAreOauthOnly(pendingFollowUps)) &&
        !workflowBuildCompleteNudgeSent
      ) {
        successfulPopulateEdits += 1
        if (successfulPopulateEdits >= MAX_POPULATE_EDITS) {
          workflowBuildCompleteNudgeSent = true
          const needsOauth =
            pendingFollowUpsAreOauthOnly(pendingFollowUps) ||
            /needsOAuthConnect|oauth_get_auth_link/i.test(formattedToolResult)
          postBuildToolMode = needsOauth ? 'oauth_only' : 'final_only'
          deferredSystemMessages.push({
            role: 'system',
            content: buildWorkflowBuildCompleteSystemMessage(postBuildToolMode),
          })
          logger.info('Arena Copilot post-build tool mode set', {
            postBuildToolMode,
            needsOauth,
            successfulPopulateEdits,
          })
        }
      }

      if (call.name === 'generate_api_key' && toolResult.success) {
        const control = buildGeneratedApiKeyControl(toolResult.result)
        if (control) {
          yield {
            type: 'trusted_control',
            toolCallId: call.id,
            control,
          }
        }
      }

      if (call.name === 'oauth_get_auth_link' && toolResult.success) {
        postBuildToolMode = 'done'
        endTurnAfterThisRound = true
        const control = buildOAuthConnectControl(toolResult.result)
        if (control) {
          yield {
            type: 'trusted_control',
            toolCallId: call.id,
            control,
          }
        }
        deferredSystemMessages.push({
          role: 'system',
          content:
            '[System] Auth link was shown to the user as a Connect control. Stop. Do not call more tools or restate the completion.',
        })
      }

      // Mid-turn progress for create and a clean populate edit so the panel is
      // not left blank if the final model round is empty/aborted.
      if (toolResult.success && call.name === 'create_workflow') {
        createdWorkflowThisTurn = true
        if (!streamedCreateProgress) {
          const progress = synthesizeAssistantSummaryFromTools([
            { name: call.name, success: true, result: toolResult.result },
          ])
          if (progress?.trim()) {
            streamedCreateProgress = true
            const safe = stripIdsFromUserFacingText(progress)
            const chunk = assistantText ? `\n\n${safe}` : safe
            assistantText += chunk
            streamedUserFacingText += chunk
            yield { type: 'text_delta', content: chunk }
          }
        }
      } else if (
        toolResult.success &&
        call.name === 'edit_workflow' &&
        !editResultNeedsFollowUp(formattedToolResult) &&
        !streamedEditProgress
      ) {
        const progress = synthesizeAssistantSummaryFromTools([
          { name: call.name, success: true, result: toolResult.result },
        ])
        if (progress?.trim()) {
          streamedEditProgress = true
          const safe = stripIdsFromUserFacingText(progress)
          const chunk = assistantText ? `\n\n${safe}` : safe
          assistantText += chunk
          streamedUserFacingText += chunk
          yield { type: 'text_delta', content: chunk }
        }
      }

      const stagnationHit = stagnationTracker.record(
        call.name,
        call.arguments || '{}',
        toolResult.success,
        toolResult.result
      )
      if (stagnationHit) {
        // Never abort while mandatory follow-ups (e.g. populate after create) remain.
        if (pendingFollowUps.length > 0) {
          deferredSystemMessages.push({
            role: 'system',
            content:
              buildStagnationSystemMessage(stagnationHit) +
              ' Required follow-up tools are still pending — call them now instead of retrying the stalled tool.',
          })
          logger.warn('Arena Copilot tool stagnation soft-nudge (pending follow-ups)', {
            toolName: stagnationHit.toolName,
            count: stagnationHit.count,
            pendingFollowUpIds: pendingFollowUps.map((item) => item.id),
          })
        } else {
          stagnationStopMessage = stagnationHit.message
          deferredSystemMessages.push({
            role: 'system',
            content: buildStagnationSystemMessage(stagnationHit),
          })
          logger.warn('Arena Copilot tool stagnation detected', {
            toolName: stagnationHit.toolName,
            count: stagnationHit.count,
            fingerprint: stagnationHit.fingerprint,
          })
          break
        }
      }
    }

    // Anthropic requires every tool_use to have an immediate tool_result. If we
    // stopped mid-batch, synthesize skipped results before any deferred system nudges.
    for (const call of orderedToolCalls) {
      if (completedToolCallIds.has(call.id)) continue
      messages.push({
        role: 'tool',
        toolCallId: call.id,
        content: JSON.stringify({
          success: false,
          error: 'Tool call was skipped before a result was produced.',
        }),
      })
    }
    for (const deferred of deferredSystemMessages) {
      messages.push(deferred)
    }

    if (!stagnationStopMessage && !endTurnAfterThisRound) {
      yield { type: 'status', message: 'Reviewing results…' }
    }

    const microcompactStats = applyMicrocompactInPlace(messages)
    if (microcompactStats.clearedCount > 0) {
      logger.info('Arena Copilot microcompact applied', {
        round,
        microcompactClearedCount: microcompactStats.clearedCount,
        microcompactCharsFreed: microcompactStats.charsFreed,
      })
    }

    if (estimateChatMessagesTokens(messages, tokenCountModel) > promptBudget.tokenBudget) {
      const refit = fitPromptWithSlots(messages, promptBudget.tokenBudget, tokenCountModel)
      messages.splice(0, messages.length, ...refit)
      logger.info('Arena Copilot prompt re-fit after tool round', {
        round,
        promptTokenBudget: promptBudget.tokenBudget,
        estimatedPromptTokens: estimateChatMessagesTokens(messages, tokenCountModel),
      })
    }

    if (stagnationStopMessage) break
    if (endTurnAfterThisRound) {
      postBuildToolMode = 'done'
      break
    }
  }

  if (stagnationStopMessage) {
    // One more model round with the stagnation system nudge. Keep tools attached
    // — Bedrock requires toolConfig when history already has tool content.
    // If the model stays silent, surface the stop message directly.
    const priorAssistantChars = assistantText.length
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
      intervalMs: 2500,
    })) {
      if (event.type === 'status') {
        yield event
        continue
      }
      const chunk = event.item
      if (chunk.type === 'text' && chunk.content) {
        const cleaned = stripIdsFromUserFacingText(
          stripLeakedToolMarkers(chunk.content, { trim: false })
        )
        if (!cleaned) continue
        assistantText += cleaned
        streamedUserFacingText += cleaned
        yield { type: 'text_delta', content: cleaned }
      }
      if (chunk.type === 'done' && chunk.usage) {
        turnCost.addModelUsage({
          model: config.model,
          inputTokens: chunk.usage.inputTokens,
          outputTokens: chunk.usage.outputTokens,
          cacheReadTokens: chunk.usage.cacheReadTokens,
          provider: config.provider,
        })
        turnInputTokens += chunk.usage.inputTokens
        turnOutputTokens += chunk.usage.outputTokens
      }
    }
    if (assistantText.length === priorAssistantChars) {
      const safe = stripIdsFromUserFacingText(stagnationStopMessage)
      assistantText += safe
      streamedUserFacingText += safe
      yield { type: 'text_delta', content: safe }
    }
  }

  // Prefer the full streamed user-facing transcript for persistence — per-round
  // assistantText is cleared when tool calls continue.
  if (streamedUserFacingText.trim().length > assistantText.trim().length) {
    assistantText = streamedUserFacingText
  }

  // Rewrite leaked single_select JSON into canonical <options> before follow-ups / persist.
  assistantText = normalizeSingleSelectJsonToOptionsTags(assistantText)
  streamedUserFacingText = normalizeSingleSelectJsonToOptionsTags(streamedUserFacingText)

  // Tool-round / bridging narration is buffered (not streamed) to avoid repeated
  // Arena Copilot headers and empty-looking settles. If the UI never got a real
  // answer — or only got a "let me retry…" bridge — synthesize from tools (prefer)
  // or flush non-bridging buffered prose so the turn never ends on a blank bubble.
  if (
    shouldSynthesizeAssistantSummary({
      streamedUserFacingText,
      toolRecordCount: turnToolRecords.length,
    })
  ) {
    if (turnToolRecords.length > 0) {
      const synthesized =
        synthesizeAssistantSummaryFromTools(turnToolRecords) ??
        'I finished the requested steps, but had nothing further to add.'
      const safe = stripIdsFromUserFacingText(synthesized)
      assistantText = safe
      streamedUserFacingText = safe
      yield { type: 'text_delta', content: safe }
    } else if (assistantText.trim() && !isBridgingAssistantNarration(assistantText)) {
      const safe = stripIdsFromUserFacingText(assistantText)
      streamedUserFacingText = safe
      assistantText = safe
      yield { type: 'text_delta', content: safe }
    }
  } else if (
    shouldAppendWorkflowRunChatResult({
      streamedUserFacingText,
      streamedCharsAtLastRunTool,
      toolRecords: turnToolRecords,
    })
  ) {
    // Substantive pre-run prose (e.g. "Updated… Let me run it.") blocks full
    // synthesize, but the run finished with no post-run reply — append the result
    // so chat never settles on a completed "Running workflow" row alone.
    const appendix = buildWorkflowRunChatAppendix(turnToolRecords)
    if (appendix) {
      const safe = stripIdsFromUserFacingText(appendix)
      const chunk = streamedUserFacingText.trim() ? `\n\n${safe}` : safe
      assistantText += chunk
      streamedUserFacingText += chunk
      yield { type: 'text_delta', content: chunk }
    }
  }

  // Emit at most one follow-up block for the whole turn (never after each tool round).
  const followUpItems =
    recommendations.length > 0
      ? recommendations
      : modelFollowUpTitles.length > 0
        ? modelFollowUpTitles
        : []
  if (followUpItems.length > 0 && !hasOptionsTag(assistantText)) {
    const optionsTag = formatOptionsTag(followUpItems)
    assistantText += optionsTag
    streamedUserFacingText += optionsTag
    yield { type: 'text_delta', content: optionsTag }
    if (recommendations.length === 0) {
      recommendations = followUpItems
    }
  }

  let patchId: string | undefined
  if (proposedPatch && params.workflowId) {
    let patchConversationId = conversationId
    if (!patchConversationId) {
      patchConversationId = await createConversation({
        userId: params.userId,
        workspaceId: params.workspaceId,
        workflowId: params.workflowId,
        title: 'Arena Copilot (patch)',
        model: config.model,
        provider: config.provider,
      })
    }
    try {
      patchId = await savePatch({
        conversationId: patchConversationId,
        userId: params.userId,
        workflowId: params.workflowId,
        patch: proposedPatch,
      })
    } catch (error) {
      logger.warn('Failed to persist Arena Copilot patch', {
        workflowId: params.workflowId,
        error: getErrorMessage(error),
      })
    }
    yield {
      type: 'ux_phase',
      phase: 'waiting_approval',
    }
    yield {
      type: 'patch_proposed',
      patch: proposedPatch,
      patchId: patchId ?? '',
      workflowId: params.workflowId,
    }
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

  const turnCompletion = resolveTurnCompletion({
    mutationOutcomes: turnMutationOutcomes,
    verifications: turnVerifications,
  })
  yield {
    type: 'turn_completion',
    status: turnCompletion,
    verifications: turnVerifications,
  }

  if (turnCompletion === 'completed_verified') {
    recordLocalOpsEvent({
      counter: LOCAL_OPS_COUNTERS.turnVerified,
      userId: params.userId,
      workspaceId: params.workspaceId,
      workflowId: params.workflowId,
      conversationId,
      chatId: params.chatId,
      runId: params.runId,
    })
  } else if (turnCompletion === 'failed') {
    recordLocalOpsEvent({
      counter: LOCAL_OPS_COUNTERS.turnFailed,
      userId: params.userId,
      workspaceId: params.workspaceId,
      workflowId: params.workflowId,
      conversationId,
      chatId: params.chatId,
      runId: params.runId,
    })
  }

  const approvalLines = turnToolRecords
    .filter((record) => {
      const result = record.result
      if (!result || typeof result !== 'object') return false
      const confirmationDecision = (result as Record<string, unknown>).confirmationDecision
      return confirmationDecision === 'approved' || confirmationDecision === 'rejected'
    })
    .map((record) => {
      const result = record.result as Record<string, unknown>
      return `${record.name} ${String(result.confirmationDecision)}`
    })
  const failureLines = buildToolFailureEvidenceLines(turnToolRecords)
  const verificationLines = turnVerifications.map(
    (record) => `${record.verifierToolName} ${record.status}`
  )

  if (params.chatId) {
    const nextTask = updateTaskStateFromTurn({
      previous: taskState,
      objectiveHint: params.message.slice(0, 280),
      approvals: approvalLines,
      verification: turnVerifications.map((record) => ({
        tool: record.verifierToolName,
        status: record.status,
      })),
      failed: turnCompletion === 'failed',
      targetResources: params.workflowId ? [params.workflowId] : [],
    })
    if (nextTask) {
      taskState = nextTask
      await persistTaskState(params.chatId, params.userId, nextTask).catch(() => undefined)
    }

    const evidenced = mergeSessionMemoryEvidence(sessionMemory, {
      approvals: approvalLines,
      failures: failureLines,
      verification: verificationLines,
    })
    if (evidenced) {
      sessionMemory = evidenced
      await persistSessionMemory(params.chatId, params.userId, evidenced).catch(() => undefined)
    }

    if (toolCtx.artifactStore && toolCtx.artifactStore.artifacts.size > 0) {
      await persistArtifacts(params.chatId, params.userId, toolCtx.artifactStore).catch(
        () => undefined
      )
    }

    if (snapshotPromptPlan) {
      await mergeCopilotChatConfig(params.chatId, params.userId, {
        workspaceSnapshotMeta: snapshotPromptPlan.meta,
        workspaceSnapshotFingerprints: snapshotPromptPlan.fingerprints,
      }).catch(() => undefined)
    } else if (structuredContext.snapshotFreshness) {
      await mergeCopilotChatConfig(params.chatId, params.userId, {
        workspaceSnapshotMeta: {
          ...structuredContext.snapshotFreshness,
          workspaceId: params.workspaceId,
        },
      }).catch(() => undefined)
    } else if (params.workspaceSnapshot && params.workspaceContext) {
      await mergeCopilotChatConfig(params.chatId, params.userId, {
        workspaceSnapshotMeta: {
          ...toWorkspaceSnapshotMeta({
            markdown: params.workspaceContext,
            snapshot: params.workspaceSnapshot,
          }),
          workspaceId: params.workspaceId,
        },
      }).catch(() => undefined)
    }
  }

  await logCopilotAction({
    userId: params.userId,
    workspaceId: params.workspaceId,
    workflowId: params.workflowId,
    conversationId,
    action: 'turn_completion',
    summary: turnCompletion,
    status: turnCompletion === 'failed' ? 'failure' : 'success',
    metadata: {
      status: turnCompletion,
      verificationCount: turnVerifications.length,
      mutationCount: turnMutationOutcomes.length,
    },
  }).catch(() => undefined)

  const costSummary = turnCost.summarize()

  logger.info('Arena Copilot turn complete', {
    conversationId: conversationId ?? null,
    messageId: messageId || null,
    usageTurnId,
    patchId: patchId ?? null,
    workspaceId: params.workspaceId,
    workflowId: params.workflowId ?? null,
    model: config.model,
    provider: config.provider,
    historyTurns: historyMessages.length,
    assistantChars: assistantText.length,
    toolCallCount: turnToolRecords.length,
    toolNames: turnToolRecords.map((record) => record.name),
    inputTokens: turnInputTokens,
    outputTokens: turnOutputTokens,
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
      messageId: usageTurnId,
      summary: costSummary,
      executionActor: { actorUserId: params.userId, actorType: 'user' },
      parentExecutionId: params.parentExecutionId,
      rootExecutionId: params.parentExecutionId,
      triggeringChatId: params.chatId,
      triggeringRunId: params.runId,
      billingAttribution,
    })
    recordLocalOpsEvent({
      counter: LOCAL_OPS_COUNTERS.costRecorded,
      userId: params.userId,
      workspaceId: params.workspaceId,
      workflowId: params.workflowId,
      conversationId,
      chatId: params.chatId,
      runId: params.runId,
      metadata: { total: costSummary.total },
    })
  }

  yield {
    type: 'done',
    messageId: messageId || usageTurnId,
    ...(turnInputTokens > 0 || turnOutputTokens > 0
      ? {
          usage: {
            model: config.model,
            inputTokens: turnInputTokens,
            outputTokens: turnOutputTokens,
          },
        }
      : {}),
  }

  if (!writeChatLedger && costSummary.total > 0) {
    return costSummary
  }

  return undefined
}

export function formatSSE(event: LocalCopilotStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}
