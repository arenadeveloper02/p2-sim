const WORKFLOW_ROLE_ACCENTS = {
  agentic: { variant: 'workflow', tone: 'inverse' },
  interface: { variant: 'workflow', tone: 'blue' },
  logic: { variant: 'workflow', tone: 'orange' },
  state: { variant: 'workflow', tone: 'yellow' },
  flow: { variant: 'workflow', tone: 'ash' },
  records: { variant: 'workflow', tone: 'green' },
  identity: { variant: 'workflow', tone: 'identity' },
  neutral: { variant: 'workflow', tone: 'neutral' },
  generative: { variant: 'workflow', tone: 'purple' },
  knowledge: { variant: 'workflow', tone: 'content' },
} as const

export type WorkflowTypeRole = keyof typeof WORKFLOW_ROLE_ACCENTS

const WORKFLOW_TYPE_ROLES = {
  a2a: 'neutral',
  agent: 'agentic',
  api: 'interface',
  condition: 'logic',
  credential: 'state',
  credential_group: 'identity',
  deployments: 'neutral',
  enrichment: 'knowledge',
  evaluator: 'logic',
  file: 'knowledge',
  file_v2: 'knowledge',
  file_v3: 'knowledge',
  file_v4: 'knowledge',
  file_v5: 'knowledge',
  function: 'logic',
  generic_webhook: 'interface',
  guardrails: 'logic',
  human_in_the_loop: 'state',
  image_generator: 'generative',
  image_generator_v2: 'generative',
  imap: 'interface',
  knowledge: 'knowledge',
  logs: 'records',
  logs_v2: 'records',
  loop: 'flow',
  mcp: 'interface',
  memory: 'state',
  mothership: 'agentic',
  note: 'neutral',
  parallel: 'flow',
  pi: 'agentic',
  response: 'interface',
  router: 'flow',
  router_v2: 'flow',
  rss: 'knowledge',
  schedule: 'flow',
  search: 'knowledge',
  sim_workspace_event: 'interface',
  start_trigger: 'flow',
  starter: 'neutral',
  stt: 'generative',
  stt_v2: 'generative',
  table: 'records',
  table_v2: 'records',
  thinking: 'agentic',
  translate: 'generative',
  tts: 'generative',
  variables: 'state',
  video_generator: 'generative',
  video_generator_v2: 'generative',
  video_generator_v3: 'generative',
  vision: 'generative',
  vision_v2: 'generative',
  wait: 'flow',
  webhook_request: 'interface',
  workflow: 'interface',
  workflow_input: 'interface',
} as const satisfies Record<string, WorkflowTypeRole>

const DEFAULT_WORKFLOW_TYPE_ROLE: WorkflowTypeRole = 'neutral'

export const hasWorkflowTypeRole = (type: string): type is keyof typeof WORKFLOW_TYPE_ROLES =>
  Object.hasOwn(WORKFLOW_TYPE_ROLES, type)

export const getWorkflowTypeRole = (type: string): WorkflowTypeRole =>
  WORKFLOW_TYPE_ROLES[type as keyof typeof WORKFLOW_TYPE_ROLES] ?? DEFAULT_WORKFLOW_TYPE_ROLE

export const getWorkflowTypeAccent = (type: string) =>
  WORKFLOW_ROLE_ACCENTS[getWorkflowTypeRole(type)]
