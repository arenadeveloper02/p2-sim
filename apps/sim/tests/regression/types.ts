export type RegressionCaseStatus = 'pass' | 'fail' | 'skip' | 'flaky'

export type RegressionFailureCategory =
  | 'auth'
  | 'timeout'
  | 'provider_drift'
  | 'platform_bug'
  | 'test_data'
  | 'assertion'
  | 'safety'
  | 'unknown'

export type RegressionSuiteCategory = 'block' | 'tool' | 'executor' | 'api' | 'e2e' | 'feature' | 'static'

export type RegressionPriority = 'P0' | 'P1' | 'P2'

export interface RegressionCaseError {
  message: string
  category: RegressionFailureCategory
  stack?: string
}

export interface RegressionCaseReproduce {
  environment: string
  appUrl: string
  gitSha?: string
  workspaceId?: string
  workflowId?: string
  executionId?: string
  stepsUi: string[]
  commandCli: string
  commandApi?: string
  inputs?: Record<string, unknown>
  fixturePath?: string
}

export interface RegressionCaseArtifacts {
  githubRunUrl?: string
  simExecutionUrl?: string
  screenshot?: string
  logExcerpt?: string
}

export interface RegressionCaseWhat {
  title: string
  expected: string
  actual: string
  blockType?: string
  toolId?: string
  blockId?: string
}

export interface RegressionCaseWhy {
  category: RegressionFailureCategory
  summary: string
  detail?: string
  httpStatus?: number
  providerErrorCode?: string
}

export interface RegressionCase {
  id: string
  status: RegressionCaseStatus
  durationMs: number
  blockType?: string
  toolId?: string
  operation?: string
  what?: RegressionCaseWhat
  why?: RegressionCaseWhy
  reproduce?: RegressionCaseReproduce
  artifacts?: RegressionCaseArtifacts
  skipReason?: string
}

export interface RegressionSuite {
  id: string
  name: string
  category: RegressionSuiteCategory
  priority: RegressionPriority
  status: RegressionCaseStatus
  durationMs: number
  cases: RegressionCase[]
}

export interface RegressionTrend {
  passRateDelta: number
  newFailures: string[]
  fixed: string[]
}

export interface RegressionReport {
  meta: {
    runId: string
    startedAt: string
    finishedAt: string
    environment: string
    appUrl: string
    gitSha?: string
    tier: 'combined'
    trigger: 'schedule' | 'manual' | 'local'
    githubRunUrl?: string
    incomplete?: boolean
  }
  summary: {
    total: number
    passed: number
    failed: number
    skipped: number
    flaky: number
    durationMs: number
    passRate: number
    vsYesterday?: RegressionTrend
  }
  policy: {
    slackChannelId: string
    slackChannelName: string
    emailRecipient: string
    excludedIntegrations: string[]
  }
  suites: RegressionSuite[]
}

export interface RegressionSuiteRunner {
  id: string
  name: string
  category: RegressionSuiteCategory
  priority: RegressionPriority
  run: (context: RegressionRunContext) => Promise<RegressionSuite>
}

export interface RegressionRunContext {
  appUrl: string
  gitSha?: string
  githubRunUrl?: string
  trigger: RegressionReport['meta']['trigger']
  apiKey?: string
  workspaceId?: string
}
