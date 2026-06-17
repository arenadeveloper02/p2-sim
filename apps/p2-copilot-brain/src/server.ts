import { runAgentLoop } from '@/agent/loop'
import type { BrainChatRequest } from '@/protocol'
import { SSEWriter } from '@/stream/writer'

const PORT = Number(process.env.P2_COPILOT_BRAIN_PORT ?? process.env.PORT ?? 3010)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function validateRequest(body: unknown): body is BrainChatRequest {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    typeof b.requestId === 'string' &&
    typeof b.model === 'string' &&
    typeof b.apiKey === 'string' &&
    (b.provider === 'openai' || b.provider === 'anthropic') &&
    Array.isArray(b.messages) &&
    Array.isArray(b.tools) &&
    typeof b.toolExec === 'object' &&
    b.toolExec !== null
  )
}

async function handleChat(req: Request): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  if (!validateRequest(body)) {
    return jsonResponse({ error: 'Invalid chat request payload' }, 400)
  }

  const request = body as BrainChatRequest

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sse = new SSEWriter(controller)
      try {
        await runAgentLoop(request, sse)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Brain agent loop failed'
        console.error(`[brain] request ${request.requestId} failed:`, error)
        sse.write({ type: 'error', message })
        sse.write({ type: 'complete', status: 'error', message })
      } finally {
        sse.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === '/health') {
      return jsonResponse({ status: 'ok', service: 'p2-copilot-brain' })
    }

    if (url.pathname === '/v1/chat' && req.method === 'POST') {
      return handleChat(req)
    }

    return jsonResponse({ error: 'Not found' }, 404)
  },
})

console.log(`[brain] p2-copilot-brain listening on http://localhost:${server.port}`)
