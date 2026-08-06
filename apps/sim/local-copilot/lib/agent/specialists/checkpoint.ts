import { truncate } from '@sim/utils/string'
import {
  loadCopilotChatConfig,
  mergeCopilotChatConfig,
} from '@/local-copilot/lib/context/chat-config'
import type { ChatMessage } from '@/local-copilot/lib/providers/types'

export const SPECIALIST_CHECKPOINT_SYSTEM_PREFIX = 'Resumed specialist checkpoint:'

export interface SpecialistCheckpoint {
  domain: string
  objective: string
  findings: string
  toolRound: number
  updatedAt: string
  status: 'paused'
}

/**
 * Parses unknown JSON into SpecialistCheckpoint.
 */
export function parseSpecialistCheckpoint(value: unknown): SpecialistCheckpoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const domain = typeof record.domain === 'string' ? record.domain.trim() : ''
  const objective = typeof record.objective === 'string' ? record.objective.trim() : ''
  const findings = typeof record.findings === 'string' ? record.findings : ''
  const toolRound = typeof record.toolRound === 'number' ? Math.max(0, Math.floor(record.toolRound)) : 0
  if (!domain || !objective) return null
  if (record.status !== 'paused') return null
  const updatedAt =
    typeof record.updatedAt === 'string' && record.updatedAt.trim()
      ? record.updatedAt.trim()
      : new Date().toISOString()
  return clampSpecialistCheckpoint({
    domain,
    objective,
    findings,
    toolRound,
    updatedAt,
    status: 'paused',
  })
}

/**
 * Enforces size caps on checkpoint fields.
 */
export function clampSpecialistCheckpoint(checkpoint: SpecialistCheckpoint): SpecialistCheckpoint {
  return {
    domain: truncate(checkpoint.domain.trim(), 64, ''),
    objective: truncate(checkpoint.objective.trim(), 280, ''),
    findings: truncate(checkpoint.findings, 8_000, ''),
    toolRound: Math.max(0, Math.floor(checkpoint.toolRound)),
    updatedAt: checkpoint.updatedAt,
    status: 'paused',
  }
}

/**
 * Formats a checkpoint as a system message for resume.
 */
export function formatSpecialistCheckpointSystemMessage(
  checkpoint: SpecialistCheckpoint
): ChatMessage {
  return {
    role: 'system',
    content: `${SPECIALIST_CHECKPOINT_SYSTEM_PREFIX}\n${JSON.stringify(
      {
        domain: checkpoint.domain,
        objective: checkpoint.objective,
        findings: checkpoint.findings,
        toolRound: checkpoint.toolRound,
      },
      null,
      2
    )}`,
  }
}

/**
 * Loads a specialist checkpoint from chat config.
 */
export async function loadSpecialistCheckpoint(
  chatId: string,
  userId: string
): Promise<SpecialistCheckpoint | null> {
  const config = await loadCopilotChatConfig(chatId, userId)
  if (!config) return null
  return parseSpecialistCheckpoint(config.specialistCheckpoint)
}

/**
 * Persists a specialist checkpoint into chat config.
 */
export async function persistSpecialistCheckpoint(
  chatId: string,
  userId: string,
  checkpoint: SpecialistCheckpoint
): Promise<void> {
  await mergeCopilotChatConfig(chatId, userId, {
    specialistCheckpoint: clampSpecialistCheckpoint(checkpoint),
  })
}

/**
 * Clears a specialist checkpoint from chat config.
 */
export async function clearSpecialistCheckpoint(chatId: string, userId: string): Promise<void> {
  await mergeCopilotChatConfig(chatId, userId, { specialistCheckpoint: null })
}
