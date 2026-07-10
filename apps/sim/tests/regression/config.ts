/**
 * Central regression policy and environment defaults.
 * All Slack posts and test emails are constrained here.
 */
export const REGRESSION_CONFIG = {
  environment: {
    name: 'test-agent',
    appUrl: 'https://test-agent.thearena.ai',
  },
  safety: {
    slack: {
      allowedChannelIds: ['C0BDTEZPF7C'] as const,
      allowedChannelNames: ['#slack-testing', 'slack-testing'] as const,
    },
    email: {
      allowedRecipients: ['akshay.v@position2.com'] as const,
    },
  },
  excludedIntegrations: ['notion'] as const,
  notifications: {
    slack: {
      channelId: 'C0BDTEZPF7C',
      channelName: '#slack-testing',
    },
    email: {
      to: ['akshay.v@position2.com'] as const,
      sendOn: 'always' as const,
    },
  },
  reports: {
    outputDir: 'apps/sim/tests/regression/reports',
    historyFile: 'apps/sim/tests/regression/reports/history.jsonl',
  },
} as const

export type ExcludedIntegration = (typeof REGRESSION_CONFIG.excludedIntegrations)[number]
