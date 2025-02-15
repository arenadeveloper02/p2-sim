import { RepoInfoResponse } from '@/tools/github/repo'
import { GithubIcon } from '../../components/icons'
import { BlockConfig } from '../types'

export const GitHubBlock: BlockConfig<RepoInfoResponse> = {
  type: 'github',
  name: 'GitHub',
  description: 'Fetch GitHub repository',
  category: 'tools',
  bgColor: '#181C1E',
  icon: GithubIcon,
  subBlocks: [
    {
      id: 'owner',
      title: 'Repository Owner',
      type: 'short-input',
      layout: 'half',
      placeholder: 'e.g., microsoft',
    },
    {
      id: 'repo',
      title: 'Repository Name',
      type: 'short-input',
      layout: 'half',
      placeholder: 'e.g., vscode',
    },
    {
      id: 'apiKey',
      title: 'GitHub Token',
      type: 'short-input',
      layout: 'full',
      placeholder: 'Enter GitHub Token',
      password: true,
    },
  ],
  tools: {
    access: ['github_repoinfo'],
  },
  inputs: {
    owner: { type: 'string', required: true },
    repo: { type: 'string', required: true },
  },
  outputs: {
    response: {
      type: {
        name: 'string',
        description: 'string',
        stars: 'number',
        forks: 'number',
        openIssues: 'number',
        language: 'string',
      },
    },
  },
}
