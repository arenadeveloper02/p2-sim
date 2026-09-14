'use client'

import Cookies from 'js-cookie'
import mixpanel from 'mixpanel-browser'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { getEnv } from '@/lib/core/config/env'

const logger = createLogger('Mixpanel')

let mixpanelInitialized = false
let mixpanelInitFailed = false

/**
 * Gets the Mixpanel token from environment variables
 * @returns Mixpanel token string or undefined
 */
const getMixpanelToken = () => {
  return getEnv('NEXT_PUBLIC_MIX_PANEL_TOKEN')?.trim() || undefined
}

/**
 * Mixpanel methods exist before `init()`, but calling them throws because
 * persistence is unset. Init lazily so `window.__ENV` has the public token.
 */
const ensureMixpanelInitialized = (): boolean => {
  if (mixpanelInitialized) {
    return true
  }

  if (mixpanelInitFailed || typeof window === 'undefined' || !mixpanel) {
    return false
  }

  const token = getMixpanelToken()
  if (!token) {
    return false
  }

  try {
    if (typeof mixpanel.init !== 'function') {
      mixpanelInitFailed = true
      return false
    }

    mixpanel.init(token)
    mixpanelInitialized = true
    return true
  } catch (error) {
    mixpanelInitFailed = true
    logger.warn('Failed to initialize Mixpanel', { error: getErrorMessage(error) })
    return false
  }
}

export { mixpanel }

const osIdentifier = () => {
  let OSName = 'Unknown OS'
  if (navigator.appVersion.indexOf('Win') !== -1) OSName = 'Windows'
  if (navigator.appVersion.indexOf('Mac') !== -1) OSName = 'MacOS'
  if (navigator.appVersion.indexOf('X11') !== -1) OSName = 'UNIX'
  if (navigator.appVersion.indexOf('Linux') !== -1) OSName = 'Linux'
  return OSName
}

export const identityMP = (name: string) => {
  if (!ensureMixpanelInitialized()) {
    return
  }

  try {
    mixpanel.identify(name)
  } catch (error) {
    logger.warn('Failed to identify user in Mixpanel', { error: getErrorMessage(error) })
  }
}

export const registerMP = (instanceValue: string | null | number) => {
  if (!ensureMixpanelInitialized()) {
    return
  }

  try {
    mixpanel.register({
      instance: instanceValue,
    })
  } catch (error) {
    logger.warn('Failed to register properties in Mixpanel', { error: getErrorMessage(error) })
  }
}

const getPlatformVersion = () => {
  return navigator.userAgent.match(/Windows NT (\d+\.\d+)/)?.[1] || ''
}

export const setPeople = async ({
  email,
  name,
  organizationId,
  organizationRole,
  userType,
  department,
}: {
  email: string
  name: string
  id: string
  organizationId: string
  organizationRole: string
  userType: string
  department: string
}) => {
  if (!ensureMixpanelInitialized()) {
    return
  }

  const appUrl = getEnv('NEXT_PUBLIC_APP_URL') || ''
  const platformVersion = getPlatformVersion()

  const instanceMap: Record<string, string> = {
    'https://agent.thearena.ai': 'Prod',
    'https://sandbox-agent.thearena.ai': 'Sandbox',
    'https://test-agent.thearena.ai': 'Test',
    'https://test-v1-agent.thearena.ai': 'Test V1',
    'https://dev-agent.thearena.ai': 'Dev',
  }
  registerMP(instanceMap[appUrl] || 'Dev')

  try {
    if (!mixpanel.people || typeof mixpanel.people.set !== 'function') {
      return
    }

    if (email) {
      mixpanel.people.set({
        $email: email,
        $name: name || '',
        $os_version: platformVersion,
        'User Type': userType === 'client_stakeholder' ? 'External' : 'Internal',
        'Flow Type': 'Agents',
        Department: department || '',
        isActive: true,
        'Organisation Role': organizationRole || '',
      })
      identityMP(email)
    } else {
      mixpanel.people.set({
        $name: 'Guest User',
        $os_version: platformVersion,
      })
      identityMP('Guest User')
    }
  } catch (error) {
    logger.warn('Failed to set people properties in Mixpanel', { error: getErrorMessage(error) })
  }
}

export const trackMp = async (PageName?: string, eventName?: string, properties?: any) => {
  if (!ensureMixpanelInitialized() || !eventName) {
    return
  }

  const userEmail = Cookies.get('email') || 'Guest User'
  identityMP(userEmail)

  try {
    if (PageName) {
      mixpanel.register({ 'Page Name': PageName })
    }

    const eventProperties = {
      ...properties,
      $os: osIdentifier(),
      $referring_domain: window.location.hostname,
    }
    mixpanel.track(eventName, eventProperties)
  } catch (error) {
    logger.warn('Failed to track event in Mixpanel', { error: getErrorMessage(error) })
  }
}

export const fetchUserProfileSetPeopleMP = async () => {
  if (!ensureMixpanelInitialized()) {
    return
  }

  try {
    // boundary-raw-fetch: Mixpanel identify payload is loaded from the session profile once at workspace entry
    const response = await fetch('/api/users/me/profile')
    const data = await response.json()
    const user = data?.user

    if (user) {
      await setPeople({
        email: user.email || '',
        name: user.name || '',
        id: user.id || '',
        organizationId: user.organizationId || '',
        organizationRole: user.organizationRole || '',
        userType: user.userType || '',
        department: user.department || '',
      })
    }
  } catch (error) {
    logger.warn('Failed to fetch user profile for Mixpanel', { error: getErrorMessage(error) })
  }
}
