import { truncate } from '@sim/utils/string'
import type { ArenaGenerativeAdoptedChange } from '@/lib/arena-generative-ui/generate-warnings'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'

const ASKED_ADOPTED_MAX = 500

export interface CompiledProductBrief {
  /** Planner/spec honor list. Empty when the brief needs no ChatGPT mapping. */
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
    id: 'dashboard',
    match: (text) =>
      /\b(?:dashboard|kpi|kpis|metrics?\s+grid|weather\s+dashboard|forecast\s+dashboard)\b/i.test(
        text
      ),
    code: 'product-map',
    asked: 'A dashboard of KPIs and forecast series.',
    adopted:
      'Single-page dashboard. Bind current as Stats. Primary visualization is Chart when a bound collection is a numeric series (hourly/daily).',
    honor:
      'Job is a dashboard. One page. Current conditions are bound Stats. Hourly and daily numeric series use Chart (categoryField time, series a bound host key such as temperature_2m) or Table — not a scrolling filmstrip.',
  },
  {
    id: 'nested-cards',
    match: (text) =>
      /\b(?:compact\s+cards|nested\s+cards?|card(?:s)?\s+for\s+(?:the\s+)?(?:daily|hourly|forecast|location)|grouping\s+card)\b/i.test(
        text
      ),
    code: 'product-map',
    asked: 'Cards for locations or daily forecast, often nested in a grouping Card.',
    adopted: 'Repeat of item Cards in a Stack or Grid. Never wrap Repeat of Cards in another Card.',
    honor:
      'Daily/location collections are Repeat of Cards in Stack or Grid. Do not emit a Card that wraps Repeat of Cards.',
  },
  {
    id: 'geolocation',
    match: (text) =>
      /\b(?:geolocation|geo\s*location|navigator\.geolocation|use\s+my\s+location|current\s+location|browser\s+location)\b/i.test(
        text
      ),
    code: 'product-map',
    asked: 'Browser geolocation / use my location.',
    adopted: 'SearchField plus Repeat of geocode hits. No navigator.geolocation.',
    honor:
      'Location lookup is SearchField (actionId on the geocode binding) and Repeat of places. Do not plan browser geolocation.',
  },
  {
    id: 'autocomplete',
    match: (text) =>
      /\b(?:autocomplete|auto-complete|typeahead|as-you-type|as\s+you\s+type|live\s+suggestions?)\b/i.test(
        text
      ),
    code: 'product-map',
    asked: 'Live autocomplete / as-you-type suggestions.',
    adopted: 'SearchField submit. Host has no live suggestion fetch.',
    honor:
      'Search is SearchField submit (or host-local filter when there is no search API). Do not emit Combobox/SearchField.suggestions as a live geocode fetch.',
  },
  {
    id: 'filmstrip',
    match: (text) =>
      /\b(?:filmstrip|horizontal\s+scroll|hourly\s+strip|this\s+hour|carousel\s+of\s+hours)\b/i.test(
        text
      ),
    code: 'product-map',
    asked: 'Horizontal hourly filmstrip / this-hour highlight.',
    adopted: 'Chart or Table bound to hourly. No horizontal scroll except Table.',
    honor:
      'Hourly series is Chart or Table. Do not emit a horizontal filmstrip, carousel of hours, or this-hour highlight chrome.',
  },
  {
    id: 'weather-icons',
    match: (text) =>
      /\b(?:weather\s+icons?|wmo|weather_code|condition\s+icons?|lucide\s+weather)\b/i.test(text),
    code: 'product-drop',
    asked: 'Weather icons / WMO weather_code glyphs.',
    adopted: 'Omitted. Icon enum has no weather set. Show condition as bound text if present.',
    honor:
      'Do not emit weather icons or a WMO weather_code map. Condition is bound Text if the schema has it.',
  },
  {
    id: 'persist',
    match: (text) =>
      /\b(?:localstorage|local\s+storage|persist(?:ed|ence)?|remember\s+(?:last\s+)?(?:city|location|unit)|save\s+last\s+city)\b/i.test(
        text
      ),
    code: 'product-drop',
    asked: 'Persist last city / unit in localStorage.',
    adopted: 'Dropped. Host has no app localStorage besides Sim theme.',
    honor: 'Do not plan persistence, last-city memory, or localStorage.',
  },
  {
    id: 'units',
    match: (text) =>
      /(?:°\s*[cf]\b|degrees?\s*(?:celsius|fahrenheit)|[cf]elsius|[cf]ahrenheit|unit\s+toggle|\bc\s*\/\s*f\b)/i.test(
        text
      ),
    code: 'product-drop',
    asked: 'Client °C/°F conversion or unit toggle.',
    adopted: 'Dropped. Bind the API’s units. No client math or in-app unit toggle.',
    honor: 'Do not plan a unit toggle or client °C/°F conversion. Bind numbers the API returns.',
  },
  {
    id: 'data-states',
    match: (text) =>
      /\b(?:data[- ]states?|seven\s+(?:custom\s+)?(?:data[- ]?)?states?|skeleton\s+screens?|searching\s+locations|loading\s+weather)\b/i.test(
        text
      ),
    code: 'product-drop',
    asked: 'Custom skeleton / seven data-state screens.',
    adopted: 'Dropped. Host paints skeleton, emptyText, error banner, and Retry.',
    honor:
      'Do not emit Spinner, Alert, Toast, or custom data-state screens. Host owns wait, empty, error, and Retry.',
  },
  {
    id: 'visual-system',
    match: (text) =>
      /\b(?:custom\s+visual|hex\s*#|brand\s+color|#(?:[0-9a-f]{3}|[0-9a-f]{6})\b|custom\s+logo|weather-influenced|motion\s+system|light\s*\/\s*dark\s+toggle|in-app\s+(?:light|dark|theme))\b/i.test(
        text
      ),
    code: 'product-drop',
    asked: 'Custom hex, logo, motion, or in-app light/dark toggle.',
    adopted: 'Dropped. Theme follows Sim. No custom CSS, logo, or motion.',
    honor:
      'Do not emit hex, fonts, CSS, a logo, custom motion, or an in-app theme toggle. Design system is host-owned.',
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

const HONOR_HEADER = [
  'COMPILED HONOR LIST (Arena catalog host — implement these mappings.',
  'User request still supplies names and copy.',
  'Do not treat React, CSS, geolocation, persistence, or custom data-state screens as product scope.)',
].join(' ')

function clip(value: string): string {
  return truncate(value, ASKED_ADOPTED_MAX)
}

function outputFieldBlob(bindings: readonly ArenaGenerativeApiBinding[]): string {
  return bindings
    .flatMap((binding) => (binding.outputSchema ?? []).map((field) => field.name))
    .join(' ')
}

function chartHonorForBindings(blob: string): string | undefined {
  if (/\bhourly\b/i.test(blob) && /\btemperature_2m\b/i.test(blob)) {
    return 'When hourly is bound, Chart uses statePath hourly, categoryField time, series temperature_2m.'
  }
  if (/\bhourly\b/i.test(blob)) {
    return 'When hourly is bound, Chart uses statePath hourly and a numeric series host key from that collection.'
  }
  return undefined
}

/**
 * Maps a ChatGPT-style product spec onto Arena catalog/host behavior.
 * Does not rewrite User Input. Empty when the brief has nothing to compile.
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
  const matched: CompileRule[] = COMPILE_RULES.filter((rule) => rule.match(text, blob))
  if (matched.length === 0) {
    return { honorPrompt: '', adoptedChanges: [] }
  }

  const honorLines = matched.map((rule) => `- ${rule.honor}`)
  const chartLine = chartHonorForBindings(blob)
  if (chartLine && matched.some((rule) => rule.id === 'dashboard' || rule.id === 'filmstrip')) {
    honorLines.push(`- ${chartLine}`)
  }

  return {
    honorPrompt: [HONOR_HEADER, ...honorLines].join('\n'),
    adoptedChanges: matched.map((rule) => ({
      code: rule.code,
      asked: clip(rule.asked),
      adopted: clip(rule.adopted),
    })),
  }
}
