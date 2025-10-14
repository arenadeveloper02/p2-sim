/**
 * Figma Plugin with 1-minute polling for design data
 * 
 * This plugin continuously polls for design data and creates designs
 * in Figma when new data is received.
 */

// Figma Plugin API types
interface FigmaPluginAPI {
  showUI: (html: string, options?: { width?: number; height?: number }) => void
  hideUI: () => void
  closePlugin: (message?: string) => void
  on: (event: string, callback: (data: any) => void) => void
  postMessage: (message: any) => void
  ui: {
    postMessage: (message: any) => void
    onmessage: (message: any) => void
  }
  clientStorage: {
    getAsync: (key: string) => Promise<any>
    setAsync: (key: string, value: any) => Promise<void>
  }
  createFrame: () => FrameNode
  createRectangle: () => RectangleNode
  createEllipse: () => EllipseNode
  createText: () => TextNode
  createComponent: () => ComponentNode
  createInstance: () => InstanceNode
  createPaintStyle: () => PaintStyle
  createTextStyle: () => TextStyle
  createEffectStyle: () => EffectStyle
  currentPage: PageNode
}

interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
  fills?: Paint[]
  strokes?: Paint[]
  effects?: Effect[]
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL'
  paddingTop?: number
  paddingBottom?: number
  paddingLeft?: number
  paddingRight?: number
  itemSpacing?: number
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX'
  constraints?: LayoutConstraint
  absoluteBoundingBox?: Rect
  size?: Vector
  [key: string]: any
}

interface Paint {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND' | 'IMAGE' | 'EMOJI'
  color?: RGB
  opacity?: number
  gradientStops?: ColorStop[]
  gradientTransform?: Transform
  imageHash?: string
  scaleMode?: 'FILL' | 'FIT' | 'CROP' | 'TILE'
  imageRef?: string
}

interface RGB {
  r: number
  g: number
  b: number
}

interface Effect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR'
  color?: RGB
  offset?: Vector
  radius?: number
  spread?: number
  visible?: boolean
  blendMode?: BlendMode
}

interface Vector {
  x: number
  y: number
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface ColorStop {
  color: RGB
  position: number
}

interface Transform {
  m00: number
  m01: number
  m02: number
  m10: number
  m11: number
  m12: number
}

interface LayoutConstraint {
  horizontal: 'LEFT' | 'RIGHT' | 'CENTER' | 'LEFT_RIGHT' | 'SCALE'
  vertical: 'TOP' | 'BOTTOM' | 'CENTER' | 'TOP_BOTTOM' | 'SCALE'
}

type BlendMode = 'NORMAL' | 'DARKEN' | 'MULTIPLY' | 'LINEAR_BURN' | 'COLOR_BURN' | 'LIGHTEN' | 'SCREEN' | 'LINEAR_DODGE' | 'COLOR_DODGE' | 'OVERLAY' | 'SOFT_LIGHT' | 'HARD_LIGHT' | 'DIFFERENCE' | 'EXCLUSION' | 'HUE' | 'SATURATION' | 'COLOR' | 'LUMINOSITY'

// Global Figma API
declare const figma: FigmaPluginAPI

/**
 * Design data interface
 */
interface DesignData {
  id: string
  type: 'button' | 'card' | 'form' | 'layout' | 'component'
  title: string
  description?: string
  properties: {
    width?: number
    height?: number
    backgroundColor?: string
    textColor?: string
    borderRadius?: number
    padding?: number
    margin?: number
    fontSize?: number
    fontWeight?: number
    fontFamily?: string
  }
  content?: {
    text?: string
    icon?: string
    image?: string
  }
  children?: DesignData[]
  position?: {
    x: number
    y: number
  }
}

/**
 * Main Figma Polling Plugin Class
 */
class FigmaPollingPlugin {
  private isPolling = false
  private pollingInterval?: NodeJS.Timeout
  private config = {
    pollIntervalMs: 60000, // 1 minute
    apiEndpoint: 'http://localhost:3000/api/sqs/poll', // Use local API endpoint
    queueUrl: process.env.FIGMA_SQS_QUEUE_URL || 'https://sqs.us-west-2.amazonaws.com/123456789012/figma-design-queue',
    region: process.env.AWS_REGION || 'us-west-2',
    maxMessages: 10,
    visibilityTimeout: 300,
  }
  private createdDesigns: string[] = []

