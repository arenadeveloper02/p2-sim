import { ensureInstallableWorkspace } from './lib/lockfile-bootstrap'

const runId = process.argv[2]?.trim() || 'ci-bootstrap'

if (!ensureInstallableWorkspace(runId)) {
  console.error('[bootstrap-lockfile] Workspace is not installable after bootstrap.')
  process.exit(1)
}
