export type PlaywrightStepType =
  | 'navigate'
  | 'snapshot'
  | 'click'
  | 'type'
  | 'screenshot'
  | 'wait'
  | 'press'

export interface PlaywrightStep {
  type: PlaywrightStepType
  url?: string
  ref?: string
  selector?: string
  text?: string
  submit?: boolean
  key?: string
  timeMs?: number
  fullPage?: boolean
}

export interface PlaywrightRefEntry {
  role: string
  name?: string
}

export interface PlaywrightStepResult {
  type: PlaywrightStepType
  success: boolean
  url?: string
  snapshot?: string
  screenshot?: string
  error?: string
}

export interface PlaywrightRunResult {
  stepResults: PlaywrightStepResult[]
  finalSnapshot?: string
  finalUrl?: string
}

export interface PlaywrightRunOptions {
  steps: PlaywrightStep[]
  headless?: boolean
  timeoutMs?: number
}
