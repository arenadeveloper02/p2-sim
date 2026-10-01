import type { ArenaGenerativeThemeLanguage } from '@/lib/arena-generative-ui/theme'

interface SpecLike {
  elements?: Record<string, { type?: string }>
}

interface LanguageIntent {
  productType?: string
  visualPriority?: string
}

/**
 * App-wide look from the brief the planner already emitted.
 * Unknown briefs stay operational.
 */
export function visualLanguageFromIntent(
  intent?: LanguageIntent
): ArenaGenerativeThemeLanguage {
  if (
    intent?.visualPriority === 'data' ||
    intent?.productType === 'analytics' ||
    intent?.productType === 'finance'
  ) {
    return 'dense'
  }
  if (intent?.visualPriority === 'content' || intent?.visualPriority === 'discovery') {
    return 'editorial'
  }
  if (intent?.visualPriority === 'task') return 'task'
  return 'operational'
}

/**
 * Page look from the spec. A working list stays operational.
 * A chart page is dense. A form without a collection is task.
 * A lone article is editorial unless the app look is task.
 */
export function resolvePageLanguage(
  spec: SpecLike,
  themeLanguage?: ArenaGenerativeThemeLanguage
): ArenaGenerativeThemeLanguage {
  const types = new Set(
    Object.values(spec.elements ?? {})
      .map((element) => element.type)
      .filter((type): type is string => Boolean(type))
  )
  const hasForm = types.has('Form') || types.has('SearchField') || types.has('Stepper')
  const hasArticle = types.has('DataText') || types.has('Markdown')
  const hasChart = types.has('Chart')
  const hasCollection =
    types.has('Table') || types.has('Repeat') || types.has('Kanban') || types.has('Calendar')
  if (hasForm && !hasCollection) return 'task'
  if (hasChart || (types.has('Stat') && !hasForm)) return 'dense'
  if (hasArticle && !hasCollection && !hasForm) {
    return themeLanguage === 'task' ? 'task' : 'editorial'
  }
  return 'operational'
}