  constructor() {
    this.initializePlugin()
  }

  /**
   * Initialize the plugin
   */
  private initializePlugin(): void {
    console.log('Initializing Figma Polling Plugin')

    // Set up message handling
    figma.ui.onmessage = (message) => {
      this.handleMessage(message)
    }

    // Show plugin UI
    this.showPluginUI()

    // Start polling
    this.startPolling()

    console.log('Figma Polling Plugin initialized successfully')
  }

  /**
   * Show plugin UI
   */
  private showPluginUI(): void {
    const html = `
      <div style="padding: 20px; font-family: Inter, sans-serif; background: #ffffff;">
        <h2 style="margin: 0 0 16px 0; color: #333; font-size: 18px; font-weight: 600;">Figma Design Poller</h2>
        <p style="margin: 0 0 16px 0; color: #666; font-size: 14px;">Polling for design data every minute...</p>
        
        <div id="status" style="padding: 12px; background: #f8f9fa; border-radius: 8px; margin: 16px 0; border-left: 4px solid #4CAF50;">
          <div style="display: flex; align-items: center;">
            <div id="status-indicator" style="width: 12px; height: 12px; border-radius: 50%; background: #4CAF50; margin-right: 8px; animation: pulse 2s infinite;"></div>
            <span id="status-text" style="font-weight: 500;">Polling Active</span>
          </div>
        </div>

        <div id="stats" style="margin: 16px 0; padding: 12px; background: #f0f0f0; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 14px; color: #666;">Designs Created:</span>
            <span id="designs-count" style="font-weight: 600; color: #333;">0</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 14px; color: #666;">Last Poll:</span>
            <span id="last-poll" style="font-size: 12px; color: #666;">Never</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-size: 14px; color: #666;">Next Poll:</span>
            <span id="next-poll" style="font-size: 12px; color: #666;">In 1 minute</span>
          </div>
        </div>

        <div style="margin: 16px 0;">
          <button id="start-btn" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; margin-right: 8px; font-size: 14px;">Start Polling</button>
          <button id="stop-btn" style="padding: 8px 16px; background: #FF3B30; color: white; border: none; border-radius: 6px; cursor: pointer; margin-right: 8px; font-size: 14px;">Stop Polling</button>
          <button id="clear-btn" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Clear Designs</button>
        </div>

        <div id="log" style="margin: 16px 0; padding: 12px; background: #f8f9fa; border-radius: 8px; max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 12px;">
          <div style="color: #666;">Plugin initialized. Ready to poll for design data...</div>
        </div>

        <style>
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
        </style>
      </div>
    `

    figma.showUI(html, { width: 350, height: 400 })

    // Set up UI event listeners
    setTimeout(() => {
      const startBtn = document.getElementById('start-btn')
      const stopBtn = document.getElementById('stop-btn')
      const clearBtn = document.getElementById('clear-btn')
      
      if (startBtn) {
        startBtn.addEventListener('click', () => {
          this.startPolling()
        })
      }
      
      if (stopBtn) {
        stopBtn.addEventListener('click', () => {
          this.stopPolling()
        })
      }
      
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          this.clearDesigns()
        })
      }
    }, 100)
  }

  /**
   * Handle messages from UI
   */
  private handleMessage(message: any): void {
    console.log('Received message:', message)

    switch (message.type) {
      case 'START_POLLING':
        this.startPolling()
        break
      case 'STOP_POLLING':
        this.stopPolling()
        break
      case 'CLEAR_DESIGNS':
        this.clearDesigns()
        break
      case 'GET_STATUS':
        this.sendStatus()
        break
      default:
        console.warn('Unknown message type:', message.type)
    }
  }

  /**
   * Start polling for design data
   */
  private startPolling(): void {
    if (this.isPolling) {
      console.log('Polling is already active')
      return
    }

    this.isPolling = true
    this.updateStatus('Polling Active', '#4CAF50')
    this.logMessage('Started polling for design data...')

    // Poll immediately
    this.pollForData()

    // Set up interval for continuous polling
    this.pollingInterval = setInterval(() => {
      this.pollForData()
    }, this.config.pollIntervalMs)

    this.updateNextPollTime()
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (!this.isPolling) {
      return
    }

    this.isPolling = false
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = undefined
    }

    this.updateStatus('Polling Stopped', '#FF3B30')
    this.logMessage('Stopped polling for design data')
  }

  /**
   * Poll for design data
   */
  private async pollForData(): Promise<void> {
    try {
      this.logMessage('Polling for new design data...')
      this.updateLastPollTime()

      // Call the actual API endpoint
      const response = await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queueUrl: this.config.queueUrl,
          region: this.config.region,
          maxMessages: this.config.maxMessages,
          visibilityTimeout: this.config.visibilityTimeout,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      if (data.success && data.messages && data.messages.length > 0) {
        this.logMessage(`Received ${data.messages.length} new design messages`)
        
        for (const message of data.messages) {
          try {
            const designData = JSON.parse(message.body)
            await this.createDesignInFigma(designData)
            this.createdDesigns.push(designData.id || `design-${Date.now()}`)
            
            // Delete the message after successful processing
            await this.deleteMessage(message.receiptHandle)
          } catch (error) {
            console.error('Error processing individual message:', error)
            this.logMessage(`Error processing message: ${error.message}`)
          }
        }
        
        this.updateDesignsCount()
      } else {
        this.logMessage('No new data available')
      }

      this.updateNextPollTime()
    } catch (error) {
      console.error('Error polling for data:', error)
      this.logMessage(`Error: ${error.message}`)
    }
  }

  /**
   * Create a sample design (replace with actual API call)
   */
  private async createSampleDesign(): Promise<void> {
    try {
      const designTypes = ['button', 'card', 'form', 'layout', 'component']
      const randomType = designTypes[Math.floor(Math.random() * designTypes.length)]
      
      const designData: DesignData = {
        id: `design-${Date.now()}`,
        type: randomType as any,
        title: `${randomType.charAt(0).toUpperCase() + randomType.slice(1)} Design`,
        description: `Auto-generated ${randomType} design`,
        properties: {
          width: 200 + Math.random() * 200,
          height: 100 + Math.random() * 100,
          backgroundColor: this.getRandomColor(),
          textColor: '#ffffff',
          borderRadius: Math.random() * 20,
          padding: 16,
          fontSize: 14 + Math.random() * 8,
          fontWeight: 400,
        },
        content: {
          text: `Sample ${randomType} content`,
        },
        position: {
          x: Math.random() * 400,
          y: Math.random() * 400,
        },
      }

      await this.createDesignInFigma(designData)
      this.createdDesigns.push(designData.id)
      this.updateDesignsCount()
      this.logMessage(`Created ${designData.type} design: ${designData.title}`)
    } catch (error) {
      console.error('Error creating sample design:', error)
      this.logMessage(`Error creating design: ${error.message}`)
    }
  }

  /**
   * Create design in Figma
   */
  private async createDesignInFigma(designData: DesignData): Promise<void> {
    try {
      let node: any

      // Create node based on type
      switch (designData.type) {
        case 'button':
          node = figma.createRectangle()
          break
        case 'card':
          node = figma.createFrame()
          break
        case 'form':
          node = figma.createFrame()
          break
        case 'layout':
          node = figma.createFrame()
          break
        case 'component':
          node = figma.createComponent()
          break
        default:
          node = figma.createFrame()
      }

      // Set basic properties
      node.name = designData.title
      
      // Set size
      if (designData.properties.width && designData.properties.height) {
        node.resize(designData.properties.width, designData.properties.height)
      }

      // Set position
      if (designData.position) {
        node.x = designData.position.x
        node.y = designData.position.y
      }

      // Set background color
      if (designData.properties.backgroundColor) {
        const color = this.parseColor(designData.properties.backgroundColor)
        node.fills = [{
          type: 'SOLID',
          color: color,
          opacity: 1,
        }]
      }

      // Set border radius
      if (designData.properties.borderRadius) {
        node.cornerRadius = designData.properties.borderRadius
      }

      // Add text content
      if (designData.content?.text) {
        const textNode = figma.createText()
        textNode.characters = designData.content.text
        
        if (designData.properties.fontSize) {
          textNode.fontSize = designData.properties.fontSize
        }
        
        if (designData.properties.textColor) {
          const textColor = this.parseColor(designData.properties.textColor)
          textNode.fills = [{
            type: 'SOLID',
            color: textColor,
            opacity: 1,
          }]
        }

        // Center text in the node
        textNode.x = (node.width - textNode.width) / 2
        textNode.y = (node.height - textNode.height) / 2
        
        node.appendChild(textNode)
      }

      // Add to current page
      figma.currentPage.appendChild(node)

      console.log(`Created ${designData.type} design: ${designData.title}`)
    } catch (error) {
      console.error(`Error creating design ${designData.title}:`, error)
      throw error
    }
  }

  /**
   * Parse color string to RGB
   */
  private parseColor(colorString: string): RGB {
    // Handle hex colors
    if (colorString.startsWith('#')) {
      const hex = colorString.slice(1)
      const r = parseInt(hex.substr(0, 2), 16) / 255
      const g = parseInt(hex.substr(2, 2), 16) / 255
      const b = parseInt(hex.substr(4, 2), 16) / 255
      return { r, g, b }
    }

    // Handle rgb() colors
    if (colorString.startsWith('rgb(')) {
      const values = colorString.match(/\d+/g)
      if (values && values.length >= 3) {
        return {
          r: parseInt(values[0]) / 255,
          g: parseInt(values[1]) / 255,
          b: parseInt(values[2]) / 255,
        }
      }
    }

    // Default to black
    return { r: 0, g: 0, b: 0 }
  }

  /**
   * Get random color
   */
  private getRandomColor(): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ]
    return colors[Math.floor(Math.random() * colors.length)]
  }

  /**
   * Clear all created designs
   */
  private clearDesigns(): void {
    try {
      // Find and delete all created designs
      const nodesToDelete = figma.currentPage.children.filter(node => 
        this.createdDesigns.some(designId => node.name.includes(designId))
      )

      nodesToDelete.forEach(node => {
        node.remove()
      })

      this.createdDesigns = []
      this.updateDesignsCount()
      this.logMessage('Cleared all created designs')
    } catch (error) {
      console.error('Error clearing designs:', error)
      this.logMessage(`Error clearing designs: ${error.message}`)
    }
  }

  /**
   * Update status in UI
   */
  private updateStatus(text: string, color: string): void {
    figma.ui.postMessage({
      type: 'UPDATE_STATUS',
      data: { text, color }
    })
  }

  /**
   * Update designs count
   */
  private updateDesignsCount(): void {
    figma.ui.postMessage({
      type: 'UPDATE_DESIGNS_COUNT',
      data: { count: this.createdDesigns.length }
    })
  }

  /**
   * Update last poll time
   */
  private updateLastPollTime(): void {
    const now = new Date()
    const timeString = now.toLocaleTimeString()
    figma.ui.postMessage({
      type: 'UPDATE_LAST_POLL',
      data: { time: timeString }
    })
  }

  /**
   * Update next poll time
   */
  private updateNextPollTime(): void {
    const nextPoll = new Date(Date.now() + this.config.pollIntervalMs)
    const timeString = nextPoll.toLocaleTimeString()
    figma.ui.postMessage({
      type: 'UPDATE_NEXT_POLL',
      data: { time: timeString }
    })
  }

  /**
   * Log message to UI
   */
  private logMessage(message: string): void {
    const timestamp = new Date().toLocaleTimeString()
    figma.ui.postMessage({
      type: 'LOG_MESSAGE',
      data: { message: `[${timestamp}] ${message}` }
    })
  }

  /**
   * Delete message from SQS queue
   */
  private async deleteMessage(receiptHandle: string): Promise<void> {
    try {
      const response = await fetch('http://localhost:3000/api/sqs/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queueUrl: this.config.queueUrl,
          region: this.config.region,
          receiptHandle: receiptHandle,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        this.logMessage('Message deleted from queue')
      } else {
        this.logMessage(`Failed to delete message: ${data.error}`)
      }
    } catch (error) {
      console.error('Error deleting message:', error)
      this.logMessage(`Error deleting message: ${error.message}`)
    }
  }

  /**
   * Send current status
   */
  private sendStatus(): void {
    figma.ui.postMessage({
      type: 'STATUS_UPDATE',
      data: {
        isPolling: this.isPolling,
        designsCount: this.createdDesigns.length,
        config: this.config,
      }
    })
  }
}

// Initialize the plugin when loaded
new FigmaPollingPlugin()

// Export for testing
export { FigmaPollingPlugin }
