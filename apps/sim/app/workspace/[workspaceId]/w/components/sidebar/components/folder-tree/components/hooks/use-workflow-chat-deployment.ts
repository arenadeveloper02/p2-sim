import { useCallback, useState } from 'react'
import { createLogger } from '@/lib/logs/console/logger'
import { extractFieldsFromSchema, parseResponseFormatSafely } from '@/lib/response-format'
import { getBlock } from '@/blocks'
import type { OutputConfig } from '@/stores/panel/chat/types'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'
import { useSubBlockStore } from '@/stores/workflows/subblock/store'
import { useWorkflowStore } from '@/stores/workflows/workflow/store'

const logger = createLogger('WorkflowChatDeployment')

/**
 * State interface for chat deployment operations
 */
interface ChatDeploymentState {
  isLoading: boolean // Main deployment process in progress
  isCheckingStatus: boolean // Status check/polling in progress
  error: string | null // Error message if deployment fails
}

/**
 * Custom hook for deploying and managing workflow chat interfaces
 *
 * This hook handles the complete flow of:
 * 1. Checking if a chat is already deployed for a workflow
 * 2. Deploying the workflow API if needed
 * 3. Deploying the chat interface with default settings
 * 4. Polling for deployment confirmation
 * 5. Redirecting to the chat URL
 *
 * @returns Object containing state and deployment handler
 */
