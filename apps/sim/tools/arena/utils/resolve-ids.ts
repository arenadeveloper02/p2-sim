'use server'

import { env } from '@/lib/core/config/env'
import { getArenaTokenByWorkflowId } from '@/app/api/tools/arena/utils/db-utils'

/**
 * Check if a string looks like a UUID (Arena sysId format)
 * Arena uses UUIDs both with and without dashes
 */
function isUUID(value: string): boolean {
  const trimmed = value.trim()
  // Arena uses UUIDs without dashes: 32 hex characters
  const uuidWithoutDashesRegex = /^[0-9a-f]{32}$/i
  if (uuidWithoutDashesRegex.test(trimmed)) {
    return true
  }
  // Also accept UUIDs with dashes: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidWithDashesRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidWithDashesRegex.test(trimmed)
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

    // If no match found, throw an error (don't return the name as if it were an ID)
    throw new Error(
      `Client not found: "${stringValue}". Please check the client name or use a valid client ID.`
    )
  } catch (error) {
    // If lookup fails, throw an error
    console.error('Error resolving client name to ID:', error)
    if (error instanceof Error && error.message.includes('Client not found')) {
      throw error
    }
    throw new Error(
      `Failed to resolve client "${stringValue}": ${error instanceof Error ? error.message : String(error)}`
    )
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

  // Validate that clientId is a valid UUID before using it
  if (!isUUID(clientId)) {
    throw new Error(
      `Invalid clientId provided to resolveProjectId: "${clientId}". Client must be resolved to a valid ID first.`
    )
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

    // If no match found, throw an error
    throw new Error(
      `Project not found: "${stringValue}" for client "${clientId}". Please check the project name or use a valid project ID.`
    )
  } catch (error) {
    console.error('Error resolving project name to ID:', error)
    if (error instanceof Error && error.message.includes('Project not found')) {
      throw error
    }
    if (error instanceof Error && error.message.includes('Invalid clientId')) {
      throw error
    }
    throw new Error(
      `Failed to resolve project "${stringValue}" for client "${clientId}": ${error instanceof Error ? error.message : String(error)}`
    )
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

  // Validate that clientId and projectId are valid UUIDs before using them
  if (!isUUID(clientId)) {
    throw new Error(
      `Invalid clientId provided to resolveGroupId: "${clientId}". Client must be resolved to a valid ID first.`
    )
  }
  if (!isUUID(projectId)) {
    throw new Error(
      `Invalid projectId provided to resolveGroupId: "${projectId}". Project must be resolved to a valid ID first.`
    )
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

    // Fetch epics/groups for the project - use the same format as frontend
    const url = `${arenaBackendBaseUrl}/sol/v1/tasks/epic?cid=${clientId}&pid=${projectId}`

    const response = await fetch(url, {
      headers: {
        Authorisation: tokenObject.arenaToken,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch groups: ${response.statusText}`)
    }

    const data = await response.json()
    // Handle different response structures - prioritize epics (matches frontend format)
    const groups = Array.isArray(data)
      ? data
      : Array.isArray(data.epics)
        ? data.epics
        : Array.isArray(data.epicList)
          ? data.epicList
          : []

    // Log for debugging
    console.log(`[resolveGroupId] Searching for "${stringValue}" in ${groups.length} groups`)

    // Try exact match first (case-insensitive) - trim whitespace
    const exactMatch = groups.find(
      (g: any) => g.name?.trim().toLowerCase() === stringValue.trim().toLowerCase()
    )
    if (exactMatch) {
      console.log(
        `[resolveGroupId] Found exact match: ${exactMatch.name} (${exactMatch.id || exactMatch.sysId})`
      )
      return exactMatch.id || exactMatch.sysId
    }

    // Try partial match - check if the search term is contained in the name
    const searchTerm = stringValue.trim().toLowerCase()
    const partialMatch = groups.find((g: any) => {
      const groupName = g.name?.trim().toLowerCase() || ''
      return groupName.includes(searchTerm)
    })
    if (partialMatch) {
      console.log(
        `[resolveGroupId] Found partial match: ${partialMatch.name} (${partialMatch.id || partialMatch.sysId})`
      )
      return partialMatch.id || partialMatch.sysId
    }

    // If no match found, throw an error
    throw new Error(
      `Group not found: "${stringValue}" for project "${projectId}". Please check the group name or use a valid group ID.`
    )
  } catch (error) {
    console.error('Error resolving group name to ID:', error)
    if (error instanceof Error && error.message.includes('Group not found')) {
      throw error
    }
    if (
      error instanceof Error &&
      (error.message.includes('Invalid clientId') || error.message.includes('Invalid projectId'))
    ) {
      throw error
    }
    throw new Error(
      `Failed to resolve group "${stringValue}" for project "${projectId}": ${error instanceof Error ? error.message : String(error)}`
    )
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

  // Validate that clientId is a valid UUID before using it
  if (!isUUID(clientId)) {
    throw new Error(
      `Invalid clientId provided to resolveAssigneeId: "${clientId}". Client must be resolved to a valid ID first.`
    )
  }
  // If projectId is provided, validate it too
  if (projectId && !isUUID(projectId)) {
    throw new Error(
      `Invalid projectId provided to resolveAssigneeId: "${projectId}". Project must be resolved to a valid ID first.`
    )
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

    // Build URL for fetching assignees - use the same format as frontend
    let url = `${arenaBackendBaseUrl}/sol/v1/users/list?cId=${clientId}`
    if (projectId) {
      url += `&pId=${projectId}`
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
    // Handle different response structures - prioritize userList (matches frontend format)
    const users = Array.isArray(data)
      ? data
      : Array.isArray(data.userList)
        ? data.userList
        : Array.isArray(data.users)
          ? data.users
          : []

    // Log for debugging
    console.log(`[resolveAssigneeId] Searching for "${stringValue}" in ${users.length} users`)

    // Try exact match first (case-insensitive) - match by name or email
    const exactMatch = users.find(
      (u: any) =>
        u.name?.trim().toLowerCase() === stringValue.trim().toLowerCase() ||
        u.email?.trim().toLowerCase() === stringValue.trim().toLowerCase()
    )
    if (exactMatch) {
      console.log(`[resolveAssigneeId] Found exact match: ${exactMatch.name} (${exactMatch.sysId})`)
      return exactMatch.sysId || exactMatch.id || exactMatch.userId
    }

    // Try partial match - check if the search term is contained in the name
    const searchTerm = stringValue.trim().toLowerCase()
    const partialMatch = users.find((u: any) => {
      const userName = u.name?.trim().toLowerCase() || ''
      const userEmail = u.email?.trim().toLowerCase() || ''
      return userName.includes(searchTerm) || userEmail.includes(searchTerm)
    })
    if (partialMatch) {
      console.log(
        `[resolveAssigneeId] Found partial match: ${partialMatch.name} (${partialMatch.sysId})`
      )
      return partialMatch.sysId || partialMatch.id || partialMatch.userId
    }

    // If no match found, throw an error
    throw new Error(
      `Assignee not found: "${stringValue}" for client "${clientId}"${projectId ? ` and project "${projectId}"` : ''}. Please check the assignee name/email or use a valid assignee ID.`
    )
  } catch (error) {
    console.error('Error resolving assignee name to ID:', error)
    if (error instanceof Error && error.message.includes('Assignee not found')) {
      throw error
    }
    if (
      error instanceof Error &&
      (error.message.includes('Invalid clientId') || error.message.includes('Invalid projectId'))
    ) {
      throw error
    }
    throw new Error(
      `Failed to resolve assignee "${stringValue}": ${error instanceof Error ? error.message : String(error)}`
    )
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

  // Validate that clientId and projectId are valid UUIDs before using them
  if (!isUUID(clientId)) {
    throw new Error(
      `Invalid clientId provided to resolveTaskId: "${clientId}". Client must be resolved to a valid ID first.`
    )
  }
  if (!isUUID(projectId)) {
    throw new Error(
      `Invalid projectId provided to resolveTaskId: "${projectId}". Project must be resolved to a valid ID first.`
    )
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

    // If no match found, throw an error
    throw new Error(
      `Task not found: "${stringValue}" for project "${projectId}". Please check the task name or use a valid task ID.`
    )
  } catch (error) {
    console.error('Error resolving task name to ID:', error)
    if (error instanceof Error && error.message.includes('Task not found')) {
      throw error
    }
    if (
      error instanceof Error &&
      (error.message.includes('Invalid clientId') || error.message.includes('Invalid projectId'))
    ) {
      throw error
    }
    throw new Error(
      `Failed to resolve task "${stringValue}" for project "${projectId}": ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
