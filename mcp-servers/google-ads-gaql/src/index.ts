/**
 * Google Ads GAQL MCP Server
 * Exposes GAQL schema discovery and validation tools over Streamable HTTP transport.
 */

import 'dotenv/config'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { randomUUID } from 'node:crypto'
import { createServer, IncomingMessage, ServerResponse } from 'node:http'

import {
  handleGetSchema,
  handleGetResources,
  handleGetResource,
  handleGetMetrics,
  handleGetSegments,
  handleGetRules,
  handleValidateQuery,
  handleGetSchemaForPrompt,
  handleRefreshCache,
  handleGetCacheStatus,
} from './tools/handlers.js'
import { prewarmSchema } from './services/schema-cache.js'

const SERVER_NAME = 'google-ads-gaql'
const SERVER_VERSION = '1.0.0'

const TOOL_DEFS = [
  {
    name: 'get_schema',
    description:
      'Get the complete Google Ads GAQL schema (all resources, metrics, segments, and rules). Use this once at the start of GAQL generation to understand the full surface.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'get_schema_for_prompt',
    description:
      'Get a compact human-readable schema reference formatted for injection into an LLM system prompt. Pass the "resource" parameter to filter metrics by compatibility.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        resource: { type: 'string', description: 'Optional: Filter metrics compatible with this FROM resource (e.g., campaign, ad_group, keyword_view). This prevents PROHIBITED_METRIC errors.' },
      },
    },
  },
  {
    name: 'get_resources',
    description: 'List Google Ads GAQL resources (tables). Optional filter by category or search.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', description: 'Filter by category (e.g., campaign, ad_group, asset, search_term, geographic, demographic, shopping, change_history)' },
        search: { type: 'string', description: 'Search resource names, descriptions, and fields' },
      },
    },
  },
  {
    name: 'get_resource',
    description: 'Get full details for a single GAQL resource by name (fields, required fields, support for segments.date and metrics).',
    inputSchema: {
      type: 'object' as const,
      properties: { name: { type: 'string', description: 'Resource name (e.g., campaign, keyword_view, ad_group_ad)' } },
      required: ['name'],
    },
  },
  {
    name: 'get_metrics',
    description: 'List Google Ads GAQL metrics compatible with a specific resource. REQUIRED: Pass the "resource" parameter matching your FROM clause.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        resource: { type: 'string', description: 'REQUIRED: Filter metrics compatible with this FROM resource (e.g., campaign, ad_group, keyword_view). This prevents PROHIBITED_METRIC errors.' },
        category: { type: 'string', description: 'Optional: Filter by category (e.g., core, rate, video, quality, impression_share)' },
        search: { type: 'string', description: 'Optional: Search metric names and descriptions' },
      },
      required: ['resource'],
    },
  },
  {
    name: 'get_segments',
    description: 'List Google Ads GAQL segments compatible with a specific resource. REQUIRED: Pass the "resource" parameter matching your FROM clause.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        resource: { type: 'string', description: 'REQUIRED: Filter segments compatible with this FROM resource (e.g., campaign, ad_group, keyword_view). This prevents PROHIBITED_SEGMENT errors.' },
        category: { type: 'string', description: 'Optional: Filter by category (e.g., date, device, network, geographic, product, search, conversion)' },
        search: { type: 'string', description: 'Optional: Search segment names and descriptions' },
      },
      required: ['resource'],
    },
  },
  {
    name: 'get_rules',
    description: 'Get the list of GAQL quality gates and validation rules.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'validate_query',
    description: 'Validate a GAQL query against schema rules. Returns errors and warnings.',
    inputSchema: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'GAQL query to validate' } },
      required: ['query'],
    },
  },
  {
    name: 'refresh_cache',
    description:
      'Force refresh the live GAQL schema cache from GoogleAdsFieldService. Use after Google Ads ships new fields/resources.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'cache_status',
    description: 'Return the current schema cache metadata (source, API version, expiry, counts).',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
]

function createMcpServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params

    let result: unknown
    switch (name) {
      case 'get_schema':
        result = await handleGetSchema()
        break
      case 'get_schema_for_prompt':
        result = await handleGetSchemaForPrompt(args as { resource?: string })
        break
      case 'get_resources':
        result = await handleGetResources(args as { category?: string; search?: string })
        break
      case 'get_resource':
        result = await handleGetResource(args as { name: string })
        break
      case 'get_metrics':
        result = await handleGetMetrics(args as { category?: string; search?: string; resource?: string })
        break
      case 'get_segments':
        result = await handleGetSegments(args as { category?: string; search?: string; resource?: string })
        break
      case 'get_rules':
        result = handleGetRules()
        break
      case 'validate_query':
        result = await handleValidateQuery(args as { query: string })
        break
      case 'refresh_cache':
        result = await handleRefreshCache()
        break
      case 'cache_status':
        result = handleGetCacheStatus()
        break
      default:
        throw new Error(`Unknown tool: ${name}`)
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  })

  return server
}

const PORT = Number(process.env.PORT ?? 3333)
const HOST = process.env.HOST ?? '0.0.0.0'

async function startServer(): Promise<void> {
  const transports = new Map<string, StreamableHTTPServerTransport>()

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

    // Health check
    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', name: SERVER_NAME, version: SERVER_VERSION }))
      return
    }

    if (url.pathname !== '/mcp') {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    try {
      const sessionId = (req.headers['mcp-session-id'] as string | undefined) ?? undefined
      let transport = sessionId ? transports.get(sessionId) : undefined

      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            transports.set(sid, transport!)
          },
        })

        const server = createMcpServer()
        await server.connect(transport)
      }

      await transport.handleRequest(req, res)
    } catch (err) {
      console.error('Request handling error:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: (err as Error).message }))
      }
    }
  })

  httpServer.listen(PORT, HOST, () => {
    console.log(`[${SERVER_NAME}] MCP server listening on http://${HOST}:${PORT}/mcp`)
    console.log(`[${SERVER_NAME}] Health: http://${HOST}:${PORT}/health`)
    console.log(`[${SERVER_NAME}] Tools: ${TOOL_DEFS.map((t) => t.name).join(', ')}`)
  })

  // Prewarm schema cache in background so first tool call is fast.
  void prewarmSchema()
}

startServer().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
