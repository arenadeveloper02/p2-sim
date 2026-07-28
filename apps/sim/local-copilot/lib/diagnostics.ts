/**
 * Lightweight process memory snapshot for Arena Copilot diagnostics in production.
 */
export function getLocalCopilotMemorySnapshot(): {
  heapUsedMB: number
  rssMB: number
  externalMB: number
  uptimeSec: number
} {
  const mem = process.memoryUsage()
  return {
    heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
    rssMB: Math.round(mem.rss / (1024 * 1024)),
    externalMB: Math.round(mem.external / (1024 * 1024)),
    uptimeSec: Math.round(process.uptime()),
  }
}
