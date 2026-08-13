import { describe, expect, it } from 'vitest'
import {
  buildHttpAllowlist,
  inspectHttpBindingUrl,
  isHttpUrlAllowlisted,
} from '@/lib/arena-generative-ui/http-allowlist'

describe('http-allowlist', () => {
  it('rejects private and loopback hosts', () => {
    expect(inspectHttpBindingUrl('https://127.0.0.1/hook').ok).toBe(false)
    expect(inspectHttpBindingUrl('https://localhost/hook').ok).toBe(false)
    expect(inspectHttpBindingUrl('https://10.0.0.4/hook').ok).toBe(false)
    expect(inspectHttpBindingUrl('https://192.168.1.9/hook').ok).toBe(false)
  })

  it('requires https unless allowHttp is set', () => {
    expect(inspectHttpBindingUrl('http://example.com/hook').ok).toBe(false)
    expect(inspectHttpBindingUrl('http://example.com/hook', { allowHttp: true }).ok).toBe(true)
  })

  it('builds a host allowlist from HTTP bindings', () => {
    const result = buildHttpAllowlist([
      { kind: 'http', http: { url: 'https://api.example.com/v1' } },
      { kind: 'workflow' },
    ])
    expect(result).toEqual({ ok: true, hosts: ['api.example.com'] })
  })

  it('rejects requests whose host is not in the published allowlist', () => {
    expect(isHttpUrlAllowlisted('https://evil.example/path', ['api.example.com']).ok).toBe(false)
    expect(isHttpUrlAllowlisted('https://api.example.com/v1', ['api.example.com']).ok).toBe(true)
  })
})
