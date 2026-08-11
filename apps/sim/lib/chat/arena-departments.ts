import { db } from '@sim/db'
import { agentDepartments } from '@sim/db/schema'
import { asc, eq } from 'drizzle-orm'

export interface AgentDepartment {
  value: string
  label: string
}

/**
 * Loads active agent departments ordered for UI dropdowns and filters.
 */
export async function listAgentDepartments(): Promise<AgentDepartment[]> {
  const rows = await db
    .select({
      value: agentDepartments.value,
      label: agentDepartments.label,
    })
    .from(agentDepartments)
    .where(eq(agentDepartments.isActive, true))
    .orderBy(asc(agentDepartments.sortOrder), asc(agentDepartments.label))

  return rows
}

/**
 * Builds a value → label map for batch label resolution (e.g. agent list endpoints).
 */
export async function getAgentDepartmentLabelMap(): Promise<Map<string, string>> {
  const departments = await listAgentDepartments()
  return new Map(departments.map((department) => [department.value, department.label]))
}

/**
 * Resolves a display label from a preloaded value → label map.
 */
export function labelFromDepartmentMap(
  labelMap: Map<string, string>,
  departmentValue: string | null | undefined
): string | null {
  if (!departmentValue) return null
  return labelMap.get(departmentValue) ?? departmentValue
}

/**
 * Returns the display label for a department value stored in the database.
 */
export async function getAgentDepartmentLabel(
  departmentValue: string | null | undefined
): Promise<string | null> {
  if (!departmentValue) return null
  const labelMap = await getAgentDepartmentLabelMap()
  return labelFromDepartmentMap(labelMap, departmentValue)
}

/**
 * Resolves a department name param (e.g. `WAAS` or `waas`) to the canonical category value.
 */
export async function resolveAgentDepartmentValue(
  departmentName: string | null | undefined
): Promise<string | undefined> {
  if (!departmentName?.trim()) return undefined
  const normalized = departmentName.trim().toLowerCase()
  const departments = await listAgentDepartments()
  const found = departments.find(
    (department) =>
      department.value.toLowerCase() === normalized || department.label.toLowerCase() === normalized
  )
  return found?.value
}
