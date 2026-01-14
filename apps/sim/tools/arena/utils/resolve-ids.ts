'use server'

import { env } from '@/lib/core/config/env'
import { getArenaTokenByWorkflowId } from '@/app/api/tools/arena/utils/db-utils'

/**
 * Check if a string looks like a UUID (Arena sysId format)
 */
function isUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(value.trim())
}

/**
 * Resolve client name to ID
 * Handles both object (basic mode) and string (advanced mode/variables)
 * If string is a name, fetches clients and matches by name
 */
export async function resolveClientId(
  clientValue: string | { clientId: string; name?: string },
  workflowId: string
): Promise<string> {
  // If it's already an object with clientId, return it
  if (typeof clientValue === 'object' && clientValue?.clientId) {
    return clientValue.clientId
  }

  const stringValue = String(clientValue).trim()

  // Check if it looks like a UUID
  if (isUUID(stringValue)) {
    return stringValue
  }

  // It's likely a name - fetch clients and match by name
  try {
    const tokenObject = await getArenaTokenByWorkflowId(workflowId)
    if (!tokenObject.found || !tokenObject.arenaToken) {
      throw new Error('Failed to get Arena token')
    }

    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    if (!arenaBackendBaseUrl) {
      throw new Error('ARENA_BACKEND_BASE_URL not configured')
    }

    const url = `${arenaBackendBaseUrl}/list/userservice/getclientbyuser`

    const response = await fetch(url, {
      headers: {
        Authorisation: tokenObject.arenaToken,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch clients: ${response.statusText}`)
    }

    const data = await response.json()
    // Handle different response structures
    const clients = Array.isArray(data.response)
      ? data.response
      : Array.isArray(data)
        ? data
        : Array.isArray(data.data)
          ? data.data
          : Array.isArray(data.clientList)
            ? data.clientList
            : []

    // Try exact match first (case-insensitive)
    const exactMatch = clients.find((c: any) => c.name?.toLowerCase() === stringValue.toLowerCase())
    if (exactMatch) {
      return exactMatch.clientId
    }

    // Try partial match
    const partialMatch = clients.find((c: any) =>
      c.name?.toLowerCase().includes(stringValue.toLowerCase())
    )
    if (partialMatch) {
      return partialMatch.clientId
    }

    // If no match found, return the original value (might be an ID in a different format)
    return stringValue
  } catch (error) {
    // If lookup fails, return the original value
    console.error('Error resolving client name to ID:', error)
    return stringValue
  }
}

/**
 * Resolve project name to ID
 * Handles both object (basic mode) and string (advanced mode/variables)
 * If string is a name, fetches projects and matches by name
 */
export async function resolveProjectId(
  projectValue: string | { sysId: string; name?: string },
  clientId: string,
  workflowId: string
): Promise<string> {
  // If it's already an object with sysId, return it
  if (typeof projectValue === 'object' && projectValue?.sysId) {
    return projectValue.sysId
  }

  const stringValue = String(projectValue).trim()

  // Check if it looks like a UUID
  if (isUUID(stringValue)) {
    return stringValue
  }

  // It's likely a name - fetch projects and match by name
  try {
    const tokenObject = await getArenaTokenByWorkflowId(workflowId)
    if (!tokenObject.found || !tokenObject.arenaToken) {
      throw new Error('Failed to get Arena token')
    }

    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    if (!arenaBackendBaseUrl) {
      throw new Error('ARENA_BACKEND_BASE_URL not configured')
    }

    const url = `${arenaBackendBaseUrl}/sol/v1/projects?cid=${clientId}&projectType=STATUS&name=${encodeURIComponent(stringValue)}`

    const response = await fetch(url, {
      headers: {
        Authorisation: tokenObject.arenaToken,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`)
    }

    const data = await response.json()
    const projects = data.projectList || []

    // Try exact match first (case-insensitive)
    const exactMatch = projects.find(
      (p: any) => p.name?.toLowerCase() === stringValue.toLowerCase()
    )
    if (exactMatch) {
      return exactMatch.sysId
    }

    // Try partial match
    const partialMatch = projects.find((p: any) =>
      p.name?.toLowerCase().includes(stringValue.toLowerCase())
    )
    if (partialMatch) {
      return partialMatch.sysId
    }

    // If no match found, return the original value
    return stringValue
  } catch (error) {
    console.error('Error resolving project name to ID:', error)
    return stringValue
  }
}

/**
 * Resolve group/epic name to ID
 * Handles both object (basic mode) and string (advanced mode/variables)
 * If string is a name, fetches groups and matches by name
 */
export async function resolveGroupId(
  groupValue: string | { id: string; name?: string },
  clientId: string,
  projectId: string,
  workflowId: string
): Promise<string> {
  // If it's already an object with id, return it
  if (typeof groupValue === 'object' && groupValue?.id) {
    return groupValue.id
  }

  const stringValue = String(groupValue).trim()

  // Check if it looks like a UUID
  if (isUUID(stringValue)) {
    return stringValue
  }

  // It's likely a name - fetch groups/epics and match by name
  try {
    const tokenObject = await getArenaTokenByWorkflowId(workflowId)
    if (!tokenObject.found || !tokenObject.arenaToken) {
      throw new Error('Failed to get Arena token')
    }

    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    if (!arenaBackendBaseUrl) {
      throw new Error('ARENA_BACKEND_BASE_URL not configured')
    }

    // Fetch epics/groups for the project
    const url = `${arenaBackendBaseUrl}/sol/v1/epics?cid=${clientId}&projectSysId=${projectId}`

    const response = await fetch(url, {
      headers: {
        Authorisation: tokenObject.arenaToken,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch groups: ${response.statusText}`)
    }

    const data = await response.json()
    const groups = Array.isArray(data) ? data : data.epics || data.epicList || []

    // Try exact match first (case-insensitive)
    const exactMatch = groups.find((g: any) => g.name?.toLowerCase() === stringValue.toLowerCase())
    if (exactMatch) {
      return exactMatch.id || exactMatch.sysId
    }

    // Try partial match
    const partialMatch = groups.find((g: any) =>
      g.name?.toLowerCase().includes(stringValue.toLowerCase())
    )
    if (partialMatch) {
      return partialMatch.id || partialMatch.sysId
    }

    // If no match found, return the original value
    return stringValue
  } catch (error) {
    console.error('Error resolving group name to ID:', error)
    return stringValue
  }
}

/**
 * Resolve assignee name to ID
 * Handles both object (basic mode) and string (advanced mode/variables)
 * If string is a name, fetches assignees and matches by name
 */
export async function resolveAssigneeId(
  assigneeValue: string | { value: string; label?: string },
  clientId: string,
  projectId: string | undefined,
  workflowId: string
): Promise<string> {
  // If it's already an object with value, return it
  if (typeof assigneeValue === 'object' && assigneeValue?.value) {
    return assigneeValue.value
  }

  const stringValue = String(assigneeValue).trim()

  // Check if it looks like a UUID
  if (isUUID(stringValue)) {
    return stringValue
  }

  // It's likely a name - fetch assignees and match by name
  try {
    const tokenObject = await getArenaTokenByWorkflowId(workflowId)
    if (!tokenObject.found || !tokenObject.arenaToken) {
      throw new Error('Failed to get Arena token')
    }

    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    if (!arenaBackendBaseUrl) {
      throw new Error('ARENA_BACKEND_BASE_URL not configured')
    }

    // Build URL for fetching assignees
    let url = `${arenaBackendBaseUrl}/sol/v1/users?cid=${clientId}`
    if (projectId) {
      url += `&projectSysId=${projectId}`
    } else {
      // For search task, fetch all users
      url += `&allUsers=true&includeClientUsers=true`
    }

    const response = await fetch(url, {
      headers: {
        Authorisation: tokenObject.arenaToken,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch assignees: ${response.statusText}`)
    }

    const data = await response.json()
    const users = Array.isArray(data) ? data : data.users || data.userList || []

    // Try exact match first (case-insensitive) - match by name or email
    const exactMatch = users.find(
      (u: any) =>
        u.name?.toLowerCase() === stringValue.toLowerCase() ||
        u.email?.toLowerCase() === stringValue.toLowerCase()
    )
    if (exactMatch) {
      return exactMatch.sysId || exactMatch.id || exactMatch.userId
    }

    // Try partial match
    const partialMatch = users.find(
      (u: any) =>
        u.name?.toLowerCase().includes(stringValue.toLowerCase()) ||
        u.email?.toLowerCase().includes(stringValue.toLowerCase())
    )
    if (partialMatch) {
      return partialMatch.sysId || partialMatch.id || partialMatch.userId
    }

    // If no match found, return the original value
    return stringValue
  } catch (error) {
    console.error('Error resolving assignee name to ID:', error)
    return stringValue
  }
}

/**
 * Resolve task/deliverable name to ID
 * Handles both object (basic mode) and string (advanced mode/variables)
 * If string is a name, fetches tasks and matches by name
 */
export async function resolveTaskId(
  taskValue: string | { sysId: string; id?: string; name?: string },
  clientId: string,
  projectId: string,
  workflowId: string
): Promise<string> {
  // If it's already an object with sysId or id, return it
  if (typeof taskValue === 'object') {
    if (taskValue?.sysId) return taskValue.sysId
    if (taskValue?.id) return taskValue.id
  }

  const stringValue = String(taskValue).trim()

  // Check if it looks like a UUID
  if (isUUID(stringValue)) {
    return stringValue
  }

  // It's likely a name - fetch tasks and match by name
  try {
    const tokenObject = await getArenaTokenByWorkflowId(workflowId)
    if (!tokenObject.found || !tokenObject.arenaToken) {
      throw new Error('Failed to get Arena token')
    }

    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    if (!arenaBackendBaseUrl) {
      throw new Error('ARENA_BACKEND_BASE_URL not configured')
    }

    // Fetch tasks/deliverables for the project
    const url = `${arenaBackendBaseUrl}/sol/v1/tasks/users?cid=${clientId}&projectSysId=${projectId}&name=${encodeURIComponent(stringValue)}`

    const response = await fetch(url, {
      headers: {
        Authorisation: tokenObject.arenaToken,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch tasks: ${response.statusText}`)
    }

    const data = await response.json()
    const tasks = Array.isArray(data.tasks)
      ? data.tasks
      : Array.isArray(data)
        ? data
        : Array.isArray(data.deliverables)
          ? data.deliverables
          : []

    // Try exact match first (case-insensitive)
    const exactMatch = tasks.find((t: any) => t.name?.toLowerCase() === stringValue.toLowerCase())
    if (exactMatch) {
      return exactMatch.sysId || exactMatch.id
    }

    // Try partial match
    const partialMatch = tasks.find((t: any) =>
      t.name?.toLowerCase().includes(stringValue.toLowerCase())
    )
    if (partialMatch) {
      return partialMatch.sysId || partialMatch.id
    }

    // If no match found, return the original value
    return stringValue
  } catch (error) {
    console.error('Error resolving task name to ID:', error)
    return stringValue
  }
}
