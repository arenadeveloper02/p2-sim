/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { parseGitHubUrl, parseSkillFrontmatter } from '@/lib/workflows/skills/importers/github'

describe('parseGitHubUrl', () => {
  it('parses GitHub blob URLs', () => {
    expect(parseGitHubUrl('https://github.com/acme/skills/blob/main/foo/SKILL.md')).toEqual({
      owner: 'acme',
      repo: 'skills',
      ref: 'main',
      path: 'foo/SKILL.md',
      mode: 'blob',
    })
  })

  it('parses GitHub tree URLs', () => {
    expect(parseGitHubUrl('https://github.com/acme/skills/tree/main/skills')).toEqual({
      owner: 'acme',
      repo: 'skills',
      ref: 'main',
      path: 'skills',
      mode: 'tree',
    })
  })

  it('parses direct GitHub repository URLs as repo root imports', () => {
    expect(parseGitHubUrl('https://github.com/acme/skills')).toEqual({
      owner: 'acme',
      repo: 'skills',
      ref: '',
      path: '',
      mode: 'repo',
    })
  })

  it('parses raw GitHub URLs', () => {
    expect(
      parseGitHubUrl('https://raw.githubusercontent.com/acme/skills/main/foo/SKILL.md')
    ).toEqual({
      owner: 'acme',
      repo: 'skills',
      ref: 'main',
      path: 'foo/SKILL.md',
      mode: 'raw',
    })
  })

  it('rejects non-GitHub URLs', () => {
    expect(() => parseGitHubUrl('https://example.com/SKILL.md')).toThrow('Only GitHub URLs')
  })
})

describe('parseSkillFrontmatter', () => {
  it('parses name, description, allowed tools, and body', () => {
    const raw = [
      '---',
      'name: ads-google',
      'description: Google Ads workflow guidance',
      'allowed-tools: Bash, Read',
      '---',
      '',
      '# Instructions',
      'Use this skill carefully.',
    ].join('\n')

    expect(parseSkillFrontmatter(raw)).toEqual({
      name: 'ads-google',
      description: 'Google Ads workflow guidance',
      allowedTools: ['Bash', 'Read'],
      content: '# Instructions\nUse this skill carefully.',
    })
  })

  it('infers a name from the first heading without frontmatter', () => {
    expect(parseSkillFrontmatter('# My Skill\n\nBody')).toEqual({
      name: 'my-skill',
      description: '',
      allowedTools: null,
      content: '# My Skill\n\nBody',
    })
  })
})
