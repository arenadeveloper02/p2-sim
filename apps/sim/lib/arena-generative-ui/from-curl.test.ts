/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { httpBindingFromCurl } from '@/lib/arena-generative-ui/from-curl'

const ARTICLE_RECOMMENDATION_CURL = `curl -X POST \\
  -H "X-API-Key: $W_ARTICAL_RECOMMENDATION_AGENT_KEY” \\
  -H "Content-Type: application/json" \\
  -d '{"input":"example","conversationId":"example","files":[{"data":"data:application/pdf;base64,...","type":"file","name":"document.pdf","mime":"application/pdf"}],"keyword":"example","client":"example","email":"example"}' \\
  https://agent.thearena.ai/api/workflows/09e8e4e6-4b9c-4126-95f2-cbfcfd025f63/execute`

describe('httpBindingFromCurl', () => {
  it('parses a multiline POST curl with smart quotes and body keys', () => {
    expect(
      httpBindingFromCurl({
        key: 'recommend_articles',
        curl: ARTICLE_RECOMMENDATION_CURL,
        headersSecretName: 'W_ARTICAL_RECOMMENDATION_AGENT_KEY',
      })
    ).toEqual({
      key: 'recommend_articles',
      label: 'recommend_articles',
      kind: 'http',
      http: {
        method: 'POST',
        url: 'https://agent.thearena.ai/api/workflows/09e8e4e6-4b9c-4126-95f2-cbfcfd025f63/execute',
        headersSecretName: 'W_ARTICAL_RECOMMENDATION_AGENT_KEY',
      },
      inputSchema: [
        { name: 'input', type: 'string' },
        { name: 'conversationId', type: 'string' },
        { name: 'files', type: 'array' },
        { name: 'keyword', type: 'string' },
        { name: 'client', type: 'string' },
        { name: 'email', type: 'string' },
      ],
    })
  })

  it('does not copy header values from the curl into the binding', () => {
    const binding = httpBindingFromCurl({
      key: 'lookup',
      curl: 'curl -X POST -H "X-API-Key: super-secret" https://api.example.com/lookup',
      headersSecretName: 'CRM_API_TOKEN',
    })
    expect(JSON.stringify(binding)).not.toContain('super-secret')
    expect(binding.http?.headersSecretName).toBe('CRM_API_TOKEN')
  })

  it('omits headersSecretName when the secret var is blank', () => {
    const binding = httpBindingFromCurl({
      key: 'public_lookup',
      curl: 'curl -X GET https://api.example.com/health',
      headersSecretName: '  ',
    })
    expect(binding.http).toEqual({
      method: 'GET',
      url: 'https://api.example.com/health',
    })
  })

  it('defaults method to POST when -X is omitted', () => {
    const binding = httpBindingFromCurl({
      key: 'create',
      curl: 'curl https://api.example.com/items -d \'{"name":"Ada"}\'',
    })
    expect(binding.http?.method).toBe('POST')
    expect(binding.inputSchema).toEqual([{ name: 'name', type: 'string' }])
  })

  it('parses GET with --get and no body', () => {
    const binding = httpBindingFromCurl({
      key: 'list',
      curl: 'curl -G "https://api.example.com/search?q=ada"',
    })
    expect(binding.http).toEqual({
      method: 'GET',
      url: 'https://api.example.com/search?q=ada',
    })
    expect(binding.inputSchema).toBeUndefined()
  })

  it('parses a quoted multiline JSON body', () => {
    const curl = `curl -X PUT https://api.example.com/lead --data-raw '{
      "company": "Acme",
      "role": "Engineer",
      "active": true,
      "score": 91
    }'`
    const binding = httpBindingFromCurl({ key: 'qualify_lead', curl })
    expect(binding.http?.method).toBe('PUT')
    expect(binding.inputSchema).toEqual([
      { name: 'company', type: 'string' },
      { name: 'role', type: 'string' },
      { name: 'active', type: 'boolean' },
      { name: 'score', type: 'number' },
    ])
  })

  it('reads --url and --request long flags', () => {
    const binding = httpBindingFromCurl({
      key: 'patch_item',
      curl: 'curl --request PATCH --url https://api.example.com/item --data-raw \'{"ok":true}\'',
    })
    expect(binding.http).toEqual({
      method: 'PATCH',
      url: 'https://api.example.com/item',
    })
  })

  it('throws when the key is empty', () => {
    expect(() => httpBindingFromCurl({ key: '  ', curl: 'curl https://api.example.com' })).toThrow(
      'Key is required'
    )
  })

  it('throws when the URL is missing', () => {
    expect(() =>
      httpBindingFromCurl({ key: 'lookup', curl: 'curl -X POST -d \'{"a":1}\'' })
    ).toThrow('Curl is missing a valid URL')
  })

  it('throws when the method is invalid', () => {
    expect(() =>
      httpBindingFromCurl({
        key: 'lookup',
        curl: 'curl -X FOO https://api.example.com/lookup',
      })
    ).toThrow('Curl method is invalid')
  })
})
