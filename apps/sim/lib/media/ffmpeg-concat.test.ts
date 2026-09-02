/**
 * @vitest-environment node
 *
 * Verifies the filter graphs the concat operation builds — both the plain
 * concat path (default, must stay byte-identical in behavior) and the new
 * xfade/acrossfade transition path.
 */
import fs from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { capturedComplexFilters, capturedInputs, probeDurations, silentClips } = vi.hoisted(() => ({
  capturedComplexFilters: [] as string[][],
  capturedInputs: [] as string[],
  // Per input index (parsed from in-<i>.mp4): clip duration in seconds.
  probeDurations: [] as number[],
  // Input indexes that should probe with no audio stream.
  silentClips: new Set<number>(),
}))

vi.mock('node:child_process', () => ({
  execSync: () => '/usr/bin/ffmpeg\n',
}))

vi.mock('fluent-ffmpeg', () => {
  const makeCommand = () => {
    const handlers: Record<string, (...args: unknown[]) => void> = {}
    const cmd: Record<string, unknown> = {}
    const chain = (fn?: (arg: unknown) => void) => (arg?: unknown) => {
      fn?.(arg)
      return cmd
    }
    cmd.input = chain((arg) => capturedInputs.push(String(arg)))
    cmd.inputOptions = chain()
    cmd.outputOptions = chain()
    cmd.videoFilters = chain()
    cmd.audioFilters = chain()
    cmd.complexFilter = chain((arg) => {
      capturedComplexFilters.push(arg as string[])
    })
    cmd.on = (event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler
      return cmd
    }
    cmd.save = (outputPath: string) => {
      fs.writeFileSync(outputPath, Buffer.from('stub-output'))
      handlers.end?.()
      return cmd
    }
    return cmd
  }
  const ffmpeg = (() => makeCommand()) as unknown as Record<string, unknown> & (() => unknown)
  ;(ffmpeg as Record<string, unknown>).setFfmpegPath = () => {}
  ;(ffmpeg as Record<string, unknown>).ffprobe = (
    filePath: string,
    cb: (err: unknown, data: unknown) => void
  ) => {
    const index = Number(/in-(\d+)\./.exec(filePath)?.[1] ?? 0)
    const streams: Record<string, unknown>[] = [
      { codec_type: 'video', codec_name: 'h264', width: 1280, height: 720 },
    ]
    if (!silentClips.has(index)) {
      streams.push({ codec_type: 'audio', codec_name: 'aac' })
    }
    cb(null, { streams, format: { duration: String(probeDurations[index] ?? 4) } })
  }
  return { default: ffmpeg }
})

import { runFfmpegOperation } from '@/lib/media/ffmpeg'

const clip = (name: string) => ({
  buffer: Buffer.from(`fake-${name}`),
  mimeType: 'video/mp4',
  name,
})

const allFilters = () => capturedComplexFilters.flat()

describe('concat transitions', () => {
  beforeEach(() => {
    capturedComplexFilters.length = 0
    capturedInputs.length = 0
    probeDurations.length = 0
    silentClips.clear()
  })

  it('defaults to the plain concat filter when no transition is given', async () => {
    probeDurations.push(4, 4)
    await runFfmpegOperation('concat', [clip('a'), clip('b')])

    const filters = allFilters()
    expect(filters.some((f) => f.includes('concat=n=2:v=1:a=1'))).toBe(true)
    expect(filters.some((f) => f.includes('xfade'))).toBe(false)
  })

  it("treats transition 'none' exactly like the default", async () => {
    probeDurations.push(4, 4)
    await runFfmpegOperation('concat', [clip('a'), clip('b')], { transition: 'none' })

    const filters = allFilters()
    expect(filters.some((f) => f.includes('concat=n=2'))).toBe(true)
    expect(filters.some((f) => f.includes('xfade'))).toBe(false)
  })

  it('builds an xfade + acrossfade chain with cumulative offsets', async () => {
    probeDurations.push(4, 3, 5)
    await runFfmpegOperation('concat', [clip('a'), clip('b'), clip('c')], {
      transition: 'fade',
      transitionDuration: 0.4,
    })

    const filters = allFilters()
    // Offsets: 4 - 0.4 = 3.600, then 3.6 + 3 - 0.4 = 6.200.
    expect(filters).toContain('[v0][v1]xfade=transition=fade:duration=0.4:offset=3.600[xv1]')
    expect(filters).toContain('[xv1][v2]xfade=transition=fade:duration=0.4:offset=6.200[outv]')
    expect(filters).toContain('[a0][a1]acrossfade=d=0.4:c1=tri:c2=tri[xa1]')
    expect(filters).toContain('[xa1][a2]acrossfade=d=0.4:c1=tri:c2=tri[outa]')
    expect(filters.some((f) => f.includes('concat=n='))).toBe(false)
  })

  it('supports dissolve and synthesizes silence for clips without audio', async () => {
    probeDurations.push(4, 4)
    silentClips.add(1)
    await runFfmpegOperation('concat', [clip('a'), clip('b')], { transition: 'dissolve' })

    const filters = allFilters()
    expect(filters.some((f) => f.includes('xfade=transition=dissolve'))).toBe(true)
    // The silent clip's audio comes from an anullsrc input mapped to [a1].
    expect(capturedInputs.some((i) => i.includes('anullsrc'))).toBe(true)
    expect(filters.some((f) => f.includes('[2:a]asetpts=PTS-STARTPTS[a1]'))).toBe(true)
  })

  it('clamps the fade duration to half the shortest clip', async () => {
    probeDurations.push(4, 3)
    await runFfmpegOperation('concat', [clip('a'), clip('b')], {
      transition: 'fade',
      transitionDuration: 5,
    })

    // Requested 5s but the shortest clip is 3s, so the fade clamps to 1.5s
    // and the offset becomes 4 - 1.5 = 2.5.
    const filters = allFilters()
    expect(filters).toContain('[v0][v1]xfade=transition=fade:duration=1.5:offset=2.500[outv]')
  })
})
