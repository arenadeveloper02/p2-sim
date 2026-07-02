/**
 * @vitest-environment node
 */
import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExecuteShellInE2B, mockE2bApiKey } = vi.hoisted(() => ({
  mockExecuteShellInE2B: vi.fn(),
  mockE2bApiKey: { value: undefined as string | undefined },
}))

vi.mock('@/lib/execution/e2b', () => ({
  executeShellInE2B: mockExecuteShellInE2B,
}))

vi.mock('@/lib/core/config/env', () => ({
  env: {
    get E2B_API_KEY() {
      return mockE2bApiKey.value
    },
  },
}))

import {
  validateGeneratedAppBuild,
  validateGeneratedAppPreDeploy,
  validateGeneratedAppProductionBuild,
  validateGeneratedAppTypecheck,
} from '@/lib/development/validate-generated-app-build'

const sampleFiles = [
  {
    path: 'package.json',
    content: JSON.stringify({
      name: 'demo',
      scripts: { build: 'echo build-ok' },
      devDependencies: { typescript: '^5.8.0' },
    }),
  },
  { path: 'tsconfig.json', content: '{"compilerOptions":{"strict":true}}' },
]

describe('validate-generated-app-build', () => {
  const outputDir = join(process.cwd(), '.tmp-validate-generated-app-build')

  beforeEach(async () => {
    vi.clearAllMocks()
    mockE2bApiKey.value = undefined
    await mkdir(outputDir, { recursive: true })
    for (const file of sampleFiles) {
      await writeFile(join(outputDir, file.path), file.content, 'utf-8')
    }
  })

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true })
  })

  it('validateGeneratedAppPreDeploy uses typecheck locally when E2B is not configured', async () => {
    const result = await validateGeneratedAppPreDeploy(outputDir, sampleFiles)

    expect(result.method).toBe('local')
    expect(result.output).toContain('=== tsc --noEmit ===')
    expect(mockExecuteShellInE2B).not.toHaveBeenCalled()
  }, 30_000)

  it('validateGeneratedAppPreDeploy uses typecheck in E2B when E2B_API_KEY is set', async () => {
    mockE2bApiKey.value = 'test-key'
    mockExecuteShellInE2B.mockResolvedValue({
      stdout: 'typecheck ok\n__SIM_RESULT__={"typecheckOk":true}',
      error: undefined,
    })

    const result = await validateGeneratedAppPreDeploy(outputDir, sampleFiles)

    expect(result.method).toBe('e2b')
    expect(result.validated).toBe(true)
    expect(mockExecuteShellInE2B).toHaveBeenCalledTimes(1)
    const shellScript = mockExecuteShellInE2B.mock.calls[0]?.[0]?.code as string
    expect(shellScript).toContain('tsc --noEmit')
    expect(shellScript).not.toContain('next build')
    expect(shellScript).toContain('NEXT_TELEMETRY_DISABLED=1')
  })

  it('validateGeneratedAppProductionBuild runs full next build in E2B', async () => {
    mockE2bApiKey.value = 'test-key'
    mockExecuteShellInE2B.mockResolvedValue({
      stdout: 'build ok\n__SIM_RESULT__={"buildOk":true}',
      error: undefined,
    })

    const result = await validateGeneratedAppProductionBuild(outputDir, sampleFiles)

    expect(result.method).toBe('e2b')
    expect(result.validated).toBe(true)
    const shellScript = mockExecuteShellInE2B.mock.calls[0]?.[0]?.code as string
    expect(shellScript).toContain('npm run build')
  })

  it('validateGeneratedAppProductionBuild skips when E2B is not configured', async () => {
    const result = await validateGeneratedAppProductionBuild(outputDir, sampleFiles)

    expect(result.method).toBe('skipped')
    expect(result.validated).toBe(true)
    expect(mockExecuteShellInE2B).not.toHaveBeenCalled()
  })

  it('skips prisma db push in E2B validation for database apps', async () => {
    mockE2bApiKey.value = 'test-key'
    mockExecuteShellInE2B.mockResolvedValue({
      stdout: 'build ok',
      error: undefined,
    })

    const filesWithPrisma = [
      ...sampleFiles,
      {
        path: 'package.json',
        content: JSON.stringify({
          name: 'demo',
          scripts: {
            build: 'prisma generate && prisma db push && next build',
          },
          devDependencies: { prisma: '^6.0.0', next: '^15.0.0' },
        }),
      },
      { path: 'prisma/schema.prisma', content: 'model User { id String @id }' },
    ]

    await validateGeneratedAppBuild(outputDir, filesWithPrisma, { requiresDatabase: true })

    const shellScript = mockExecuteShellInE2B.mock.calls[0]?.[0]?.code as string
    expect(shellScript).toContain('npx prisma generate')
    expect(shellScript).toContain('npx next build')
    expect(shellScript).not.toContain('npm run build')
    expect(shellScript).not.toContain('prisma db push')
  })

  it('validateGeneratedAppTypecheck still runs tsc in E2B when called directly', async () => {
    mockE2bApiKey.value = 'test-key'
    mockExecuteShellInE2B.mockResolvedValue({
      stdout: 'ok',
      error: undefined,
    })

    await validateGeneratedAppTypecheck(outputDir, sampleFiles)

    const shellScript = mockExecuteShellInE2B.mock.calls[0]?.[0]?.code as string
    expect(shellScript).toContain('tsc --noEmit')
    expect(shellScript).not.toContain('npm run build')
  })
})
