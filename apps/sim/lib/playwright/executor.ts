import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { annotateAriaSnapshotWithRefs } from '@/lib/playwright/snapshot'
import type {
  PlaywrightRefEntry,
  PlaywrightRunOptions,
  PlaywrightRunResult,
  PlaywrightStep,
  PlaywrightStepResult,
} from '@/lib/playwright/types'
import { validateUrlWithDNS } from '@/lib/core/security/input-validation.server'

const logger = createLogger('PlaywrightExecutor')

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_STEPS = 50

async function resolveLocator(page: Page, step: PlaywrightStep, refs: Map<string, PlaywrightRefEntry>) {
  if (step.selector) {
    return page.locator(step.selector).first()
  }

  if (!step.ref) {
    throw new Error('Step requires ref or selector')
  }

  const entry = refs.get(step.ref)
  if (!entry) {
    throw new Error(`Element ref "${step.ref}" not found. Run a snapshot step first.`)
  }

  const role = entry.role as Parameters<Page['getByRole']>[0]
  if (entry.name) {
    return page.getByRole(role, { name: entry.name, exact: true }).first()
  }
  return page.getByRole(role).first()
}

async function executeStep(
  page: Page,
  step: PlaywrightStep,
  refs: Map<string, PlaywrightRefEntry>
): Promise<PlaywrightStepResult> {
  const base: PlaywrightStepResult = { type: step.type, success: true }

  try {
    switch (step.type) {
      case 'navigate': {
        if (!step.url) throw new Error('navigate step requires url')
        const urlValidation = await validateUrlWithDNS(step.url, 'url', { allowHttp: true })
        if (!urlValidation.isValid) {
          throw new Error(urlValidation.error ?? 'Invalid navigation URL')
        }
        await page.goto(step.url, {
          waitUntil: 'domcontentloaded',
        })
        return { ...base, url: page.url() }
      }
      case 'snapshot': {
        refs.clear()
        const rawSnapshot = await page.ariaSnapshot()
        const snapshot = annotateAriaSnapshotWithRefs(rawSnapshot, refs)
        return { ...base, snapshot, url: page.url() }
      }
      case 'click': {
        const locator = await resolveLocator(page, step, refs)
        await locator.click({ timeout: 30_000 })
        return { ...base, url: page.url() }
      }
      case 'type': {
        if (!step.text) throw new Error('type step requires text')
        const locator = await resolveLocator(page, step, refs)
        await locator.fill(step.text, { timeout: 30_000 })
        if (step.submit) {
          await locator.press('Enter')
        }
        return { ...base, url: page.url() }
      }
      case 'screenshot': {
        const buffer = await page.screenshot({
          fullPage: step.fullPage ?? false,
          type: 'png',
        })
        return {
          ...base,
          screenshot: buffer.toString('base64'),
          url: page.url(),
        }
      }
      case 'wait': {
        if (step.text) {
          await page.getByText(step.text, { exact: false }).first().waitFor({
            state: 'visible',
            timeout: step.timeMs ?? 30_000,
          })
        } else if (step.timeMs) {
          await page.waitForTimeout(step.timeMs)
        } else {
          throw new Error('wait step requires text or timeMs')
        }
        return { ...base, url: page.url() }
      }
      case 'press': {
        if (!step.key) throw new Error('press step requires key')
        await page.keyboard.press(step.key)
        return { ...base, url: page.url() }
      }
      default:
        throw new Error(`Unsupported step type: ${(step as PlaywrightStep).type}`)
    }
  } catch (error) {
    return {
      ...base,
      success: false,
      error: getErrorMessage(error, 'Step failed'),
      url: page.url(),
    }
  }
}

/**
 * Runs browser automation steps in a single Playwright session.
 */
export async function runPlaywrightSteps(options: PlaywrightRunOptions): Promise<PlaywrightRunResult> {
  const steps = options.steps.slice(0, MAX_STEPS)
  if (steps.length === 0) {
    throw new Error('At least one automation step is required')
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let browser: Browser | null = null
  const refs = new Map<string, PlaywrightRefEntry>()
  const stepResults: PlaywrightStepResult[] = []

  try {
    try {
      browser = await chromium.launch({
        headless: options.headless !== false,
        timeout: 60_000,
      })
    } catch (error) {
      throw new Error(
        `Failed to launch Chromium. Install browsers with "bunx playwright install chromium". ${getErrorMessage(error)}`
      )
    }
    const context = await browser.newContext()
    const page = await context.newPage()
    page.setDefaultTimeout(timeoutMs)

    for (const step of steps) {
      const result = await executeStep(page, step, refs)
      stepResults.push(result)
      if (!result.success) break
    }

    const lastSnapshot = [...stepResults].reverse().find((r) => r.snapshot)?.snapshot
    return {
      stepResults,
      finalSnapshot: lastSnapshot,
      finalUrl: page.url(),
    }
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch (error) {
        logger.warn('Failed to close Playwright browser', { error: getErrorMessage(error) })
      }
    }
  }
}
