export const AGENT_DEPARTMENTS = [
  { value: 'creative', label: 'Creative' },
  { value: 'ma', label: 'MA' },
  { value: 'ppc', label: 'PPC' },
  { value: 'sales', label: 'Sales' },
  { value: 'seo', label: 'SEO' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'waas', label: 'WAAS' },
  { value: 'hr', label: 'HR' },
  { value: 'pm', label: 'PM' },
] as const

export type AgentDepartmentValue = (typeof AGENT_DEPARTMENTS)[number]['value']

/**
 * Returns the display label for a department value stored in the database.
 */
export function getAgentDepartmentLabel(departmentValue: string | null | undefined): string | null {
  if (!departmentValue) return null
  return (
    AGENT_DEPARTMENTS.find((department) => department.value === departmentValue)?.label ??
    departmentValue
  )
}

/**
 * Resolves a department name param (e.g. `WAAS` or `waas`) to the canonical category value.
 */
export function resolveAgentDepartmentValue(
  departmentName: string | null | undefined
): string | undefined {
  if (!departmentName?.trim()) return undefined
  const normalized = departmentName.trim().toLowerCase()
  const found = AGENT_DEPARTMENTS.find(
    (department) =>
      department.value.toLowerCase() === normalized || department.label.toLowerCase() === normalized
  )
  return found?.value
}
