/**
 * Reads a fetch Response body as JSON, with a clear error when the body is HTML or invalid.
 */
export async function readJsonResponse<T extends Record<string, unknown> = Record<string, unknown>>(
  response: Response,
  context: string
): Promise<T> {
  const text = await response.text()
  const trimmed = text.trim()

  if (!trimmed || trimmed.startsWith('<')) {
    throw new Error(
      `${context} returned non-JSON (${response.status}): ${trimmed.slice(0, 300)}`
    )
  }

  try {
    return JSON.parse(trimmed) as T
  } catch {
    throw new Error(
      `${context} returned invalid JSON (${response.status}): ${trimmed.slice(0, 300)}`
    )
  }
}
