/**
 * Sim OpenTelemetry - Server-side Instrumentation
 */

import type { Attributes, Context, Link, SpanKind } from '@opentelemetry/api'
import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api'
import type { Sampler, SamplingResult } from '@opentelemetry/sdk-trace-base'
import { createLogger } from '@sim/logger'
import { env } from './lib/core/config/env'

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR)

const logger = createLogger('OTelInstrumentation')

const DEFAULT_TELEMETRY_CONFIG = {
  endpoint: env.TELEMETRY_ENDPOINT || 'https://telemetry.simstudio.ai/v1/traces',
  serviceName: 'sim-studio',
  serviceVersion: '0.1.0',
  serverSide: { enabled: true },
  batchSettings: {
    maxQueueSize: 2048,
    maxExportBatchSize: 512,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: 30000,
  },
}

/**
 * Span name prefixes we want to KEEP
 */
const ALLOWED_SPAN_PREFIXES = [
  'platform.', // Our platform events
  'gen_ai.', // GenAI semantic convention spans
  'workflow.', // Workflow execution spans
  'block.', // Block execution spans
  'http.client.', // Our API block HTTP calls
  'function.', // Function block execution
  'router.', // Router block evaluation
  'condition.', // Condition block evaluation
  'loop.', // Loop block execution
  'parallel.', // Parallel block execution
]

function isBusinessSpan(spanName: string): boolean {
  return ALLOWED_SPAN_PREFIXES.some((prefix) => spanName.startsWith(prefix))
}

async function initializeOpenTelemetry() {
  try {
    if (env.NEXT_TELEMETRY_DISABLED === '1') {
      logger.info('OpenTelemetry disabled via NEXT_TELEMETRY_DISABLED=1')
      return
    }

    let telemetryConfig
    try {
      telemetryConfig = (await import('./telemetry.config')).default
    } catch {
      telemetryConfig = DEFAULT_TELEMETRY_CONFIG
    }

    if (telemetryConfig.serverSide?.enabled === false) {
      logger.info('Server-side OpenTelemetry disabled in config')
      return
    }

    const { NodeSDK } = await import('@opentelemetry/sdk-node')
    const { defaultResource, resourceFromAttributes } = await import('@opentelemetry/resources')
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_DEPLOYMENT_ENVIRONMENT } = await import(
      '@opentelemetry/semantic-conventions/incubating'
    )
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')
    const { BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-node')
    const { ParentBasedSampler, TraceIdRatioBasedSampler, SamplingDecision } = await import(
      '@opentelemetry/sdk-trace-base'
    )

    const createBusinessSpanSampler = (baseSampler: Sampler): Sampler => ({
      shouldSample(
        context: Context,
        traceId: string,
        spanName: string,
        spanKind: SpanKind,
        attributes: Attributes,
        links: Link[]
      ): SamplingResult {
        if (attributes['next.span_type']) {
          return { decision: SamplingDecision.NOT_RECORD }
        }

        if (isBusinessSpan(spanName)) {
          return baseSampler.shouldSample(context, traceId, spanName, spanKind, attributes, links)
        }

        return { decision: SamplingDecision.NOT_RECORD }
      },

      toString(): string {
        return `BusinessSpanSampler{baseSampler=${baseSampler.toString()}}`
      },
    })

    const exporter = new OTLPTraceExporter({
      url: telemetryConfig.endpoint,
      headers: {},
      timeoutMillis: Math.min(telemetryConfig.batchSettings.exportTimeoutMillis, 10000),
      keepAlive: false,
    })

    const batchProcessor = new BatchSpanProcessor(exporter, {
      maxQueueSize: telemetryConfig.batchSettings.maxQueueSize,
      maxExportBatchSize: telemetryConfig.batchSettings.maxExportBatchSize,
      scheduledDelayMillis: telemetryConfig.batchSettings.scheduledDelayMillis,
      exportTimeoutMillis: telemetryConfig.batchSettings.exportTimeoutMillis,
    })

    const resource = defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: telemetryConfig.serviceName,
        [ATTR_SERVICE_VERSION]: telemetryConfig.serviceVersion,
        [ATTR_DEPLOYMENT_ENVIRONMENT]: env.NODE_ENV || 'development',
        'service.namespace': 'sim-ai-platform',
        'telemetry.sdk.name': 'opentelemetry',
        'telemetry.sdk.language': 'nodejs',
        'telemetry.sdk.version': '1.0.0',
      })
    )

    const baseSampler = new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(0.1),
    })
    const sampler = createBusinessSpanSampler(baseSampler)

    const sdk = new NodeSDK({
      resource,
      spanProcessor: batchProcessor,
      sampler,
      traceExporter: exporter,
    })

    sdk.start()

    const shutdownHandler = async () => {
      try {
        await sdk.shutdown()
        logger.info('OpenTelemetry SDK shut down successfully')
      } catch (err) {
        logger.error('Error shutting down OpenTelemetry SDK', err)
      }
    }

    process.on('SIGTERM', shutdownHandler)
    process.on('SIGINT', shutdownHandler)

    logger.info('OpenTelemetry instrumentation initialized with business span filtering')
  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry instrumentation', error)
  }
}

/**
 * Start local scheduler for development environment
 * In production, this is handled by Kubernetes CronJobs
 */
async function startLocalScheduler() {
  // Only run in development and when not in a serverless environment
  if (env.NODE_ENV === 'production' || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return
  }

  try {
    const { Cron } = await import('croner')
    const { env: envConfig } = await import('./lib/core/config/env')

    const cronSecret = envConfig.CRON_SECRET
    if (!cronSecret) {
      logger.warn('CRON_SECRET not configured, local scheduler will not start')
      return
    }

    // Run every minute to check for due schedules
    const cron = new Cron(
      '*/1 * * * *',
      {
        timezone: 'UTC',
        startAt: new Date(Date.now() + 10000), // Start 10 seconds after initialization to ensure app is ready
      },
      async () => {
        try {
          const baseUrl = envConfig.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
          const url = `${baseUrl}/api/schedules/execute`

          // Use built-in fetch (Node.js 18+)
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${cronSecret}`,
              'Content-Type': 'application/json',
            },
          })

          if (!response.ok) {
            const text = await response.text()
            logger.warn(`Schedule execution API returned ${response.status}: ${text}`)
          } else {
            const result = (await response.json()) as { executedCount?: number }
            if (result.executedCount && result.executedCount > 0) {
              logger.info(
                `Schedule execution completed: ${result.executedCount} schedules executed`
              )
            } else {
              logger.debug('Schedule execution completed: no schedules due')
            }
          }
        } catch (error) {
          // Don't log fetch errors during startup - app might not be ready yet
          if (error instanceof Error && !error.message.includes('ECONNREFUSED')) {
            logger.error('Error executing scheduled workflows', error)
          }
        }
      }
    )

    logger.info('Local scheduler started (runs every minute)')

    // Cleanup on process exit
    const shutdown = () => {
      cron.stop()
      logger.info('Local scheduler stopped')
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  } catch (error) {
    logger.error('Failed to start local scheduler', error)
  }
}

export async function register() {
  await initializeOpenTelemetry()
  await startLocalScheduler()
}
