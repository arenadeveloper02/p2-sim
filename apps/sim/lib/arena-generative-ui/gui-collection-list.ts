import {
  collectionItemLabel,
  collectionItemText,
  defaultCollectionTitleField,
} from '@/lib/arena-generative-ui/gui-collection-fields'

export interface CollectionListRow {
  item: unknown
  index: number
  title: string
  body: string
}

const BODY_KEYS = ['body', 'description', 'text', 'content', 'subtitle'] as const

export function defaultCollectionListTitleField(items: readonly unknown[]): string {
  return defaultCollectionTitleField(items)
}

export function defaultCollectionListBodyField(
  items: readonly unknown[],
  titleField: string
): string {
  for (const item of items) {
    for (const key of BODY_KEYS) {
      if (key === titleField) continue
      const text = collectionItemText(item, key)
      if (text) return key
    }
  }
  return ''
}

export function collectionListRowsFromCollection(
  items: readonly unknown[],
  titleField: string,
  bodyField: string
): CollectionListRow[] {
  return items.map((item, index) => ({
    item,
    index,
    title: collectionItemLabel(item, index, titleField),
    body: bodyField ? collectionItemText(item, bodyField) : '',
  }))
}
