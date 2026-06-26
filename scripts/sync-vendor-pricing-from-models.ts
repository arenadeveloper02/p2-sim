#!/usr/bin/env bun
/**
 * Compare `apps/sim/config/vendor-pricing.json` SKU rates against canonical Sim pricing
 * in `apps/sim/providers/models.ts` and billing constants.
 *
 * Usage:
 *   bun run vendor-pricing:check          # report drift, exit 1 if any
 *   bun run vendor-pricing:sync           # update syncable SKU fields from models.ts
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE_EXECUTION_CHARGE } from '../apps/sim/lib/billing/constants.ts'
import {
  EMBEDDING_MODEL_PRICING,
  PROVIDER_DEFINITIONS,
  RERANK_MODEL_PRICING,
} from '../apps/sim/providers/models.ts'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(SCRIPT_DIR, '..')
const PRICING_PATH = resolve(ROOT, 'apps/sim/config/vendor-pricing.json')

const RATE_EPSILON = 1e-9

interface PricingSource {
  kind: string
  url?: string
  path?: string
  verifiedAt?: string
}

interface VendorSku {
  id: string
  subscriptionId: string
  type: string
  modelId?: string
  unit: string
  inputUsd?: number
  outputUsd?: number
  cachedInputUsd?: number
  usdPerUnit?: number
  pricingSource: PricingSource
  simReference?: string
  vendorPlanNote?: string
  usedIn: string[]
}

interface VendorPricingFile {
  meta: { updatedAt: string; currency: string; maintainer?: string }
  subscriptions: unknown[]
  skus: VendorSku[]
}

interface ModelRates {
  input: number
  output: number
  cachedInput?: number
}

function findProviderModelPricing(modelId: string): ModelRates | null {
  for (const provider of Object.values(PROVIDER_DEFINITIONS)) {
    for (const model of provider.models) {
      if (model.id === modelId) {
        return {
          input: model.pricing.input,
          output: model.pricing.output,
          ...(model.pricing.cachedInput != null ? { cachedInput: model.pricing.cachedInput } : {}),
        }
      }
    }
  }

  const embedding = EMBEDDING_MODEL_PRICING[modelId]
  if (embedding) {
    return { input: embedding.input, output: embedding.output }
  }

  return null
}

function findRerankUsdPerUnit(modelId: string): number | null {
  return RERANK_MODEL_PRICING[modelId]?.perSearchUnit ?? null
}

function ratesEqual(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined && b === undefined) return true
  if (a === undefined || b === undefined) return false
  return Math.abs(a - b) <= RATE_EPSILON
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function resolveCanonicalRates(sku: VendorSku): ModelRates | { usdPerUnit: number } | null {
  if (sku.id === 'sim/workflow-base-fee') {
    return { usdPerUnit: BASE_EXECUTION_CHARGE }
  }

  if (sku.type === 'rerank_unit' && sku.modelId) {
    const perUnit = findRerankUsdPerUnit(sku.modelId)
    return perUnit != null ? { usdPerUnit: perUnit } : null
  }

  if (sku.modelId && (sku.type === 'llm_tokens' || sku.type === 'embedding_tokens')) {
    const rates = findProviderModelPricing(sku.modelId)
    return rates
  }

  return null
}

function formatDrift(sku: VendorSku, field: string, jsonValue: number, canonical: number): string {
  return `  - ${sku.id}: ${field} json=${jsonValue} models.ts=${canonical}`
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check')
  const write = process.argv.includes('--write')

  if (checkOnly && write) {
    console.error('Use either --check or --write, not both.')
    process.exit(1)
  }

  const raw = await readFile(PRICING_PATH, 'utf8')
  const pricing = JSON.parse(raw) as VendorPricingFile

  const drifts: string[] = []
  let updated = 0

  for (const sku of pricing.skus) {
    const canonical = resolveCanonicalRates(sku)
    if (!canonical) continue

    if ('usdPerUnit' in canonical) {
      if (sku.usdPerUnit === undefined) continue
      if (!ratesEqual(sku.usdPerUnit, canonical.usdPerUnit)) {
        drifts.push(formatDrift(sku, 'usdPerUnit', sku.usdPerUnit, canonical.usdPerUnit))
        if (write) {
          sku.usdPerUnit = canonical.usdPerUnit
          updated++
        }
      }
      continue
    }

    if (sku.inputUsd !== undefined && !ratesEqual(sku.inputUsd, canonical.input)) {
      drifts.push(formatDrift(sku, 'inputUsd', sku.inputUsd, canonical.input))
      if (write) sku.inputUsd = canonical.input
    }
    if (sku.outputUsd !== undefined && !ratesEqual(sku.outputUsd, canonical.output)) {
      drifts.push(formatDrift(sku, 'outputUsd', sku.outputUsd, canonical.output))
      if (write) sku.outputUsd = canonical.output
    }
    if (
      sku.cachedInputUsd !== undefined &&
      canonical.cachedInput !== undefined &&
      !ratesEqual(sku.cachedInputUsd, canonical.cachedInput)
    ) {
      drifts.push(formatDrift(sku, 'cachedInputUsd', sku.cachedInputUsd, canonical.cachedInput))
      if (write) sku.cachedInputUsd = canonical.cachedInput
    }

    if (write && (canonical.input !== undefined || canonical.output !== undefined)) {
      const touched =
        sku.inputUsd === canonical.input ||
        sku.outputUsd === canonical.output ||
        (canonical.cachedInput != null && sku.cachedInputUsd === canonical.cachedInput)
      if (touched) {
        sku.pricingSource = {
          ...sku.pricingSource,
          kind: 'sim_models_ts',
          path: sku.pricingSource.path ?? 'apps/sim/providers/models.ts',
          verifiedAt: todayIsoDate(),
        }
        updated++
      }
    }
  }

  if (write && updated > 0) {
    pricing.meta.updatedAt = todayIsoDate()
    await writeFile(PRICING_PATH, `${JSON.stringify(pricing, null, 2)}\n`, 'utf8')
    console.log(`Updated ${updated} SKU field(s) in ${PRICING_PATH}`)
  }

  if (drifts.length === 0) {
    console.log('vendor-pricing.json is in sync with models.ts for tracked SKUs.')
    return
  }

  console.log(`Pricing drift detected (${drifts.length}):`)
  for (const line of drifts) console.log(line)

  if (!write) {
    console.log('\nRun `bun run vendor-pricing:sync` to update syncable fields from models.ts.')
  }

  if (checkOnly || (!write && drifts.length > 0)) {
    process.exit(1)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