export function useWorkflowChatDeployment() {
  const [state, setState] = useState<ChatDeploymentState>({
    isLoading: false,
    isCheckingStatus: false,
    error: null,
  })

  const { setDeploymentStatus } = useWorkflowRegistry()

  /**
   * Extract available outputs from a workflow for chat deployment
   * Similar to OutputSelect component logic - analyzes workflow blocks
   * to find valid output paths that can be displayed in chat
   */
  const getWorkflowOutputs = useCallback((workflowId: string) => {
    const blocks = useWorkflowStore.getState().blocks
    const subBlockValues = useSubBlockStore.getState().workflowValues[workflowId]
    const outputs: Array<{ blockId: string; path: string }> = []

    if (!blocks || typeof blocks !== 'object') {
      return outputs
    }

    Object.values(blocks).forEach((block) => {
      // Skip starter blocks - they don't produce outputs
      if (block.type === 'starter' || !block.id || !block.type) return

      // Get block configuration from registry
      const blockConfig = getBlock(block.type)

      // Check if block has custom response format defined
      const responseFormatValue = subBlockValues?.[block.id]?.responseFormat
      const responseFormat = parseResponseFormatSafely(responseFormatValue, block.id)

      let outputsToProcess: Record<string, any> = {}

      // Use custom response format if available, otherwise use block's default outputs
      if (responseFormat) {
        const schemaFields = extractFieldsFromSchema(responseFormat)
        if (schemaFields.length > 0) {
          // Convert schema fields to output format
          schemaFields.forEach((field) => {
            outputsToProcess[field.name] = { type: field.type }
          })
        } else {
          // Fallback to block's default outputs
          outputsToProcess = blockConfig?.outputs || {}
        }
      } else {
        outputsToProcess = blockConfig?.outputs || {}
      }

      // Process outputs and create flat list of available paths
      if (Object.keys(outputsToProcess).length > 0) {
        /**
         * Recursively process nested output objects to create flat paths
         * e.g., { user: { name: string, age: number } } becomes ['user.name', 'user.age']
         */
        const addOutput = (path: string, outputObj: any, prefix = '') => {
          const fullPath = prefix ? `${prefix}.${path}` : path

          // If it's a leaf node (has type or is primitive), add as output
          if (typeof outputObj !== 'object' || outputObj === null || 'type' in outputObj) {
            outputs.push({ blockId: block.id, path: fullPath })
            return
          }

          // If it's an object, recurse through its properties
          if (!Array.isArray(outputObj)) {
            Object.entries(outputObj).forEach(([key, value]) => {
              addOutput(key, value, fullPath)
            })
          } else {
            // Arrays are treated as single outputs
            outputs.push({ blockId: block.id, path: fullPath })
          }
        }

        // Process each top-level output
        Object.entries(outputsToProcess).forEach(([key, value]) => {
          addOutput(key, value)
        })
      }
    })

    return outputs
  }, [])

  /**
   * Check if a chat interface is already deployed for the given workflow
   *
   * @param workflowId - The workflow ID to check
   * @returns Promise resolving to deployment status and details
   */
  const checkChatStatus = useCallback(async (workflowId: string) => {
    try {
      setState((prev) => ({ ...prev, isCheckingStatus: true, error: null }))

      const response = await fetch(`/api/workflows/${workflowId}/chat/status`)

      if (response.ok) {
        const data = await response.json()
        return {
          isDeployed: data.isDeployed && data.deployment, // Ensure both flags are true
          deployment: data.deployment || null,
        }
      }

      return { isDeployed: false, deployment: null }
    } catch (error) {
      logger.error('Error checking chat status:', error)
      return { isDeployed: false, deployment: null }
    } finally {
      setState((prev) => ({ ...prev, isCheckingStatus: false }))
    }
  }, [])

  /**
   * Poll the chat status API until deployment is confirmed or timeout is reached
   *
   * This is necessary because chat deployment is asynchronous and we need to wait
   * for the deployment to be fully ready before redirecting the user
   *
   * @param workflowId - The workflow ID to check
   * @param maxAttempts - Maximum number of polling attempts (default: 10)
   * @param intervalMs - Interval between polls in milliseconds (default: 2000)
   * @returns Promise resolving to true if confirmed, false if timeout
   */
  const waitForDeploymentConfirmation = useCallback(
    async (workflowId: string, maxAttempts = 10, intervalMs = 2000) => {
      let attempts = 0

      while (attempts < maxAttempts) {
        const status = await checkChatStatus(workflowId)

        if (status.isDeployed) {
          logger.info('Chat deployment confirmed:', status.deployment)
          return true
        }

        attempts++
        if (attempts < maxAttempts) {
          logger.info(`Waiting for deployment confirmation... (${attempts}/${maxAttempts})`)
          await new Promise((resolve) => setTimeout(resolve, intervalMs))
        }
      }

      logger.warn('Deployment confirmation timeout reached')
      return false
    },
    [checkChatStatus]
  )

  /**
   * Ensure the workflow API is deployed before deploying the chat interface
   *
   * Chat deployments require the workflow to have an API endpoint first.
   * This function checks if the API is already deployed, and if not, deploys it.
   *
   * @param workflowId - The workflow ID to deploy
   * @returns Promise resolving to deployment info including API key
   */
  const ensureWorkflowDeployed = useCallback(
    async (workflowId: string) => {
      try {
        // Check if workflow API is already deployed
        const deploymentStatus = useWorkflowRegistry
          .getState()
          .getWorkflowDeploymentStatus(workflowId)

        if (deploymentStatus?.isDeployed) {
          return { apiKey: deploymentStatus.apiKey }
        }

        // Deploy the workflow API (not the chat interface yet)
        const response = await fetch(`/api/workflows/${workflowId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deployApiEnabled: true, // Deploy the API endpoint
            deployChatEnabled: false, // Don't deploy chat yet - we'll do that separately
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to deploy workflow API')
        }

        const { isDeployed, deployedAt, apiKey } = await response.json()

        // Update deployment status in local store
        setDeploymentStatus(
          workflowId,
          isDeployed,
          deployedAt ? new Date(deployedAt) : undefined,
          apiKey
        )

        return { apiKey }
      } catch (error) {
        logger.error('Error deploying workflow:', error)
        throw error
      }
    },
    [setDeploymentStatus]
  )

  /**
   * Deploy the chat interface with sensible default settings
   *
   * This creates a public chat interface using:
   * - Workflow ID as subdomain (ensures uniqueness)
   * - Workflow name as title
   * - First available output as the chat response
   * - Public authentication (no login required)
   * - Default styling and welcome message
   *
   * @param workflowId - The workflow ID to deploy chat for
   * @param apiKey - The API key for the deployed workflow
   * @returns Promise resolving to the chat URL
   */
  const deployChatWithDefaults = useCallback(
    async (workflowId: string, apiKey: string) => {
      try {
        // Get available outputs from the workflow
        const availableOutputs = getWorkflowOutputs(workflowId)

        if (availableOutputs.length === 0) {
          throw new Error('No outputs available for chat deployment')
        }

        // Use the first available output as the default chat response
        const defaultOutput = availableOutputs[0]
        const outputConfigs: OutputConfig[] = [defaultOutput]

        // Get workflow name for the chat title
        const workflows = useWorkflowRegistry.getState().workflows || {}
        const workflow = workflows[workflowId]
        const workflowName = workflow?.name || 'Chat Assistant'

        // Create chat deployment payload with default settings
        const payload = {
          workflowId,
          subdomain: workflowId, // Use workflowId as subdomain for uniqueness
          title: workflowName,
          description: `Chat interface for ${workflowName}`,
          customizations: {
            primaryColor: 'var(--brand-primary-hover-hex)', // Use brand color
            welcomeMessage: 'Hi there! How can I help you today?', // Friendly default
          },
          authType: 'public', // No authentication required
          outputConfigs,
          apiKey,
          deployApiEnabled: false, // API is already deployed in previous step
        }

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const result = await response.json()

        if (!response.ok) {
          // Handle specific error cases
          if (result.error === 'Subdomain already in use') {
            throw new Error('Chat is already deployed for this workflow')
          }
          throw new Error(result.error || 'Failed to deploy chat')
        }

        if (!result.chatUrl) {
          throw new Error('Response missing chatUrl')
        }

        logger.info('Chat deployed successfully:', result.chatUrl)
        return result.chatUrl
      } catch (error) {
        logger.error('Error deploying chat:', error)
        throw error
      }
    },
    [getWorkflowOutputs]
  )

  /**
   * Main orchestration function for chat deployment and navigation
   *
   * This function handles the complete flow:
   * 1. Check if chat already exists → redirect immediately if so
   * 2. Deploy workflow API if needed
   * 3. Deploy chat interface with defaults
   * 4. Poll for deployment confirmation
   * 5. Navigate to chat URL in same tab
   *
   * Includes robust error handling and fallback navigation for edge cases.
   *
   * @param workflowId - The workflow ID to deploy chat for
   */
  const handleChatDeployment = useCallback(
    async (workflowId: string) => {
      setState({ isLoading: true, isCheckingStatus: false, error: null })

      try {
        // Step 1: Check if chat already exists
        const initialStatus = await checkChatStatus(workflowId)

        if (initialStatus.isDeployed) {
          // Chat already exists, navigate directly
          logger.info('Chat already deployed, opening existing chat')
          const chatUrl = `/chat/${workflowId}`
          window.location.href = chatUrl
          setState({ isLoading: false, isCheckingStatus: false, error: null })
          return
        }

        logger.info('Chat not deployed, starting deployment process')

        // Step 2: Ensure workflow API is deployed first
        const deploymentInfo = await ensureWorkflowDeployed(workflowId)

        // Step 3: Deploy chat with default settings
        try {
          await deployChatWithDefaults(workflowId, deploymentInfo.apiKey)
          logger.info('Chat deployment API call completed')
        } catch (deployError: any) {
          // Handle race conditions where chat was deployed concurrently
          if (
            deployError.message?.includes('already deployed') ||
            deployError.message?.includes('Subdomain already in use')
          ) {
            logger.info('Chat was already deployed (concurrent deployment detected)')
            // Continue to verification step
          } else {
            throw deployError
          }
        }

        // Step 4: Wait for deployment confirmation with polling
        logger.info('Waiting for deployment confirmation...')
        const isConfirmed = await waitForDeploymentConfirmation(workflowId)

        if (isConfirmed) {
          // Step 5a: Deployment confirmed, navigate to chat
          logger.info('Deployment confirmed, opening chat')
          const chatUrl = `/chat/${workflowId}`
          window.location.href = chatUrl
          setState({ isLoading: false, isCheckingStatus: false, error: null })
        } else {
          // Step 5b: Timeout reached, attempt navigation anyway
          logger.warn('Deployment confirmation timed out, attempting to open chat anyway')
          const chatUrl = `/chat/${workflowId}`
          window.location.href = chatUrl
          setState({
            isLoading: false,
            isCheckingStatus: false,
            error:
              "Deployment may still be in progress. If chat doesn't load, please try again in a moment.",
          })
        }
      } catch (error: any) {
        const errorMessage = error.message || 'An unexpected error occurred'
        logger.error('Chat deployment failed:', error)

        setState({
          isLoading: false,
          isCheckingStatus: false,
          error: errorMessage,
        })

        // Fallback: For certain errors, still attempt navigation
        // The chat might exist even if our deployment process failed
        if (
          errorMessage.includes('already deployed') ||
          errorMessage.includes('Subdomain already in use') ||
          errorMessage.includes('timeout')
        ) {
          logger.info('Attempting to open chat despite error')
          window.location.href = `/chat/${workflowId}`
        }
      }
    },
    [checkChatStatus, ensureWorkflowDeployed, deployChatWithDefaults, waitForDeploymentConfirmation]
  )

  // Return hook interface with state and main handler
  return {
    ...state,
    handleChatDeployment,
    checkChatStatus,
  }
}
