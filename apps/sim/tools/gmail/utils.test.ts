/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { buildMimeMessage, encodeRfc2047 } from './utils'

describe('encodeRfc2047', () => {
  it('returns ASCII text unchanged', () => {
    expect(encodeRfc2047('Simple ASCII Subject')).toBe('Simple ASCII Subject')
  })

  it('returns empty string unchanged', () => {
    expect(encodeRfc2047('')).toBe('')
  })

  it('encodes emojis as RFC 2047 base64', () => {
    const result = encodeRfc2047('Time to Stretch! 🧘')
    expect(result).toBe('=?UTF-8?B?VGltZSB0byBTdHJldGNoISDwn6eY?=')
  })

  it('round-trips non-ASCII subjects correctly', () => {
    const subjects = ['Hello 世界', 'Café résumé', '🎉🎊🎈 Party!', '今週のミーティング']
    for (const subject of subjects) {
      const encoded = encodeRfc2047(subject)
      const match = encoded.match(/^=\?UTF-8\?B\?(.+)\?=$/)
      expect(match).not.toBeNull()
      const decoded = Buffer.from(match![1], 'base64').toString('utf-8')
      expect(decoded).toBe(subject)
    }
  })

  it('does not double-encode already-encoded subjects', () => {
    const alreadyEncoded = '=?UTF-8?B?VGltZSB0byBTdHJldGNoISDwn6eY?='
    expect(encodeRfc2047(alreadyEncoded)).toBe(alreadyEncoded)
  })
})

describe('buildMimeMessage', () => {
  it('preserves SVG attachment bytes when the email body contains Unicode', () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
      'utf-8'
    )

    const mime = buildMimeMessage({
      to: 'user@example.com',
      subject: 'Chart attached',
      body: 'Here is your chart 📊',
      attachments: [
        {
          filename: 'chart.svg',
          mimeType: 'image/svg+xml',
          content: svg,
        },
      ],
    })

    expect(mime.includes('\r\n')).toBe(true)
    expect(mime).toContain('Content-Transfer-Encoding: base64')
    expect(mime).toContain('Content-Type: image/svg+xml; charset="UTF-8"')

    const attachmentMatch = mime.match(
      /Content-Type: image\/svg\+xml[^\r\n]*\r\nContent-Disposition:[^\r\n]*\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n\r\n--/
    )
    expect(attachmentMatch).not.toBeNull()
    const attachmentBase64 = attachmentMatch![1].replace(/\r\n/g, '')
    expect(Buffer.from(attachmentBase64, 'base64').equals(svg)).toBe(true)
  })
})
