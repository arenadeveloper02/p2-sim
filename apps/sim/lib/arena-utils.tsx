'use client'

export function getArenaServiceBaseUrl() {
  const hostname = window.location.hostname
  let url = 'https://test-service.thearena.ai'
  if (hostname === 'dev-agent.thearena.ai') {
    url = 'https://dev-service.thearena.ai/'
  } else if (hostname === 'test-agent.thearena.ai') {
    url = 'https://test-service.thearena.ai'
  } else if (hostname === 'sandbox-agent.thearena.ai') {
    url = 'https://sandbox-services.thearena.ai'
  } else if (hostname === 'agent.thearena.ai') {
    url = 'https://service.thearena.ai'
  }
  return url
}
