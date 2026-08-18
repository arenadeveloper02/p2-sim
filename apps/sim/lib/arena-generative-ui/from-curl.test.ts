/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  curlHasAuthHeader,
  curlLooksLikeStream,
  httpBindingFromCurl,
} from '@/lib/arena-generative-ui/from-curl'

const ARTICLE_RECOMMENDATION_CURL = `curl -X POST \\
  -H "X-API-Key: $W_ARTICAL_RECOMMENDATION_AGENT_KEY” \\
  -H "Content-Type: application/json" \\
  -d '{"input":"example","conversationId":"example","files":[{"data":"data:application/pdf;base64,...","type":"file","name":"document.pdf","mime":"application/pdf"}],"keyword":"example","client":"example","email":"example"}' \\
  https://agent.thearena.ai/api/workflows/09e8e4e6-4b9c-4126-95f2-cbfcfd025f63/execute`

const SIM_STREAMING_CURL = `curl -X POST \\
  -H "X-API-Key: $SIM_API_KEY" \\
  -H "X-Sim-Stream-Protocol: agent-events-v1" \\
  -H "Content-Type: application/json" \\
  -d '{"input":"example","conversationId":"example","files":[{"data":"data:application/pdf;base64,...","type":"file","name":"document.pdf","mime":"application/pdf"}],"keyword":"example","client":"example","email":"example","stream":true,"includeThinking":true,"includeToolCalls":true}' \\
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
        authHeaderName: 'X-API-Key',
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
    expect(binding.http?.authHeaderName).toBe('X-API-Key')
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

describe('httpBindingFromCurl output format', () => {
  it('omits outputSchema when no sample is given', () => {
    const binding = httpBindingFromCurl({
      key: 'recommend_articles',
      curl: ARTICLE_RECOMMENDATION_CURL,
    })
    expect(binding.outputSchema).toBeUndefined()
  })

  it('derives outputSchema paths from a sample response', () => {
    const binding = httpBindingFromCurl({
      key: 'recommend_articles',
      curl: ARTICLE_RECOMMENDATION_CURL,
      outputSample: '{"articles":[{"title":"First","url":"https://example.com"}],"count":1}',
    })
    expect(binding.outputSchema).toEqual([
      { name: 'articles', type: 'array' },
      { name: 'articles[].title', type: 'string' },
      { name: 'articles[].url', type: 'string' },
      { name: 'count', type: 'number' },
    ])
  })

  it('stores field names and types but never the sample values', () => {
    const binding = httpBindingFromCurl({
      key: 'crm_lookup',
      curl: 'curl -X POST https://api.example.com/lookup',
      outputSample: '{"email":"ada@example.com","plan":"enterprise"}',
    })
    const serialized = JSON.stringify(binding)
    expect(serialized).toContain('email')
    expect(serialized).not.toContain('ada@example.com')
    expect(serialized).not.toContain('enterprise')
  })

  it('throws when the sample is not valid JSON', () => {
    expect(() =>
      httpBindingFromCurl({
        key: 'lookup',
        curl: 'curl -X POST https://api.example.com/lookup',
        outputSample: 'title, url',
      })
    ).toThrow('Output format must be valid JSON')
  })

  it('ignores a blank sample', () => {
    const binding = httpBindingFromCurl({
      key: 'lookup',
      curl: 'curl -X POST https://api.example.com/lookup',
      outputSample: '   ',
    })
    expect(binding.outputSchema).toBeUndefined()
  })
})

describe('curlLooksLikeStream', () => {
  it('is false for a plain JSON POST including the article-recommendation curl', () => {
    expect(curlLooksLikeStream(ARTICLE_RECOMMENDATION_CURL)).toBe(false)
    expect(
      curlLooksLikeStream('curl -X POST -d \'{"input":"example"}\' https://api.example.com/execute')
    ).toBe(false)
  })

  it('is true for -N and --no-buffer', () => {
    expect(curlLooksLikeStream('curl -N https://api.example.com/stream')).toBe(true)
    expect(curlLooksLikeStream('curl --no-buffer -X POST https://api.example.com/stream')).toBe(
      true
    )
  })

  it('is true for Sim streaming execute curls via protocol header, not body stream:true', () => {
    expect(curlLooksLikeStream(SIM_STREAMING_CURL)).toBe(true)
    expect(
      curlLooksLikeStream(
        'curl -H "X-Sim-Stream-Protocol: agent-events-v1" https://api.example.com/execute'
      )
    ).toBe(true)
    expect(
      curlLooksLikeStream(
        'curl -d \'{"input":"hi","stream":true}\' https://api.example.com/execute'
      )
    ).toBe(false)
  })

  it('is true when Accept is text/event-stream', () => {
    expect(
      curlLooksLikeStream(
        'curl -X POST -H "Accept: text/event-stream" https://api.example.com/stream'
      )
    ).toBe(true)
    expect(
      curlLooksLikeStream(
        'curl --header "Accept: text/event-stream, text/plain" https://api.example.com/stream'
      )
    ).toBe(true)
  })

  it('does not treat other headers as streaming', () => {
    expect(
      curlLooksLikeStream(
        'curl -H "X-API-Key: super-secret" -H "Content-Type: application/json" https://api.example.com/x'
      )
    ).toBe(false)
  })

  it('does not throw on incomplete curls', () => {
    expect(curlLooksLikeStream('')).toBe(false)
    expect(curlLooksLikeStream('curl -N -X')).toBe(true)
    expect(curlLooksLikeStream('curl -d')).toBe(false)
  })
})

describe('curlHasAuthHeader', () => {
  it('is true for X-API-Key and Authorization', () => {
    expect(curlHasAuthHeader(ARTICLE_RECOMMENDATION_CURL)).toBe(true)
    expect(
      curlHasAuthHeader('curl -H "Authorization: Bearer secret" https://api.example.com/x')
    ).toBe(true)
  })

  it('is false when there is no auth header', () => {
    expect(curlHasAuthHeader('curl -X GET https://api.example.com/health')).toBe(false)
    expect(
      curlHasAuthHeader('curl -H "Content-Type: application/json" https://api.example.com/x')
    ).toBe(false)
  })
})

describe('httpBindingFromCurl stream flag', () => {
  it('omits stream on a non-streaming POST unless stream is requested', () => {
    const binding = httpBindingFromCurl({
      key: 'recommend_articles',
      curl: ARTICLE_RECOMMENDATION_CURL,
    })
    expect(binding.stream).toBeUndefined()
  })

  it('sets stream: true when the caller requests it', () => {
    const binding = httpBindingFromCurl({
      key: 'recommend_articles',
      curl: ARTICLE_RECOMMENDATION_CURL,
      stream: true,
    })
    expect(binding.stream).toBe(true)
  })

  it('still omits stream when the curl looks like SSE but stream is not requested', () => {
    const binding = httpBindingFromCurl({
      key: 'stream_chat',
      curl: 'curl -N -X POST https://api.example.com/stream',
    })
    expect(binding.stream).toBeUndefined()
  })

  it('keeps form fields and drops protocol keys from a Sim streaming curl', () => {
    const binding = httpBindingFromCurl({
      key: 'recommend_articles',
      curl: SIM_STREAMING_CURL,
      headersSecretName: 'SIM_API_KEY',
      stream: true,
    })
    expect(binding.stream).toBe(true)
    expect(binding.http?.headersSecretName).toBe('SIM_API_KEY')
    expect(binding.http?.authHeaderName).toBe('X-API-Key')
    expect(JSON.stringify(binding)).not.toContain('$SIM_API_KEY')
    expect(binding.inputSchema).toEqual([
      { name: 'input', type: 'string' },
      { name: 'conversationId', type: 'string' },
      { name: 'files', type: 'array' },
      { name: 'keyword', type: 'string' },
      { name: 'client', type: 'string' },
      { name: 'email', type: 'string' },
    ])
  })
})
