/**
 * Static pricing coverage check for representative Arena model IDs.
 * Complements the DB reconciliation script when no execution data is available.
 *
 * Usage: bun run scripts/phase0-arena-pricing-coverage.ts
 */
import { getHostedModels, getModelPricing } from '../apps/sim/providers/models'
import { calculateCost, shouldBillModelUsage } from '../apps/sim/providers/utils'

/** Representative models used across Arena workflows, copilot, and agent defaults. */
const REPRESENTATIVE_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'o1',
  'o3-mini',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-sonnet-4-5-20250514',
  'claude-opus-4-6',
  'claude-3-7-sonnet-latest',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'grok-4-latest',
  'deepseek-v3',
  'mothership',
  'azure-anthropic/claude-sonnet-4-5',
  'vertex/gemini-2.5-pro',
  'bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0',
] as const

function main() {
  console.log('\n=== Phase 0 Arena Pricing Coverage (static) ===\n')

  const hosted = new Set(getHostedModels().map((m) => m.toLowerCase()))

  console.log('Model ID'.padEnd(55), 'hosted', 'billable', 'pricing', 'sample $/1M in+out')
  console.log('-'.repeat(100))

  for (const model of REPRESENTATIVE_MODELS) {
    const pricing = getModelPricing(model)
    const isHosted = hosted.has(model.toLowerCase())
    const billable = shouldBillModelUsage(model)
    const sample = calculateCost(model, 1_000_000, 1_000_000)
    const pricingFound = pricing != null && sample.total > 0

    console.log(
      model.padEnd(55),
      String(isHosted).padStart(6),
      String(billable).padStart(8),
      String(pricingFound).padStart(7),
      `$${sample.total.toFixed(4)}`.padStart(18)
    )
  }

  console.log('\n--- Notes ---')
  console.log(`Hosted model count in catalog: ${hosted.size}`)
  console.log(
    'Models with shouldBill=true but $0 calculateCost are pricing gaps (Phase 2 normalization target).'
  )
  console.log(
    'Non-hosted models (BYOK/user key) always get output.cost.total=0 from executeProviderRequest.'
  )
  console.log(
    'Copilot/mothership billing uses Go-computed cost on stream complete — not Sim providers/*.'
  )
}

main()
