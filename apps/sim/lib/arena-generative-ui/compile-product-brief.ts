import { truncate } from '@sim/utils/string'
import type { ArenaGenerativeAdoptedChange } from '@/lib/arena-generative-ui/generate-warnings'
import { hasPositiveAsk } from '@/lib/arena-generative-ui/positive-ask'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'

const ASKED_ADOPTED_MAX = 500

export interface CompiledProductBrief {
  /** Host limits the planner must not plan. Empty when the brief hits none. */
  honorPrompt: string
  adoptedChanges: ArenaGenerativeAdoptedChange[]
}

interface CompileRule {
  id: string
  match: (text: string, blob: string) => boolean
  code: 'product-map' | 'product-drop'
  asked: string
  adopted: string
  honor: string
}

const COMPILE_RULES: readonly CompileRule[] = [
  {
    id: 'geolocation',
    match: (text) =>
      hasPositiveAsk(
        text,
        /\b(?:geolocation|geo\s*location|navigator\.geolocation|use\s+my\s+location|browser\s+location)\b/i
      ),
    code: 'product-drop',
    asked: 'Browser geolocation / use my location.',
    adopted: 'Dropped. The host cannot read browser geolocation.',
    honor: 'Do not plan browser geolocation or navigator.geolocation.',
  },
  {
    id: 'persist',
    match: (text) =>
      hasPositiveAsk(
        text,
        /\b(?:localstorage|local\s+storage|remember\s+(?:last\s+)?(?:city|location|unit)|save\s+last\s+city|persist(?:ed)?\s+(?:last\s+)?(?:city|location|unit))\b/i
      ),
    code: 'product-drop',
    asked: 'Persist last city / unit in localStorage.',
    adopted: 'Dropped. Host has no app localStorage besides Sim theme.',
    honor: 'Do not plan persistence, last-city memory, or localStorage.',
  },
  {
    id: 'units',
    match: (text) =>
      hasPositiveAsk(
        text,
        /(?:unit\s+toggle|°\s*c\s*\/\s*°?\s*f|\bc\s*\/\s*f\b|convert(?:ing)?\s+(?:between\s+)?(?:°?\s*[cf]|celsius|fahrenheit))/i
      ),
    code: 'product-drop',
    asked: 'Client °C/°F conversion or unit toggle.',
    adopted: 'Dropped. Bind the API’s units. No client math or in-app unit toggle.',
    honor: 'Do not plan a unit toggle or client °C/°F conversion. Bind numbers the API returns.',
  },
  {
    id: 'react-tree',
    match: (text) =>
      /\b(?:src\/(?:components|lib|services)|react\s+service\s+layer|next\.js|create-react-app|components\s+in\s+src)\b/i.test(
        text
      ),
    code: 'product-drop',
    asked: 'A React/Next source tree or service layer.',
    adopted: 'Ignored. Generate emits catalog JSON, not a codebase.',
    honor:
      'This is a catalog json-render app, not a React codebase. Do not plan files, services, or src/components.',
  },
]

const HONOR_HEADER =
  'COMPILED HONOR LIST (host limits only: no React source tree, no browser geolocation, no localStorage, no client unit math. These are not a sitemap.)'

function clip(value: string): string {
  return truncate(value, ASKED_ADOPTED_MAX)
}

function outputFieldBlob(bindings: readonly ArenaGenerativeApiBinding[]): string {
  return bindings
    .flatMap((binding) => (binding.outputSchema ?? []).map((field) => field.name))
    .join(' ')
}

/**
 * Notes the host limits a prompt asked for. Does not rewrite the prompt into a catalog layout.
 */
export function compileProductBrief(
  userInput: string,
  bindings: readonly ArenaGenerativeApiBinding[] = []
): CompiledProductBrief {
  const text = userInput.trim()
  if (!text) {
    return { honorPrompt: '', adoptedChanges: [] }
  }
  const blob = outputFieldBlob(bindings)
  const matched = COMPILE_RULES.filter((rule) => rule.match(text, blob))
  if (matched.length === 0) {
    return { honorPrompt: '', adoptedChanges: [] }
  }

  return {
    honorPrompt: [HONOR_HEADER, ...matched.map((rule) => `- ${rule.honor}`)].join('\n'),
    adoptedChanges: matched.map((rule) => ({
      code: rule.code,
      asked: clip(rule.asked),
      adopted: clip(rule.adopted),
    })),
  }
}
