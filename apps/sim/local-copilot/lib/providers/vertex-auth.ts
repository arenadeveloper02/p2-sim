import { GoogleGenAI } from '@google/genai'
import { OAuth2Client } from 'google-auth-library'
import {
  validateGoogleCloudLocation,
  validateGoogleCloudProject,
} from '@/lib/core/security/input-validation'

const DEFAULT_VERTEX_LOCATION = 'global'
const VERTEX_CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

const VERTEX_NOT_CONFIGURED =
  'Vertex AI is not configured on this server. Set VERTEX_PROJECT (and optionally VERTEX_LOCATION). Auth via VERTEX_SERVICE_ACCOUNT_JSON, GCS_CREDENTIALS_JSON, GOOGLE_APPLICATION_CREDENTIALS / ADC, or VERTEX_ACCESS_TOKEN (a ya29.* OAuth access token from `gcloud auth print-access-token`).'

interface ServiceAccountCredentials {
  client_email: string
  private_key: string
  project_id?: string
}

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

/**
 * True when the value looks like a usable Vertex bearer token.
 * Rejects Gemini API keys (`AIza…`) and OAuth auth codes (`4/…`).
 */
export function isVertexOAuthAccessToken(value: string): boolean {
  const token = value.trim()
  if (!token) return false
  if (token.startsWith('AIza')) return false
  if (token.startsWith('4/')) return false
  // User/refresh tokens from gcloud / Google OAuth are typically `ya29.`.
  return token.startsWith('ya29.') || token.length >= 100
}

/** Resolves `VERTEX_PROJECT` (validated). */
export function resolveLocalCopilotVertexProject(): string | undefined {
  const project = process.env.VERTEX_PROJECT?.trim()
  if (!project) return undefined
  const validation = validateGoogleCloudProject(project, 'VERTEX_PROJECT')
  if (!validation.isValid) {
    throw new Error(`Invalid VERTEX_PROJECT: ${validation.error}`)
  }
  return project
}

/** Resolves `VERTEX_LOCATION` (default `global`, validated). */
export function resolveLocalCopilotVertexLocation(): string {
  const location = (process.env.VERTEX_LOCATION?.trim() || DEFAULT_VERTEX_LOCATION).toLowerCase()
  const validation = validateGoogleCloudLocation(location, 'VERTEX_LOCATION')
  if (!validation.isValid) {
    throw new Error(`Invalid VERTEX_LOCATION: ${validation.error}`)
  }
  return location
}

/** True when Local Copilot can attempt Vertex (project is set). */
export function isLocalCopilotVertexConfigured(): boolean {
  return Boolean(process.env.VERTEX_PROJECT?.trim())
}

export function getLocalCopilotVertexNotConfiguredMessage(): string {
  return VERTEX_NOT_CONFIGURED
}

/**
 * Builds a `@google/genai` client pointed at Vertex AI.
 *
 * Auth priority:
 * 1. `VERTEX_SERVICE_ACCOUNT_JSON` or `GCS_CREDENTIALS_JSON`
 * 2. Valid `VERTEX_ACCESS_TOKEN` (`ya29.*` from `gcloud auth print-access-token`)
 * 3. Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS`, Workload Identity, etc.)
 */
export function createLocalCopilotVertexClient(): GoogleGenAI {
  const project = resolveLocalCopilotVertexProject()
  if (!project) {
    throw new Error(VERTEX_NOT_CONFIGURED)
  }
  const location = resolveLocalCopilotVertexLocation()

  const credentials =
    parseServiceAccountJson(process.env.VERTEX_SERVICE_ACCOUNT_JSON) ??
    parseServiceAccountJson(process.env.GCS_CREDENTIALS_JSON)

  if (credentials) {
    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
      googleAuthOptions: {
        credentials,
        scopes: [VERTEX_CLOUD_PLATFORM_SCOPE],
      },
    })
  }

  const accessToken = process.env.VERTEX_ACCESS_TOKEN?.trim()
  if (accessToken) {
    if (!isVertexOAuthAccessToken(accessToken)) {
      throw new Error(
        'VERTEX_ACCESS_TOKEN must be an OAuth access token (usually starts with ya29.). ' +
          'Values starting with 4/ are authorization codes and AIza… are Gemini API keys — neither works with Vertex. ' +
          'Prefer VERTEX_SERVICE_ACCOUNT_JSON, or run: gcloud auth print-access-token'
      )
    }
    const authClient = new OAuth2Client()
    authClient.setCredentials({ access_token: accessToken })
    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
      googleAuthOptions: { authClient },
    })
  }

  return new GoogleGenAI({
    vertexai: true,
    project,
    location,
  })
}
