import type { BrainEvent } from '@/protocol'

/**
 * Serializes BrainEvents into an SSE byte stream.
 *
 * Each event is written as a single `data: <json>\n\n` frame so the Sim adapter
 * can parse it line-by-line and forward it to the browser unchanged.
 */
export class SSEWriter {
  private readonly encoder = new TextEncoder()
  private closed = false

  constructor(private readonly controller: ReadableStreamDefaultController<Uint8Array>) {}

  write(event: BrainEvent): void {
    if (this.closed) return
    const frame = `data: ${JSON.stringify(event)}\n\n`
    this.controller.enqueue(this.encoder.encode(frame))
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    try {
      this.controller.close()
    } catch {
      // Controller may already be closed if the client disconnected.
    }
  }

  get isClosed(): boolean {
    return this.closed
  }
}
