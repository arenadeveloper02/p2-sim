import { GoogleGenAI } from '@google/genai'
import {
  validateGoogleCloudLocation,
  validateGoogleCloudProject,
} from '@/lib/core/security/input-validation'

const DEFAULT_VERTEX_LOCATION = 'global'
const VERTEX_CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

/**
 * Three Local Copilot Vertex slots (in rotation order).
 * Slot 0 uses unsuffixed envs; slots 1–2 use `_1` / `_2`.
 */
const VERTEX_SLOTS = [
  {
    index: 0,
    projectEnv: 'VERTEX_PROJECT',
    locationEnv: 'VERTEX_LOCATION',
    serviceAccountEnv: 'VERTEX_SERVICE_ACCOUNT_JSON',
  },
  {
    index: 1,
    projectEnv: 'VERTEX_PROJECT_1',
    locationEnv: 'VERTEX_LOCATION_1',
    serviceAccountEnv: 'VERTEX_SERVICE_ACCOUNT_JSON_1',
  },
  {
    index: 2,
    projectEnv: 'VERTEX_PROJECT_2',
    locationEnv: 'VERTEX_LOCATION_2',
    serviceAccountEnv: 'VERTEX_SERVICE_ACCOUNT_JSON_2',
  },
] as const

const VERTEX_NOT_CONFIGURED =
  'Vertex AI is not configured on this server. Set VERTEX_PROJECT + VERTEX_SERVICE_ACCOUNT_JSON (and optionally VERTEX_PROJECT_1/_2 with matching VERTEX_SERVICE_ACCOUNT_JSON_1/_2 and VERTEX_LOCATION_1/_2). Auth also accepts GCS_CREDENTIALS_JSON or Application Default Credentials.'

interface ServiceAccountCredentials {
  client_email: string
  private_key: string
  project_id?: string
}

/**
 * One Vertex project / location / credential combo for Local Copilot.
 * Rotation spreads parent rounds and 429 retries across slots.
 */
export interface LocalCopilotVertexSlot {
  /** 0 = primary (`VERTEX_PROJECT`), 1–2 = `_1` / `_2`. */
  slot: number
  project: string
  location: string
  credentials?: ServiceAccountCredentials
}

/**
 * Process-local counter so consecutive Local Copilot Vertex calls (parent
 * rounds, specialists, parallel subagents, 429 retries) spread across the
 * three configured slots.
 */
let vertexSlotRotationCounter = 0

/**
 * Parses inline service-account JSON from Vertex or GCS env vars.
 * Returns `null` when unset so the SDK can fall back to ADC.
 */
function parseServiceAccountJson(raw: string | undefined): ServiceAccountCredentials | null {
  if (!raw?.trim()) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(
      'Vertex service-account JSON env is not valid JSON. Put VERTEX_SERVICE_ACCOUNT_JSON on one line (or wrap in single quotes).'
    )
  }
  const credentials = parsed as Partial<ServiceAccountCredentials>
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Vertex service-account JSON must contain client_email and private_key')
  }
  return credentials as ServiceAccountCredentials
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  if (!value || value === 'undefined') return undefined
  return value
}

function validateProject(project: string, paramName: string): string {
  const validation = validateGoogleCloudProject(project, paramName)
  if (!validation.isValid) {
    throw new Error(`Invalid ${paramName}: ${validation.error}`)
  }
  return project
}

function validateLocation(location: string, paramName: string): string {
  const normalized = location.toLowerCase()
  const validation = validateGoogleCloudLocation(normalized, paramName)
  if (!validation.isValid) {
    throw new Error(`Invalid ${paramName}: ${validation.error}`)
  }
  return normalized
}

/**
 * Collects configured Vertex slots for Local Copilot (max 3).
 *
 * Each slot has its own project, location, and service-account JSON:
 * - Slot 0: `VERTEX_PROJECT`, `VERTEX_LOCATION`, `VERTEX_SERVICE_ACCOUNT_JSON`
 * - Slot 1: `VERTEX_PROJECT_1`, `VERTEX_LOCATION_1`, `VERTEX_SERVICE_ACCOUNT_JSON_1`
 * - Slot 2: `VERTEX_PROJECT_2`, `VERTEX_LOCATION_2`, `VERTEX_SERVICE_ACCOUNT_JSON_2`
 *
 * A slot is included when its project env is set. Location falls back to
 * `VERTEX_LOCATION` then `global`. Credentials fall back to the primary SA /
 * `GCS_CREDENTIALS_JSON`, otherwise the SDK uses Application Default Credentials.
 */
