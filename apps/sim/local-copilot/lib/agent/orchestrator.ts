import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { generateId } from '@sim/utils/id'
import { truncate } from '@sim/utils/string'
import { userMemoryServerTool } from '@/lib/copilot/tools/server/other/user-memory'
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
  filterToolsByNames,
  toolNamesForIntent,
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
import { logCopilotAction } from '@/local-copilot/lib/audit/logger'
import { recordLocalCopilotTurnUsage } from '@/local-copilot/lib/billing/record-turn-usage'
import {
  LocalTurnCostAccumulator,
  type LocalTurnCostSummary,
} from '@/local-copilot/lib/billing/turn-cost-accumulator'
import { getLocalCopilotConfig, buildLocalCopilotConfigForCatalog, assertLocalCopilotEnabled } from '@/local-copilot/lib/config'
import {
  DEFAULT_LOCAL_COPILOT_CATALOG_ID,
  type LocalCopilotCatalogId,
} from '@/local-copilot/lib/model-catalog'
import {
  buildLocalCopilotContext,
  contextToPromptJson,
} from '@/local-copilot/lib/context/build-context'
import {
  compactChatHistory,
  estimateChatMessagesTokens,
  estimateToolDefinitionTokens,
  fitPromptToTokenBudget,
  LOCAL_COPILOT_PROMPT_TOKEN_BUDGET,
  LOCAL_COPILOT_WORKFLOW_FULL_STATE_TOKEN_BUDGET,
  resolveWorkflowContextDetail,
} from '@/local-copilot/lib/context/context-budget'
import { applyMicrocompactInPlace, microcompactMessages } from '@/local-copilot/lib/context/microcompact'
import {
  extractFollowUpDirectives,
  formatActiveDirectiveSystemMessage,
  formatSessionConstraintsSystemMessage,
  type PreferenceMemoryCandidate,
} from '@/local-copilot/lib/context/follow-up-directives'
import {
  ensureSessionMemory,
  formatSessionMemorySystemMessage,
  mergeFollowUpDirectivesIntoSessionMemory,
  type SessionMemoryTurn,
} from '@/local-copilot/lib/context/session-memory'
import { getLocalCopilotMemorySnapshot } from '@/local-copilot/lib/diagnostics'
import {
  extractOptionsTitles,
  formatOptionsTag,
  hasOptionsTag,
  normalizeSingleSelectJsonToOptionsTags,
  stripOptionsTagsForDisplay,
} from '@/local-copilot/lib/format-options-tag'
import { formatOAuthConnectCredentialTag } from '@/local-copilot/lib/oauth-connect-text'
import {
  buildBlocksMetadataReuseSystemMessage,
  buildUnfulfilledIntentContinuationMessage,
  buildWorkflowBuildCompleteSystemMessage,
  createAssistantRoundTextStreamer,
  editResultNeedsFollowUp,
  isBridgingAssistantNarration,
  isUnfulfilledMutationIntentNarration,
  pendingFollowUpsAreOauthOnly,
  shouldSynthesizeAssistantSummary,
  stripIdsFromUserFacingText,
  type PostBuildToolMode,
} from '@/local-copilot/lib/user-facing-text'
import {
  appendMessage,
  createConversation,
  getMessages,
  recordToolCall,
  savePatch,
} from '@/local-copilot/lib/persistence/store'
import { createLocalCopilotProvider, getLocalCopilotProvider } from '@/local-copilot/lib/providers/registry'
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
/** Cap for "I am applying…" prose with no tool call — avoid infinite nudge loops. */
const MAX_INTENT_CONTINUATION_ROUNDS = 2

