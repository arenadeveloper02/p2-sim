import { randomBytes } from 'node:crypto'

/** S3 prefix for organization whitelabel logos and wordmarks. */
export const ORG_LOGOS_S3_PREFIX = 'SIM_ORG_LOGOS'

/**
 * Build a unique S3 object key for an organization logo under {@link ORG_LOGOS_S3_PREFIX}.
 */
export function generateOrgLogoFileKey(organizationId: string, fileName: string): string {
  const timestamp = Date.now()
  const uniqueId = randomBytes(8).toString('hex')
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  return `${ORG_LOGOS_S3_PREFIX}/${organizationId}/${timestamp}-${uniqueId}-${safeFileName}`
}

/**
 * Extract the organization id embedded in an org-logo storage key.
 */
export function extractOrganizationIdFromOrgLogoKey(key: string): string | null {
  const match = key.match(new RegExp(`^${ORG_LOGOS_S3_PREFIX}/([^/]+)/`))
  return match?.[1] ?? null
}
