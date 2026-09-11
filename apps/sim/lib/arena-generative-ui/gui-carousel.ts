/**
 * Slide list for the GUI host Carousel. Prev/next chrome stays in the host.
 */

const SRC_KEYS = ['src', 'url', 'image', 'href', 'poster'] as const
const TITLE_KEYS = ['title', 'name', 'label', 'caption', 'alt'] as const

export interface CarouselSlide {
  item: unknown
  index: number
  src: string
  title: string
  alt: string
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function firstMatchingKey(
  items: readonly unknown[],
  keys: readonly string[],
  accept: (value: unknown) => boolean
): string {
  for (const item of items) {
    const record = recordFromUnknown(item)
    if (!record) continue
    for (const key of keys) {
      if (accept(record[key])) return key
    }
  }
  return keys[0] ?? ''
}

function isHttpUrl(value: unknown): boolean {
  return typeof value === 'string' && /^(https?:)?\/\//i.test(value.trim())
}

export function defaultCarouselSrcField(items: readonly unknown[]): string {
  return firstMatchingKey(items, SRC_KEYS, isHttpUrl)
}

export function defaultCarouselTitleField(
  items: readonly unknown[],
  srcField: string
): string {
  return firstMatchingKey(
    items,
    TITLE_KEYS.filter((key) => key !== srcField),
    (value) => typeof value === 'string' && value.trim().length > 0
  )
}

export function carouselSlidesFromCollection(
  items: readonly unknown[],
  srcField: string,
  titleField: string
): CarouselSlide[] {
  return items.map((item, index) => {
    if (typeof item === 'string') {
      const src = item.trim()
      return { item, index, src, title: src ? `Slide ${index + 1}` : `Item ${index + 1}`, alt: '' }
    }
    const record = recordFromUnknown(item)
    const srcRaw = record?.[srcField]
    const src = typeof srcRaw === 'string' ? srcRaw.trim() : ''
    const titleRaw = record?.[titleField]
    const altRaw = record?.alt
    const title =
      typeof titleRaw === 'string' && titleRaw.trim()
        ? titleRaw.trim()
        : typeof record?.name === 'string' && record.name.trim()
          ? record.name
          : `Slide ${index + 1}`
    const alt = typeof altRaw === 'string' && altRaw.trim() ? altRaw.trim() : title
    return { item, index, src, title, alt }
  })
}
