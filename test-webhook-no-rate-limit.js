#!/usr/bin/env node

/**
 * Simple test script to verify that webhook API works without rate limiting
 * This script simulates multiple rapid webhook calls to test rate limiting removal
 */

const https = require('https')
const http = require('http')

// Configuration
const WEBHOOK_URL =
  process.env.WEBHOOK_URL || 'http://localhost:3000/api/webhooks/trigger/test-path'
const NUM_REQUESTS = 10 // Number of rapid requests to send
const REQUEST_DELAY = 100 // Delay between requests in milliseconds

// Test payload
const testPayload = {
  event: 'test_event',
  timestamp: new Date().toISOString(),
  message: 'Rate limiting test',
  data: {
    testId: Math.random().toString(36).substring(7),
    iteration: 0,
  },
}

// Function to make a single webhook request
function makeWebhookRequest(iteration) {
  return new Promise((resolve, reject) => {
    const url = new URL(WEBHOOK_URL)
    const isHttps = url.protocol === 'https:'
    const client = isHttps ? https : http

    const payload = JSON.stringify({
      ...testPayload,
      data: {
        ...testPayload.data,
        iteration,
      },
    })

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'Webhook-Rate-Limit-Test/1.0',
      },
    }

    const req = client.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          iteration,
        })
      })
    })

    req.on('error', (err) => {
      reject({
        error: err.message,
        iteration,
      })
    })

    req.write(payload)
    req.end()
  })
}

// Main test function
async function testWebhookRateLimiting() {
  console.log('🚀 Starting webhook rate limiting test...')
  console.log(`📡 Target URL: ${WEBHOOK_URL}`)
  console.log(`🔄 Number of requests: ${NUM_REQUESTS}`)
  console.log(`⏱️  Delay between requests: ${REQUEST_DELAY}ms`)
  console.log('')

  const results = []
  const startTime = Date.now()

  // Send multiple rapid requests
  for (let i = 0; i < NUM_REQUESTS; i++) {
    try {
      const result = await makeWebhookRequest(i + 1)
      results.push(result)

      console.log(`✅ Request ${i + 1}/${NUM_REQUESTS}: Status ${result.statusCode}`)

      // Small delay between requests
      if (i < NUM_REQUESTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY))
      }
    } catch (error) {
      console.log(`❌ Request ${i + 1}/${NUM_REQUESTS}: Error - ${error.error}`)
      results.push(error)
    }
  }

  const endTime = Date.now()
  const totalTime = endTime - startTime

  // Analyze results
  console.log('\n📊 Test Results:')
  console.log(`⏱️  Total time: ${totalTime}ms`)
  console.log(`📈 Average time per request: ${(totalTime / NUM_REQUESTS).toFixed(2)}ms`)

  const successfulRequests = results.filter(
    (r) => r.statusCode && r.statusCode >= 200 && r.statusCode < 300
  )
  const failedRequests = results.filter(
    (r) => r.statusCode && (r.statusCode < 200 || r.statusCode >= 300)
  )
  const errorRequests = results.filter((r) => r.error)

  console.log(`✅ Successful requests: ${successfulRequests.length}/${NUM_REQUESTS}`)
  console.log(`❌ Failed requests: ${failedRequests.length}/${NUM_REQUESTS}`)
  console.log(`💥 Error requests: ${errorRequests.length}/${NUM_REQUESTS}`)

  // Check for rate limiting indicators
  const rateLimitedRequests = results.filter(
    (r) =>
      r.statusCode === 429 ||
      (r.body && r.body.includes('rate limit')) ||
      (r.body && r.body.includes('Rate limit'))
  )

  if (rateLimitedRequests.length > 0) {
    console.log('\n🚨 RATE LIMITING DETECTED:')
    rateLimitedRequests.forEach((req) => {
      console.log(`   Request ${req.iteration}: Status ${req.statusCode} - ${req.body}`)
    })
  } else {
    console.log('\n🎉 NO RATE LIMITING DETECTED - All requests processed successfully!')
  }

  // Show status code distribution
  const statusCodes = {}
  results.forEach((r) => {
    if (r.statusCode) {
      statusCodes[r.statusCode] = (statusCodes[r.statusCode] || 0) + 1
    }
  })

  if (Object.keys(statusCodes).length > 0) {
    console.log('\n📊 Status Code Distribution:')
    Object.entries(statusCodes).forEach(([code, count]) => {
      console.log(`   ${code}: ${count} requests`)
    })
  }

  console.log('\n✨ Test completed!')
}

// Run the test
if (require.main === module) {
  testWebhookRateLimiting().catch(console.error)
}

module.exports = { testWebhookRateLimiting, makeWebhookRequest }
