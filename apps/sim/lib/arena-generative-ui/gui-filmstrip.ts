import {
  collectionItemLabel,
  collectionItemText,
  defaultCollectionTitleField,
} from '@/lib/arena-generative-ui/gui-collection-fields'

export interface FilmstripSlide {
  item: unknown
  index: number
  title: string
  subtitle: string
}

const SUBTITLE_KEYS = ['subtitle', 'temperature_2m', 'temp', 'value', 'hint', 'meta'] as const

export function defaultFilmstripTitleField(items: readonly unknown[]): string {
  return defaultCollectionTitleField(items)
}

export function defaultFilmstripSubtitleField(
  items: readonly unknown[],
  titleField: string
): string {
  for (const item of items) {
    for (const key of SUBTITLE_KEYS) {
      if (key === titleField) continue
      const text = collectionItemText(item, key)
      if (text) return key
    }
  }
  return ''
}

export function filmstripSlidesFromCollection(
  items: readonly unknown[],
  titleField: string,
  subtitleField: string
): FilmstripSlide[] {
  return items.map((item, index) => ({
    item,
    index,
    title: collectionItemLabel(item, index, titleField),
    subtitle: subtitleField ? collectionItemText(item, subtitleField) : '',
  }))
}
