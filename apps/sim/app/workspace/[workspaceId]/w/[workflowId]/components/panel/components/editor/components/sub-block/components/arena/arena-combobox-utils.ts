import type { ComboboxOption } from '@/components/emcn'

/**
 * If the stored value is not in the fetched list (stale or loading), add a display row
 * so the emcn Combobox can still resolve the label.
 */
export function mergeArenaComboboxOptions(
  options: ComboboxOption[],
  selectedKey: string | undefined,
  fallbackLabel: string | undefined
): ComboboxOption[] {
  if (!selectedKey || !fallbackLabel) return options
  if (options.some((o) => o.value === selectedKey)) return options
  return [{ label: fallbackLabel, value: selectedKey }, ...options]
}
