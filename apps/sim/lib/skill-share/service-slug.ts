const SERVICE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugifySkillServiceName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!SERVICE_SLUG_PATTERN.test(slug)) {
    throw new Error('Service name must contain at least one letter or number')
  }
  return slug
}