const SYSTEM_PROMPT = `You are Arena Copilot — the in-app AI assistant for building, debugging, and understanding workflows in this workspace.

Identity:
- Your name is Arena Copilot. When speaking to the user, always refer to yourself as "Arena Copilot".
- Never call yourself Sim AI Copilot, Sim Copilot, Sim.ai Copilot, Mothership, or any other name.

Response format:
- Open with a warm, concise greeting when starting a conversation or after a long pause.
- Briefly summarize what you see in the workspace (workflows, files, tables, knowledge bases) in plain prose. Do not greet with a generic capability bullet list.
- Never mention cost, pricing, dollar amounts, or spend in user-facing replies — even if tool results include them (e.g. do not write "cost ~$0.016"). You may still mention runtime/duration when useful.
- User-facing replies (CRITICAL):
  - Never mention block UUIDs, internal IDs, tool names (\`edit_workflow\`, \`get_workflow_context\`, etc.), or operation internals in user-visible text.
  - Refer to blocks only by display name (e.g. "Writer", "Reviewer", "Fetch Emails"). Never write "Start block ID is …".
  - Do not narrate planned work ("Let me check…", "Now I'll grab metadata…", "I'm about to…"). Call the tool; speak only after outcomes that the user needs.
  - While tools are still running, keep user-visible text to a short status line or silence — save the full summary for the final reply.
  - If a tool fails, explain the blocker in plain language without dumping IDs or raw JSON.
- Finish efficiently (CRITICAL — avoid thrash):
  - Call \`get_blocks_metadata\` **once** with every block type you need in that call (e.g. \`{ "blockIds": ["agent","start_trigger","gmail"] }\`). Do not re-fetch the same types.
  - Prefer one \`edit_workflow\` that adds all blocks and wires connections. Only call edit again when the result reports skippedItems, inputValidationErrors, needsFollowUpEdit, or real lint errors.
  - After a successful create + populate edit with no repair needed: **STOP**. One final reply. Do NOT call \`validate_workflow\`, re-open the workflow, re-fetch metadata, or restate the same completion summary.
  - Missing OAuth only: call \`oauth_get_auth_link\` once, share the link, then stop.
- Similar existing workflows (CRITICAL):
  - If \`workspaceWorkflows\` already has a close match (e.g. Weekly Email Summary vs a 10-day email summary), do **not** silently create a duplicate.
  - First reply with a short question and an \`<options>\` block offering: edit/adjust the existing one vs create a new named variant. Only create after the user chooses "create" / a new variant, or when they already named a clearly distinct workflow.
  - When the user already asked to create a distinctly named new workflow (e.g. "10-Day Email Summary"), pass \`confirmNewWorkflow: true\` and build it — still skip metadata thrash and post-success validation loops.
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
- Existing workflows first (CRITICAL):
  - \`workspaceWorkflows\` lists every workflow in this workspace (id, name, isDeployed, lastRunAt). Read \`guidance\` in context when present.
  - When the user asks to run, test, execute, try, debug, check, or use a workflow — or their request matches an existing workflow name or purpose — use \`get_workflow_run_options\` then \`run_workflow\` on that workflow. NEVER call \`create_workflow\`.
  - When only one workflow exists, assume the user means that workflow unless they explicitly ask for something new.
  - Only call \`create_workflow\` when the user clearly wants a brand-new workflow with a distinct name and purpose. Pass \`confirmNewWorkflow: true\` in that case.
  - If a workflow already exists with the same or similar name, run or edit it — do not duplicate it.
- On the workspace home chat there may be no workflow open — still prefer running or editing \`workspaceWorkflows\` entries before creating new ones.
- After create_workflow succeeds (only when truly new), immediately call edit_workflow with add operations to populate the workflow. Use the returned workflowId and startBlockId.
- Building workflows with edit_workflow (CRITICAL — follow exactly to avoid retry loops):
  - Call get_blocks_metadata **once** with \`{ "blockIds": ["agent","start_trigger", …] }\` including every integration type you will add (e.g. gmail). Use returned field ids verbatim in params.inputs.
  - Never call get_blocks_metadata again for types already returned this turn.
  - When workflow context has \`detail: "compact"\`, call \`get_workflow_context\` with \`blockNames\` (preferred) or \`blockIds\` for every block you will edit BEFORE \`edit_workflow\`. Compact context omits prompt/message bodies.
  - Never add edges as separate operations or with type "edge". Connections live on the SOURCE block: \`params.connections: { source: "<target-block-id>" }\`. To wire Start → Agent, edit the Start block (startBlockId from create_workflow) with connections pointing to the agent block_id — use that id only in the tool args, never in user-visible text.
  - Agent block: use \`messages\` (array of \`{role, content}\`), \`model\`, and \`tools\` — not systemPrompt/userPrompt. If you only have a system prompt string, still pass it via \`messages: [{role:"system",content:"..."},{role:"user",content:"..."}]\` (legacy systemPrompt is auto-mapped, but \`messages\` is preferred). Exa web search tool entry: \`{ type: "exa", title: "Exa Search", toolId: "exa_search", usageControl: "auto" }\`.
  - Prefer one edit_workflow call with all add operations plus a final edit on the Start block for connections. deferredConnections in results are normal for forward references within the same batch — do not re-issue them unless the target id was wrong.
  - If workflowLintMessage reports orphan blocks, fix connections on the Start (or upstream) block before run_workflow.
  - Always issue the \`edit_workflow\` tool call to apply changes. Never end a turn by only describing the intended edit.
  - Do not call \`validate_workflow\` after a clean successful edit — trust the edit result unless it reported errors.
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
  - A system message may include structured session memory for earlier turns (goals, decisions, constraints, activeDirective, entities, progress, open questions).
  - Trust it for older context. If recent verbatim turns conflict, prefer the recent turns.
  - \`constraints\` and the separate "Active user directive" / "Session constraints" system messages are authoritative for corrections ("use X not Y", "don't create a new workflow"). Do not re-ask or undo them unless the user explicitly changes course.
  - Never burn tool rounds re-doing work that constraints already forbade. If stuck after a failed retry, stop and ask — do not loop the same tool with the same args.
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
- Prefer \`edit_workflow\` to apply changes on open workflows. Use \`propose_workflow_patch\` only when the user asks to review a plan before applying, or for a large multi-block redesign that needs confirmation. For new workflows from home chat, use create_workflow + edit_workflow.
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
  - Context includes \`workspaceFiles\` (id, name, vfs path), \`tables\`, and \`knowledgeBases\`.
  - Find files: \`glob\` with a pattern like \`files/**/*.csv\`, then \`read\` using the exact path from results.
  - Create files: \`create_file_folder\` when needed, then \`create_file\` with \`content\` for markdown/text/json/csv (one step). Never call \`create_file\` without \`content\` for .md files unless you will immediately follow with \`workspace_file\` update + \`edit_content\`.
  - Rename/move/delete files: \`rename_file\`, \`move_file\`, \`delete_file\` (paths arrays). Folders: \`list_file_folders\`, \`rename_file_folder\`, \`move_file_folder\`, \`delete_file_folder\`. Delete only when the user explicitly asked.
  - Read or update existing files: \`workspace_file\` (update/append/patch) then \`edit_content\` in the **next** step with the body — never parallel.
  - Read or update tables: \`user_table\` — use \`get\` / \`get_schema\` / \`query_rows\` to read; \`create\`, \`insert_row\`, \`batch_insert_rows\`, \`import_file\`, \`create_from_file\` to write.
  - Knowledge bases: \`knowledge_base\` — \`query\` to search/retrieve; \`add_file\` to ingest a workspace file or URL; \`create\` for new KBs; \`get\` / \`list\` to inspect.
  - Prefer existing resources in context before creating duplicates (same as workflows).
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
  - Creating PPTX / DOCX / PDF (CRITICAL — always available, do not refuse). Exact arg shapes:
    1. \`create_file\` empty shell — prefer \`{"fileName":"files/Deck.pptx"}\` (no \`content\`).
    2. \`workspace_file\` — \`{"operation":"update","target":{"kind":"path","path":"files/Deck.pptx"},"title":"Deck"}\`. \`target\` MUST be an object, never a string path.
    3. Later round only: \`edit_content\` — \`{"content":"pptx.addSlide(); slide.addText(\\"Title\\", { x: 0.5, y: 0.5, w: 9, h: 1 });"}\` using pre-initialized \`pptx\` / \`docx\` / \`pdf\` globals (do not \`require\` them). Never same batch as \`workspace_file\`.
    - These formats compile via the built-in JS sandbox even when \`e2b.docSandboxEnabled\` is false. Never refuse because E2B is off.
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
   * Allowlisted Local Copilot model catalog id. When set, builds a per-request
   * provider config instead of using process-wide `COPILOT_*` env defaults.
   */
  catalogId?: LocalCopilotCatalogId
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
    await persistInferredUserPreferences({
      userId: params.userId,
      workspaceId: params.workspaceId,
      preferences: extractedDirectives.preferences,
    })
  }

  const historyMessages: ChatMessage[] = rawHistory.length
    ? microcompactMessages(
        compactChatHistory(rawHistory, { sessionMemoryPresent: Boolean(sessionMemory) })
      ).messages
    : []

  const workflowDetail = resolveWorkflowContextDetail(
    structuredContext,
    LOCAL_COPILOT_WORKFLOW_FULL_STATE_TOKEN_BUDGET,
    config.model
  )
  const contextJson = contextToPromptJson(structuredContext, { workflowDetail })
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
      ...(sessionMemory ? [formatSessionMemorySystemMessage(sessionMemory)] : []),
      ...(pinnedConstraints.length > 0
        ? [formatSessionConstraintsSystemMessage(pinnedConstraints)]
        : []),
      ...(pinnedDirective ? [formatActiveDirectiveSystemMessage(pinnedDirective)] : []),
      ...historyMessages,
      userTurn,
    ],
    LOCAL_COPILOT_PROMPT_TOKEN_BUDGET,
    config.model
  )

  const allTools = await resolveLocalCopilotTools(params.workspaceId)
  const intent = classifyLocalCopilotIntent(params.message)
  const allowedToolNames = toolNamesForIntent(intent)
  let tools = filterToolsByNames(allTools, allowedToolNames)

  // Hybrid: intent leaf tools ∪ 12 specialist entry tools.
  const specialistTools = getParentSpecialistToolDefinitions()
  const seenToolNames = new Set(tools.map((tool) => tool.name))
  for (const specialistTool of specialistTools) {
    if (!seenToolNames.has(specialistTool.name)) {
      tools = [...tools, specialistTool]
      seenToolNames.add(specialistTool.name)
    }
  }

  // Full catalog only when the hybrid set is empty (never solely because primary is general).
  let usedFullCatalog = allowedToolNames === null
  if (tools.length === 0) {
    tools = allTools
    usedFullCatalog = true
  }

  const specialistBudget = createSpecialistBudget()

  logger.info('Arena Copilot prompt budget applied', {
    workflowDetail,
    historyTurns: historyMessages.length,
    sessionMemoryPresent: Boolean(sessionMemory),
    contextEntries: params.contexts?.length ?? 0,
    fileAttachments: params.fileAttachments?.length ?? 0,
    estimatedPromptTokens: estimateChatMessagesTokens(messages, config.model),
    estimatedToolDefinitionTokens: estimateToolDefinitionTokens(tools, config.model),
    tokenCountModel: config.model,
    toolDefinitionCount: tools.length,
    toolCatalogCount: allTools.length,
    specialistPrimary: intent.primary,
    specialistSecondary: intent.secondary,
    useFullCatalog: usedFullCatalog,
    partitioning: 'hybrid',
    skillToolEnabled: allTools.length > LOCAL_COPILOT_TOOLS.length,
    memory: getLocalCopilotMemorySnapshot(),
  })

  const provider = params.catalogId
    ? createLocalCopilotProvider(config)
    : getLocalCopilotProvider()
  const toolCtx: ToolExecutionContext = {
    userId: params.userId,
    workspaceId: params.workspaceId,
    workflowId: params.workflowId,
    chatId: params.chatId,
    messageId: usageTurnId,
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
  /** Only gate tools after create→populate this turn — not after ordinary prompt edits. */
  let createdWorkflowThisTurn = false
  let postBuildToolMode: PostBuildToolMode = 'all'
  let endTurnAfterThisRound = false
  /** Full user-visible prose streamed this turn (survives per-round assistantText resets). */
  let streamedUserFacingText = ''
  const turnToolRecords: ToolTurnRecord[] = []
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

    const roundTools =
      postBuildToolMode === 'final_only'
        ? []
        : postBuildToolMode === 'oauth_only'
          ? tools.filter((tool) => tool.name === 'oauth_get_auth_link')
          : tools

    // Stream user-facing prose live for real replies. Hold bridging narration when
    // tools are available, and stop emitting once a tool_call arrives — otherwise
    // each tool batch opens a repeated "Arena Copilot >" mothership header.
    const contentBeforeRound = streamedUserFacingText
    const textStreamer = createAssistantRoundTextStreamer({
      toolsAvailable: roundTools.length > 0,
      contentBeforeRound,
    })

    // Keep the trailing Thinking… pulse alive across tool → model gaps so the
    // UI never looks finished while the turn is still in flight.
    yield {
      type: 'status',
      message: round === 0 ? 'Working on it…' : 'Deciding next step…',
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
          },
        })
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
        })

        if (persistLocally && conversationId) {
          await recordToolCall({
            conversationId,
            toolCallId: call.id,
            toolName: call.name,
            arguments: parsedArgs,
            result: outcome.output,
          })
        }

        const formattedToolResult = formatToolResultForLlm(call.name, outcome.output)
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
        })
      }

      if (call.name === 'oauth_get_auth_link' && toolResult.success) {
        postBuildToolMode = 'done'
        endTurnAfterThisRound = true
        // Narration in tool rounds is buffered — stream the Connect control ourselves
        // so the user always gets a clickable connect option.
        const connectText = formatOAuthConnectCredentialTag(toolResult.result)
        if (connectText && !streamedUserFacingText.includes('<credential>')) {
          const chunk = streamedUserFacingText.trim() ? `\n\n${connectText}` : connectText
          assistantText += chunk
          streamedUserFacingText += chunk
          yield { type: 'text_delta', content: chunk }
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
        clearedCount: microcompactStats.clearedCount,
        charsFreed: microcompactStats.charsFreed,
      })
    }

    if (stagnationStopMessage) break
    if (endTurnAfterThisRound) {
      postBuildToolMode = 'done'
      break
    }
  }

  if (stagnationStopMessage) {
    // One more model round with the stagnation system nudge (no tools needed).
    // If the model stays silent, surface the stop message directly.
    const priorAssistantChars = assistantText.length
    for await (const event of iterateWithIdleStatus({
      source: provider.chatCompletionStream({
        model: config.model,
        messages,
        tools: [],
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
        const cleaned = stripLeakedToolMarkers(chunk.content, { trim: false })
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
          provider: config.provider,
        })
        turnInputTokens += chunk.usage.inputTokens
        turnOutputTokens += chunk.usage.outputTokens
      }
    }
    if (assistantText.length === priorAssistantChars) {
      assistantText += stagnationStopMessage
      streamedUserFacingText += stagnationStopMessage
      yield { type: 'text_delta', content: stagnationStopMessage }
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

/**
 * Soft-persists high-confidence preference/correction phrases into user_memory
 * so follow-up chats honor them without the model calling the tool first.
 */
async function persistInferredUserPreferences(params: {
  userId: string
  workspaceId: string
  preferences: PreferenceMemoryCandidate[]
}): Promise<void> {
  for (const preference of params.preferences.slice(0, 5)) {
    try {
      const result = await userMemoryServerTool.execute(
        {
          operation: 'add',
          key: preference.key,
          value: preference.value,
          memory_type: preference.memoryType,
          source: 'inferred',
          confidence: 0.85,
          workspaceId: params.workspaceId,
        },
        { userId: params.userId, workspaceId: params.workspaceId }
      )
      if (!result.success) {
        logger.warn('Inferred user_memory persist failed', {
          key: preference.key,
          error: result.error ?? 'unknown',
        })
      }
    } catch (error) {
      logger.warn('Inferred user_memory persist threw', {
        key: preference.key,
        error: getErrorMessage(error),
      })
    }
  }
}
