/**
 * Prepares SVG markup for `<img src={blob:...}>` preview.
 * Standalone SVG as an image requires an xmlns; agent/tool output often omits it.
 */
export function normalizeSvgForPreview(content: string): string {
  let svg = content.trim()
  if (!svg) return svg

  // Agents sometimes wrap file content in markdown fences.
  const fenced = svg.match(/^```(?:svg|xml)?\s*\n([\s\S]*?)\n```$/i)
  if (fenced) {
    svg = fenced[1].trim()
  }

  if (!/<svg\b/i.test(svg)) {
    return svg
  }

  if (!/<svg[^>]*\sxmlns\s*=/i.test(svg)) {
    svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  }

  // XLink hrefs (older SVG) need the xlink namespace when used as a standalone image.
  if (/\bxlink:/i.test(svg) && !/<svg[^>]*\sxmlns:xlink\s*=/i.test(svg)) {
    svg = svg.replace(/<svg\b/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"')
  }

  return svg
}