export function listLocalCopilotVertexSlots(): LocalCopilotVertexSlot[] {
  const primaryLocation = validateLocation(
    readEnv('VERTEX_LOCATION') || DEFAULT_VERTEX_LOCATION,
    'VERTEX_LOCATION'
  )
  const primaryCredentials =
    parseServiceAccountJson(readEnv('VERTEX_SERVICE_ACCOUNT_JSON')) ??
    parseServiceAccountJson(readEnv('GCS_CREDENTIALS_JSON'))

  const slots: LocalCopilotVertexSlot[] = []
  for (const def of VERTEX_SLOTS) {
    const project =
      readEnv(def.projectEnv) ||
      (def.index === 0 ? primaryCredentials?.project_id?.trim() : undefined)
    if (!project) continue

    const location = validateLocation(
      readEnv(def.locationEnv) || primaryLocation,
      def.locationEnv
    )

    const slotCredentials =
      parseServiceAccountJson(readEnv(def.serviceAccountEnv)) ?? primaryCredentials

    slots.push({
      slot: def.index,
      project: validateProject(project, def.projectEnv),
      location,
      ...(slotCredentials ? { credentials: slotCredentials } : {}),
    })
  }

  return slots
}

/**
 * Picks the next Vertex slot for a Local Copilot LLM request (round-robin).
 */
export function resolveLocalCopilotVertexSlot(): LocalCopilotVertexSlot {
  const slots = listLocalCopilotVertexSlots()
  if (slots.length === 0) {
    throw new Error(VERTEX_NOT_CONFIGURED)
  }
  const index = vertexSlotRotationCounter % slots.length
  vertexSlotRotationCounter += 1
  return slots[index]!
}

/** Resolves the first configured project (for startup logging). */
export function resolveLocalCopilotVertexProject(): string | undefined {
  return listLocalCopilotVertexSlots()[0]?.project
}

/** Resolves location from the first configured slot (or shared default). */
export function resolveLocalCopilotVertexLocation(): string {
  const slots = listLocalCopilotVertexSlots()
  if (slots[0]) return slots[0].location
  return validateLocation(readEnv('VERTEX_LOCATION') || DEFAULT_VERTEX_LOCATION, 'VERTEX_LOCATION')
}

/** True when Local Copilot can attempt Vertex (at least one slot). */
export function isLocalCopilotVertexConfigured(): boolean {
  try {
    return listLocalCopilotVertexSlots().length > 0
  } catch {
    return false
  }
}

export function getLocalCopilotVertexNotConfiguredMessage(): string {
  return VERTEX_NOT_CONFIGURED
}

/** Test-only: reset the round-robin counter. */
export function resetLocalCopilotVertexSlotRotation(): void {
  vertexSlotRotationCounter = 0
}

/** Options when constructing a Local Copilot Vertex client. */
export interface LocalCopilotVertexClientOptions {
  /**
   * Bake Priority PayGo headers into client `httpOptions` so every request
   * on this client hits the shared priority pool.
   */
  priorityPayGo?: boolean
}

const VERTEX_PRIORITY_PAYGO_HTTP_OPTIONS = {
  apiVersion: 'v1',
  headers: {
    'X-Vertex-AI-LLM-Request-Type': 'shared',
    'X-Vertex-AI-LLM-Shared-Request-Type': 'priority',
  },
} as const

function buildVertexClient(
  slot: LocalCopilotVertexSlot,
  options?: LocalCopilotVertexClientOptions
): GoogleGenAI {
  const httpOptions = options?.priorityPayGo ? VERTEX_PRIORITY_PAYGO_HTTP_OPTIONS : undefined

  if (slot.credentials) {
    return new GoogleGenAI({
      vertexai: true,
      project: slot.project,
      location: slot.location,
      ...(httpOptions ? { httpOptions } : {}),
      googleAuthOptions: {
        credentials: slot.credentials,
        scopes: [VERTEX_CLOUD_PLATFORM_SCOPE],
      },
    })
  }

  return new GoogleGenAI({
    vertexai: true,
    project: slot.project,
    location: slot.location,
    ...(httpOptions ? { httpOptions } : {}),
  })
}

/** Last slot handed out by {@link createLocalCopilotVertexClient} (for same-slot Priority rebuilds). */
let lastResolvedVertexSlot: LocalCopilotVertexSlot | null = null

/**
 * Builds a `@google/genai` client pointed at Vertex AI.
 *
 * Round-robins up to three slots, each with its own project, location, and
 * service-account JSON (`VERTEX_*`, `VERTEX_*_1`, `VERTEX_*_2`).
 * Pass `{ priorityPayGo: true }` after a 429 to pin the next slot to the
 * shared priority pool.
 */
export function createLocalCopilotVertexClient(
  options?: LocalCopilotVertexClientOptions
): GoogleGenAI {
  const slot = resolveLocalCopilotVertexSlot()
  lastResolvedVertexSlot = slot
  return buildVertexClient(slot, options)
}

/**
 * Rebuilds a Vertex client for the last resolved slot without advancing
 * rotation — used when escalating a 429 to Priority PayGo on the same account.
 */
export function recreateLocalCopilotVertexClientWithoutRotation(
  options?: LocalCopilotVertexClientOptions
): GoogleGenAI {
  const slot = lastResolvedVertexSlot ?? resolveLocalCopilotVertexSlot()
  lastResolvedVertexSlot = slot
  return buildVertexClient(slot, options)
}
