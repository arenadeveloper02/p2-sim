/**
 * Idempotent KEY=value upsert for dotenv-style files.
 * Preserves comments and surrounding lines; appends when the key is missing.
 */
export function upsertEnvVar(contents: string, key: string, value: string): string {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
    throw new Error(`Invalid env key: ${key}`)
  }
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  if (pattern.test(contents)) {
    return contents.replace(pattern, line)
  }
  const trimmed = contents.replace(/\s*$/, '')
  if (!trimmed) return `${line}\n`
  return `${trimmed}\n\n${line}\n`
}
