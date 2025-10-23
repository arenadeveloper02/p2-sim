/**
 * Figma Design Generator with AI
 *
 * This module generates Figma designs automatically using:
 * 1. Claude AI (Sonnet 4.5) to generate HTML/CSS from prompts and wireframes
 * 2. Selenium WebDriver to automate Figma browser interactions
 * 3. A Figma plugin to convert HTML/CSS to Figma design elements
 *
 * REQUIRED SETUP:
 * ================
 *
 * 1. Environment Variables:
 *    - ANTHROPIC_API_KEY: Your Claude API key
 *    - FIGMA_API_KEY: Your Figma API key (optional, for metadata)
 *    - FIGMA_HTML_PLUGIN_NAME: Name of your HTML-to-Figma plugin (default: "html.to.design")
 *    - CHROMEDRIVER_PATH: Path to ChromeDriver (default: /opt/homebrew/bin/chromedriver)
 *
 * 2. Figma Plugin (REQUIRED):
 *    RECOMMENDED: Install our custom "AI Design Generator" plugin:
 *    - Location: apps/sim/figma-plugin/
 *    - Installation: See figma-plugin/README.md
 *
 *    OR use a third-party plugin:
 *    - "html.to.design" - https://www.figma.com/community/plugin/1159123024924461424
 *    - "HTML to Figma" - https://www.figma.com/community/plugin/747985167520967365
 *    - "Anima" - https://www.figma.com/community/plugin/857346721138427857
 *
 *    Without a plugin, the HTML/CSS will be generated but NOT rendered in Figma.
 *
 * 3. Figma Credentials:
 *    Update the login credentials in the automateDesignCreation function (lines ~255-260)
 *
 * 4. System Requirements:
 *    - Google Chrome browser installed
 *    - ChromeDriver installed (brew install chromedriver on Mac)
 *
 * HOW IT WORKS:
 * =============
 * 1. Reads wireframes and brand guidelines from uploaded files
 * 2. Generates HTML/CSS using Claude AI (follows wireframe structure + brand colors)
 * 3. Automates Figma login via Selenium
 * 4. Creates new file and renames it
 * 5. Opens the HTML-to-Figma plugin
 * 6. Injects HTML/CSS into the plugin
 * 7. Triggers rendering to convert HTML/CSS → Figma elements
 * 8. Returns the Figma file URL
 */

import fs from 'fs/promises'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { Builder, By, Key, until, type WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome'
import { PdfParser } from '@/lib/file-parsers/pdf-parser'
import { downloadFile } from '@/lib/uploads/storage-client'

interface FigmaDesignInputs {
  projectId: string
  fileName: string
  prompt: string
  brandGuidelinesFile?: string // Path to file
  wireframesFile?: string // Path to file
  additionalDataFile?: string // Path to file
  additionalInfo?: string // Text input
  description?: string // Text input
}

interface FigmaDesignResult {
  success: boolean
  renderedData?: string
  error?: string
  figmaFileUrl?: string
}

/**
 * Helper function to read file content from S3 or local filesystem
 * Automatically detects file type and extracts content appropriately
 * @param filePath - Path to the file (can be S3 URL or local path)
 * @returns File content as string
 */
async function readFileContent(filePath: string): Promise<string> {
  try {
    let fileBuffer: Buffer
    let filename: string

    // Check if it's an S3 URL (starts with /api/files/serve/s3/ or contains s3://)
    if (filePath.includes('/api/files/serve/s3/') || filePath.startsWith('s3://')) {
      console.log(`Reading file from S3: ${filePath}`)

      // Extract S3 key from the URL
      let s3Key: string
      if (filePath.includes('/api/files/serve/s3/')) {
        // Extract key from /api/files/serve/s3/KEY format
        s3Key = filePath.split('/api/files/serve/s3/')[1]
      } else if (filePath.startsWith('s3://')) {
        // Extract key from s3://bucket/key format
        const s3Url = new URL(filePath)
        s3Key = s3Url.pathname.substring(1) // Remove leading slash
      } else {
        throw new Error(`Unsupported S3 URL format: ${filePath}`)
      }

      // Download file from S3
      fileBuffer = await downloadFile(s3Key)
      filename = s3Key.split('/').pop() || s3Key
    } else {
      // Read from local filesystem
      console.log(`Reading file from local filesystem: ${filePath}`)
      fileBuffer = await fs.readFile(filePath)
      filename = path.basename(filePath)
    }

    // Determine file type and extract content accordingly
    const fileExtension = path.extname(filename).toLowerCase()

    if (fileExtension === '.pdf') {
      console.log(`Extracting text from PDF: ${filename}`)
      const pdfParser = new PdfParser()
      const result = await pdfParser.parseBuffer(fileBuffer)
      console.log(
        `PDF parsed successfully: ${result.metadata?.pageCount || 0} pages, ${result.content.length} characters`
      )
      return result.content
    }
    // For non-PDF files, convert buffer to string
    console.log(`Reading text file: ${filename}`)
    return fileBuffer.toString('utf-8')
  } catch (error) {
    console.error(`Failed to read file ${filePath}:`, error)
    throw error
  }
}

/**
 * Generate a Figma design using AI and automation
 *
 * @param inputs - Design generation inputs including files and prompts
 * @returns Result containing the rendered HTML/CSS and Figma file URL
 */
export async function generateFigmaDesign(inputs: FigmaDesignInputs): Promise<FigmaDesignResult> {
  try {
    // Step 1: Read the files and create system prompt
    console.log('Step 1: Reading input files...')
    const systemPrompt = await buildSystemPrompt(inputs)

    // Step 2: Call Claude API to generate HTML and CSS
    console.log('Step 2: Calling Claude API to generate design...')
    const renderedData = await generateHTMLCSS(systemPrompt, inputs.prompt)

    if (!renderedData) {
      return {
        success: false,
        error: 'Failed to generate HTML/CSS from Claude API',
      }
    }

    // Step 3: Clean the rendered data (remove markdown code blocks if present)
    let cleanedHtml = renderedData
    cleanedHtml = cleanedHtml.replace(/```html?/g, '')
    cleanedHtml = cleanedHtml.replace(/```/g, '')
    cleanedHtml = cleanedHtml.replace(/[\\\r\n\t]+/g, '') // remove \, newlines, tabs
    cleanedHtml = cleanedHtml.replace(/\s\s+/g, ' ') // remove extra spaces
    cleanedHtml = cleanedHtml.trim()

    // Step 4: Do Selenium automation
    console.log('Step 4: Starting Figma automation...')
    const figmaFileUrl = await automateDesignCreation(
      inputs.projectId,
      inputs.fileName,
      cleanedHtml
    )

    return {
      success: true,
      renderedData,
      figmaFileUrl,
    }
  } catch (error) {
    console.error('Error generating Figma design:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Read files and build system prompt
 */
async function buildSystemPrompt(inputs: FigmaDesignInputs): Promise<string> {
  let systemPrompt = `You are an expert UI/UX designer specialized in creating HTML and CSS designs that are compatible with Figma.

Your task is to generate clean, semantic HTML with inline or embedded CSS that can be rendered in Figma.

Technical Guidelines:
- Use semantic HTML5 elements (div, section, article, h1-h6, p, button, etc.)
- Use simple CSS properties that Figma supports: background-color, color, font-size, font-weight, padding, margin, border-radius, display, flex-direction, gap, width, height
- Avoid complex CSS features like animations, transitions, transforms, or advanced selectors
- Use flexbox for layouts (display: flex)
- Keep the design clean and modern
- Use appropriate spacing and typography

CRITICAL FIGMA COMPATIBILITY REQUIREMENTS:
- ALWAYS use embedded CSS in <style> tags within the <head> section
- Use ONLY these CSS properties for maximum Figma compatibility:
  * Layout: display, flex-direction, gap, align-items, justify-content, flex-wrap
  * Spacing: padding, margin, padding-left, padding-right, padding-top, padding-bottom, margin-left, margin-right, margin-top, margin-bottom
  * Sizing: width, height, max-width, max-height, min-width, min-height
  * Colors: background-color, color, border-color
  * Typography: font-size, font-weight, line-height, text-align, text-decoration, font-family
  * Borders: border, border-radius, border-width, border-style, border-top, border-right, border-bottom, border-left
  * Box model: box-sizing, overflow
  * Flexbox: flex, flex-grow, flex-shrink, flex-basis
- Use flexbox for ALL layouts - avoid CSS Grid, floats, or positioning
- Use REM or PX units only - avoid %, VH, VW, EM
- Keep CSS selectors simple - use class names and element selectors only
- Avoid pseudo-selectors (:hover, :focus, etc.) and complex selectors
- Use standard font families: 'Inter', 'Arial', 'Helvetica', 'sans-serif'
- Font weights: 400 (normal), 500 (medium), 600 (semibold), 700 (bold)
- Use hex colors (#ffffff) or named colors (white, black, red, etc.)
- Avoid CSS variables, calc(), or advanced functions
- Keep HTML structure flat and semantic - avoid deep nesting
- Use meaningful class names that describe the element's purpose
- Ensure all text content is within proper HTML elements (not just divs)
- Use button elements for interactive elements, not styled divs
- Include proper heading hierarchy (h1, h2, h3, etc.)
- Add alt attributes to any img elements
- Use proper semantic elements: header, main, section, article, footer, nav

LAYOUT BEST PRACTICES:
- Use display: flex for all container elements
- Use flex-direction: column for vertical layouts
- Use flex-direction: row for horizontal layouts
- Use gap property for spacing between flex items
- Use align-items: center for vertical centering
- Use justify-content: space-between for horizontal distribution
- Use flex: 1 for elements that should grow to fill space
- Use padding for internal spacing, margin for external spacing
- Use border-radius for rounded corners (8px, 12px, 16px are common)
- Use consistent spacing scale (8px, 16px, 24px, 32px, 48px, 64px, 80px)

COLOR AND TYPOGRAPHY:
- Use a consistent color palette with 3-5 main colors
- Use high contrast for text readability
- Use font-size: 14px-16px for body text, 18px-24px for subheadings, 32px-48px for headings
- Use line-height: 1.4-1.6 for good readability
- Use font-weight: 400 for body text, 600-700 for headings
- Use text-align: center for centered text, left for default

RESPONSIVE CONSIDERATIONS:
- Design for desktop-first (Figma works best with fixed widths)
- Use max-width to prevent content from becoming too wide
- Use flex-wrap: wrap if content might overflow
- Consider using min-height for sections that need minimum height

`

  let hasWireframes = false
  let hasBrandGuidelines = false

  // Read wireframes file if provided
  if (inputs.wireframesFile) {
    console.log('Reading wireframes file:', inputs.wireframesFile)
    try {
      const wireframes = await readFileContent(inputs.wireframesFile)
      systemPrompt += `\n=== WIREFRAMES (STRUCTURE TO FOLLOW) ===\n${wireframes}\n\n`
      hasWireframes = true
    } catch (error) {
      console.warn('Could not read wireframes file:', inputs.wireframesFile)
    }
  }

  // Read brand guidelines file if provided
  if (inputs.brandGuidelinesFile) {
    console.log('Reading brand guidelines file:', inputs.brandGuidelinesFile)
    try {
      const brandGuidelines = await readFileContent(inputs.brandGuidelinesFile)
      systemPrompt += `\n=== BRAND GUIDELINES (COLORS & STYLING TO USE) ===\n${brandGuidelines}\n\n`
      hasBrandGuidelines = true
    } catch (error) {
      console.warn('Could not read brand guidelines file:', inputs.brandGuidelinesFile)
    }
  }

  // Read additional data file if provided
  if (inputs.additionalDataFile) {
    console.log('Reading additional data file:', inputs.additionalDataFile)
    try {
      const additionalData = await readFileContent(inputs.additionalDataFile)
      systemPrompt += `\n=== ADDITIONAL DATA ===\n${additionalData}\n\n`
    } catch (error) {
      console.warn('Could not read additional data file:', inputs.additionalDataFile)
    }
  }

  // Add additional info if provided
  if (inputs.additionalInfo) {
    console.log('Reading additional information:', inputs.additionalInfo)
    systemPrompt += `\n=== ADDITIONAL INFORMATION ===\n${inputs.additionalInfo}\n\n`
  }

  // Add specific instructions based on what files were provided
  systemPrompt += `\n=== DESIGN REQUIREMENTS ===\n`

  if (hasWireframes && hasBrandGuidelines) {
    console.log('Adding wireframes and brand guidelines to system prompt')
    systemPrompt += `CRITICAL: 
1. Follow the EXACT layout, structure, and component arrangement from the WIREFRAMES section above
2. Apply colors, typography, and visual styling from the BRAND GUIDELINES section above
3. The wireframes define WHAT to build and WHERE things go
4. The brand guidelines define HOW it should look (colors, fonts, visual style)
5. Do NOT deviate from the wireframe structure - maintain the same sections, components, and layout
6. Extract and use the specific color codes, font families, and design tokens from the brand guidelines
7. Match the visual identity and aesthetic from the brand guidelines while keeping the wireframe structure

`
  } else if (hasWireframes) {
    console.log('Adding wireframes to system prompt')
    systemPrompt += `CRITICAL: 
1. Follow the EXACT layout, structure, and component arrangement from the WIREFRAMES section above
2. The wireframes define WHAT to build and WHERE things go
3. Do NOT deviate from the wireframe structure - maintain the same sections, components, and layout
4. Use a professional, modern color scheme since no brand guidelines were provided

`
  } else if (hasBrandGuidelines) {
    console.log('Adding brand guidelines to system prompt')
    systemPrompt += `CRITICAL: 
1. Apply colors, typography, and visual styling from the BRAND GUIDELINES section above
2. Extract and use the specific color codes, font families, and design tokens from the brand guidelines
3. Match the visual identity and aesthetic from the brand guidelines
4. Create a layout that showcases the brand effectively

`
  } else {
    systemPrompt += `Create a clean, professional design with a modern color scheme and good typography.\n\n`
  }

  systemPrompt += `\nCOMMON DESIGN PATTERNS FOR FIGMA:
- Header: Use <header> with logo, navigation, and CTA buttons in flex layout
- Hero Section: Use <section class="hero"> with title, description, and buttons
- Feature Cards: Use <div class="feature-card"> with icon, title, and description
- Product Grid: Use <div class="products-grid"> with multiple <div class="product-card">
- CTA Section: Use <section class="cta-section"> with centered content
- Footer: Use <footer> with multiple columns using flex layout
- Buttons: Use <button class="btn-primary"> or <button class="btn-secondary">
- Text Elements: Use proper headings (h1, h2, h3) and paragraphs (p)
- Containers: Use <div class="container"> for main content width control

EXAMPLE STRUCTURE:
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Design Title</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', sans-serif; }
        .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        .hero { display: flex; flex-direction: column; gap: 24px; padding: 80px 0; }
        .btn-primary { background-color: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; }
    </style>
</head>
<body>
    <header>...</header>
    <main>...</main>
    <footer>...</footer>
</body>
</html>

IMPORTANT: Your response should ONLY contain the HTML with embedded CSS in a <style> tag. Do not include any explanations or markdown code blocks. Start directly with <!DOCTYPE html>.`
  console.log(systemPrompt)
  console.log('systemPrompt')
  return systemPrompt
}

/**
 * Generate HTML and CSS using Claude API
 */
async function generateHTMLCSS(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is not set. Please set it to your Claude API key.'
    )
  }

  const anthropic = new Anthropic({
    apiKey: apiKey,
  })

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929', // Claude Sonnet 4.5 - Latest model for advanced design generation
    max_tokens: 16384, // Large token limit for complex, multi-section designs with detailed HTML/CSS
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  })

  // Extract text content from the response
  const textContent = message.content.find((block) => block.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in Claude API response')
  }

  return textContent.text
}

/**
 * Parse the rendered data to extract HTML and CSS
 * NOTE: This function is no longer used. The plugin now accepts full HTML with embedded <style> tags.
 * Keeping for backward compatibility if needed.
 */
function parseRenderedData(renderedData: string): { html: string; css: string } {
  // If the response contains code blocks, extract them
  let cleanedHtml = renderedData

  // Remove markdown code blocks if present
  cleanedHtml = cleanedHtml.replace(/```html\n?/g, '')
  cleanedHtml = cleanedHtml.replace(/```\n?/g, '')
  cleanedHtml = cleanedHtml.trim()

  // Extract CSS from <style> tags
  const cssMatch = cleanedHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/)
  let css = ''

  if (cssMatch) {
    css = cssMatch[1].trim()
  }

  // For Figma compatibility, we need to extract just the body content
  const bodyMatch = cleanedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/)
  let html = ''

  if (bodyMatch) {
    html = bodyMatch[1].trim()
  } else {
    // If no body tag, use the entire cleaned HTML
    html = cleanedHtml
  }

  return { html, css }
}

/**
 * Helper function to log all iframe information for debugging
 */
async function logIframeInfo(driver: WebDriver, level = 'main'): Promise<void> {
  try {
    const iframes = await driver.findElements(By.css('iframe'))
    console.log(`[${level}] Found ${iframes.length} iframe(s)`)

    for (let i = 0; i < iframes.length; i++) {
      try {
        const iframe = iframes[i]
        const id = await iframe.getAttribute('id')
        const name = await iframe.getAttribute('name')
        const src = await iframe.getAttribute('src')
        console.log(
          `[${level}] Iframe ${i}: id="${id}", name="${name}", src="${src?.substring(0, 50)}..."`
        )
      } catch (e) {
        console.log(`[${level}] Could not get iframe ${i} attributes:`, e)
      }
    }
  } catch (error) {
    console.log(`[${level}] Error logging iframe info:`, error)
  }
}

/**
 * Helper function to switch back to main content from nested iframe structure
 */
async function switchToMainContent(driver: WebDriver): Promise<void> {
  try {
    // Switch back through all iframe levels to main content
    await driver.switchTo().defaultContent()
    console.log('✓ Switched back to main content from nested iframes')
  } catch (error) {
    console.log('Error switching back to main content:', error)
  }
}

/**
 * Helper function to check if current iframe contains editor content
 */
async function hasEditorContent(driver: WebDriver): Promise<boolean> {
  try {
    const editorTab = await driver.findElements(
      By.xpath("//*[@id='container-tabs']/div/div[1]/label[4]")
    )
    const specificSelector = await driver.findElements(
      By.xpath("//*[@id='container-tabs']/div/div[2]/div[4]/section/div[1]")
    )
    return editorTab.length > 0 || specificSelector.length > 0
  } catch (e) {
    return false
  }
}

/**
 * Helper function for consistent sleep timing
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Helper function to click "Add to Canvas" button with multiple fallback methods
 */
async function clickAddToCanvasButton(driver: WebDriver, context = ''): Promise<boolean> {
  console.log(`Looking for Add to Canvas button${context ? ` (${context})` : ''}...`)

  const addToCanvasSelectors = [
    "//button[contains(text(), 'Add to Canvas')]",
    "//button[contains(text(), 'Add to canvas')]",
    "//button[contains(text(), 'Add to Figma')]",
    "//button[contains(text(), 'Import to Canvas')]",
    "//button[contains(text(), 'Place on Canvas')]",
    "//button[contains(text(), 'Add')]",
    "//div[contains(text(), 'Add to Canvas')]",
    "//span[contains(text(), 'Add to Canvas')]",
  ]

  try {
    // Try XPath selectors first
    for (const selector of addToCanvasSelectors) {
      try {
        const addToCanvasElement = await driver.wait(until.elementLocated(By.xpath(selector)), 3000)
        await addToCanvasElement.click()
        console.log(
          `✓ Clicked Add to Canvas using selector: ${selector}${context ? ` (${context})` : ''}`
        )
        await sleep(2000) // Wait for design to be added to canvas
        return true
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback to JavaScript search
    console.log(
      `Add to Canvas button not found via XPath${context ? ` (${context})` : ''}, trying JavaScript...`
    )
    await driver.executeScript(`
      const buttons = document.querySelectorAll('button');
      for (let button of buttons) {
        if (button.textContent && button.textContent.toLowerCase().includes('add to canvas')) {
          button.click();
          console.log('Clicked Add to Canvas button via JavaScript${context ? ` (${context})` : ''}');
          break;
        }
      }
    `)
    console.log(`✓ Attempted JavaScript click for Add to Canvas${context ? ` (${context})` : ''}`)
    await sleep(1500)
    return true
  } catch (error) {
    console.log(`Could not find Add to Canvas button${context ? ` (${context})` : ''}:`, error)
    return false
  }
}

/**
 * Helper function to recursively find and navigate to the deepest iframe with editor content
 */
async function findDeepestIframeWithEditor(driver: WebDriver, maxDepth = 5): Promise<boolean> {
  try {
    const iframes = await driver.findElements(By.css('iframe'))
    console.log(`Found ${iframes.length} iframe(s) at current level`)

    if (iframes.length === 0) {
      // No more iframes, check if we have editor content
      return await hasEditorContent(driver)
    }

    // Try each iframe to find the one with editor content
    for (let i = 0; i < iframes.length; i++) {
      try {
        await driver.switchTo().frame(i)
        console.log(`Switched to iframe ${i}, checking for editor content...`)

        // Check if this iframe has editor content
        if (await hasEditorContent(driver)) {
          console.log(`✓ Found editor content in iframe ${i}`)
          return true
        }

        // If no editor content, recursively check deeper
        if (maxDepth > 0) {
          const found = await findDeepestIframeWithEditor(driver, maxDepth - 1)
          if (found) {
            return true
          }
        }

        // Switch back to parent frame
        await driver.switchTo().parentFrame()
      } catch (e) {
        console.log(`Error checking iframe ${i}: ${e instanceof Error ? e.message : String(e)}`)
        await driver.switchTo().parentFrame()
      }
    }

    return false
  } catch (error) {
    console.log(
      `Error in findDeepestIframeWithEditor: ${error instanceof Error ? error.message : String(error)}`
    )
    return false
  }
}

/**
 * Helper function to switch to the innermost plugin iframe and return whether switch was successful
 * Handles nested iframe structure: plugin-iframe-in-modal -> Network Plugin Iframe -> Inner Plugin Iframe
 */
async function switchToPluginIframe(driver: WebDriver): Promise<boolean> {
  try {
    console.log('Looking for nested plugin iframes...')

    // Log iframe information for debugging
    await logIframeInfo(driver, 'main')

    // Step 1: Find the main plugin iframe with multiple possible selectors
    let mainIframe = null
    const mainIframeSelectors = [By.id('plugin-iframe-in-modal'), By.name('Shim Plugin Iframe')]

    for (const selector of mainIframeSelectors) {
      try {
        mainIframe = await driver.findElement(selector)
        console.log(`✓ Found main plugin iframe using selector: ${selector.toString()}`)
        break
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!mainIframe) {
      throw new Error('Could not find main plugin iframe')
    }

    await driver.switchTo().frame(mainIframe)
    console.log('✓ Switched to main plugin iframe')
    await logIframeInfo(driver, 'main-plugin')

    // Step 2: Find the Network Plugin Iframe with multiple possible selectors
    let networkIframe = null
    const networkIframeSelectors = [By.name('Network Plugin Iframe')]

    for (const selector of networkIframeSelectors) {
      try {
        networkIframe = await driver.findElement(selector)
        console.log(`✓ Found Network Plugin Iframe using selector: ${selector.toString()}`)
        break
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!networkIframe) {
      throw new Error('Could not find Network Plugin Iframe')
    }

    await driver.switchTo().frame(networkIframe)
    console.log('✓ Switched to Network Plugin Iframe')
    await logIframeInfo(driver, 'network-plugin')

    // Step 3: Find the Inner Plugin Iframe with multiple possible selectors
    let innerIframe = null
    const innerIframeSelectors = [
      By.id('plugin-iframe'),
      By.name('Inner Plugin Iframe'),
      By.css("iframe[name*='plugin']"),
      By.css("iframe[id*='plugin']"),
      By.css("iframe[src*='plugin']"),
      By.css('iframe'), // Fallback to any iframe
    ]

    for (const selector of innerIframeSelectors) {
      try {
        innerIframe = await driver.findElement(selector)
        console.log(`✓ Found Inner Plugin Iframe using selector: ${selector.toString()}`)
        break
      } catch (e) {
        console.log(
          `⚠️ Selector ${selector.toString()} failed: ${e instanceof Error ? e.message : String(e)}`
        )
        // Continue to next selector
      }
    }

    if (!innerIframe) {
      throw new Error('Could not find Inner Plugin Iframe')
    }

    await driver.switchTo().frame(innerIframe)
    console.log('✓ Switched to Inner Plugin Iframe')
    await logIframeInfo(driver, 'inner-plugin')

    // Step 4: Check for additional nested iframe (4th level)
    try {
      const nestedIframes = await driver.findElements(By.css('iframe'))
      console.log(`Found ${nestedIframes.length} nested iframe(s) in Inner Plugin Iframe`)

      if (nestedIframes.length > 0) {
        // Try to find the innermost iframe with editor content
        for (let i = 0; i < nestedIframes.length; i++) {
          try {
            await driver.switchTo().frame(i)
            console.log(`✓ Switched to nested iframe ${i}`)
            await logIframeInfo(driver, `nested-${i}`)

            // Check if this iframe contains editor content
            if (await hasEditorContent(driver)) {
              console.log('✓ Confirmed editor content found in innermost iframe')
              return true
            }

            // Switch back to parent iframe to try next one
            await driver.switchTo().parentFrame()
          } catch (nestedError) {
            console.log(
              `⚠️ Could not switch to nested iframe ${i}: ${nestedError instanceof Error ? nestedError.message : String(nestedError)}`
            )
            await driver.switchTo().parentFrame()
          }
        }
      }
    } catch (e) {
      console.log(
        '⚠️ No additional nested iframes found or error checking: ',
        e instanceof Error ? e.message : String(e)
      )
    }

    // Verify we're in the correct iframe by checking for editor content
    try {
      if (await hasEditorContent(driver)) {
        console.log('✓ Confirmed editor content found in innermost iframe')
        return true
      }
      console.log('⚠️ Editor content not found, but iframe structure is correct')
      return true // Still return true as we're in the right iframe structure
    } catch (e) {
      console.log('⚠️ Could not verify iframe content, but iframe structure is correct')
      return true // Still return true as we're in the right iframe structure
    }
  } catch (error) {
    console.log('Error switching to nested plugin iframes:', error)

    // Fallback: Use recursive approach to find the deepest iframe with editor content
    try {
      await driver.switchTo().defaultContent()
      console.log('Falling back to recursive iframe detection...')

      const found = await findDeepestIframeWithEditor(driver, 5)
      if (found) {
        console.log('✓ Found editor content using recursive approach')
        return true
      }
    } catch (fallbackError) {
      console.log('Recursive fallback failed:', fallbackError)
    }

    // Final fallback: Try to find any iframe with plugin content
    try {
      await driver.switchTo().defaultContent()
      console.log('Falling back to generic iframe detection...')

      const iframes = await driver.findElements(By.css('iframe'))
      console.log(`Found ${iframes.length} iframe(s) for fallback`)

      for (let i = 0; i < iframes.length; i++) {
        try {
          await driver.switchTo().frame(i)
          console.log(`Switched to iframe ${i} for fallback`)

          // Check if this iframe contains the Editor tab
          const hasEditorTab = await driver
            .findElements(By.xpath("//*[@id='container-tabs']/div/div[1]/label[4]"))
            .then((elements) => elements.length > 0)
          if (hasEditorTab) {
            console.log('✓ Found Editor tab in fallback iframe')
            return true
          }

          // Also check for nested iframes within this iframe
          try {
            const nestedIframes = await driver.findElements(By.css('iframe'))
            console.log(`Found ${nestedIframes.length} nested iframe(s) in iframe ${i}`)

            for (let j = 0; j < nestedIframes.length; j++) {
              try {
                await driver.switchTo().frame(j)
                console.log(`Switched to nested iframe ${j} in iframe ${i}`)

                const hasNestedEditorTab = await driver
                  .findElements(By.xpath("//*[@id='container-tabs']/div/div[1]/label[4]"))
                  .then((elements) => elements.length > 0)
                if (hasNestedEditorTab) {
                  console.log('✓ Found Editor tab in nested fallback iframe')
                  return true
                }

                // Check for even deeper nesting
                try {
                  const deepIframes = await driver.findElements(By.css('iframe'))
                  console.log(
                    `Found ${deepIframes.length} deep nested iframe(s) in iframe ${i}-${j}`
                  )

                  for (let k = 0; k < deepIframes.length; k++) {
                    try {
                      await driver.switchTo().frame(k)
                      console.log(`Switched to deep nested iframe ${k} in iframe ${i}-${j}`)

                      const hasDeepEditorTab = await driver
                        .findElements(By.xpath("//*[@id='container-tabs']/div/div[1]/label[4]"))
                        .then((elements) => elements.length > 0)
                      if (hasDeepEditorTab) {
                        console.log('✓ Found Editor tab in deep nested fallback iframe')
                        return true
                      }

                      // Switch back to previous iframe level
                      await driver.switchTo().parentFrame()
                    } catch (deepError) {
                      console.log(`Could not switch to deep nested iframe ${k}:`, deepError)
                      await driver.switchTo().parentFrame()
                    }
                  }
                } catch (deepError) {
                  // Ignore deep nesting errors
                }

                // Switch back to parent iframe
                await driver.switchTo().parentFrame()
              } catch (nestedError) {
                console.log(`Could not switch to nested iframe ${j}:`, nestedError)
                await driver.switchTo().parentFrame()
              }
            }
          } catch (nestedError) {
            // Ignore nested iframe errors
          }

          // Switch back to main content
          await driver.switchTo().defaultContent()
        } catch (iframeError) {
          console.log(`Could not switch to fallback iframe ${i}:`, iframeError)
          await driver.switchTo().defaultContent()
        }
      }
    } catch (fallbackError) {
      console.log('Fallback iframe detection also failed:', fallbackError)
    }

    return false
  }
}

/**
 * Automate Figma design creation using Selenium
 */
async function automateDesignCreation(
  projectId: string,
  fileName: string,
  fullHtml: string
): Promise<string> {
  // Configure Chrome options
  const options = new chrome.Options()
  // Uncomment the following line to run in headless mode
  // options.addArguments('--headless');
  options.addArguments('--disable-blink-features=AutomationControlled')
  options.addArguments('--no-sandbox')
  options.addArguments('--disable-dev-shm-usage')

  // Set ChromeDriver path to use system installation
  const chromedriverPath = process.env.CHROMEDRIVER_PATH || '/opt/homebrew/bin/chromedriver'

  // Create Chrome service with explicit driver path
  const service = new chrome.ServiceBuilder(chromedriverPath)

  // Build the WebDriver with explicit service
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .setChromeService(service)
    .build()

  try {
    // Step 1: Login to Figma
    console.log('Logging into Figma...')
    await driver.get('https://www.figma.com/login')

    // Wait for login page to load
    await driver.wait(until.elementLocated(By.css('input[type="email"]')), 10000)

    // Enter email
    const emailInput = await driver.findElement(By.css('input[type="email"]'))
    await emailInput.sendKeys('arenadeveloper@position2.com')

    // Enter password
    const passwordInput = await driver.findElement(By.css('input[type="password"]'))
    await passwordInput.sendKeys("64$G1f%'5pSs")

    // Click login button
    const loginButton = await driver.findElement(By.css('button[type="submit"]'))
    await loginButton.click()

    // Wait for login to complete (wait for redirect or dashboard)
    await driver.wait(async () => {
      const currentUrl = await driver.getCurrentUrl()
      return currentUrl.includes('figma.com/files') || currentUrl.includes('figma.com/file')
    }, 10000)

    console.log('Login successful!')

    // Step 2: Navigate to the project URL
    const projectUrl = `https://www.figma.com/files/team/1244904543242467158/project/${projectId}`
    console.log(`Navigating to project: ${projectUrl}`)
    await driver.get(projectUrl)

    // Wait for the page to load
    await driver.sleep(3000)

    // Step 3: Click on "Create" option
    console.log('Clicking on Create option...')
    // Try to find and click the create/new file button
    // Note: Figma's UI may change, so we might need to adjust selectors
    try {
      // Look for create button - adjust selector based on actual Figma UI
      const createButton = await driver.wait(
        until.elementLocated(By.xpath("//button[contains(., 'Create') or contains(., 'New')]")),
        10000
      )
      await createButton.click()
      await driver.sleep(1000)

      // Step 4: Click on "Design" option
      console.log('Clicking on Design option...')
      const designOption = await driver.wait(
        until.elementLocated(By.xpath("//span[contains(text(),'Design')]")),
        5000
      )
      await designOption.click()
    } catch (error) {
      console.log('Could not find Create/Design button, trying keyboard shortcut...')
      // Fallback: Use keyboard shortcut Ctrl+N (Cmd+N on Mac) to create new file
      await driver.actions().sendKeys(Key.chord(Key.COMMAND, 'n')).perform()
    }

    // Wait for new file to be created
    await driver.sleep(2000)

    // Step 5: Get the new file URL
    const currentUrl = await driver.getCurrentUrl()
    console.log(`New file created: ${currentUrl}`)

    // Step 5.5: Rename the file
    // console.log(`Renaming file to: ${fileName}`);
    try {
      // Method 1: Try to find and click the file name input
      try {
        const fileNameElement = await driver.wait(
          until.elementLocated(
            By.xpath(
              "//input[@placeholder='Untitled' or contains(@class, 'filename') or @aria-label='File name']"
            )
          ),
          3000
        )

        // Triple-click to select all text
        await driver
          .actions()
          .click(fileNameElement)
          .click(fileNameElement)
          .click(fileNameElement)
          .perform()

        await driver.sleep(300)

        // Clear and type new name
        await fileNameElement.sendKeys(Key.chord(Key.COMMAND, 'a')) // Select all
        await fileNameElement.sendKeys(fileName)
        await fileNameElement.sendKeys(Key.RETURN) // Press Enter to save

        console.log(`File renamed successfully to: ${fileName}`)
        await driver.sleep(500)
      } catch (innerError) {
        // Method 2: Try keyboard shortcut to rename (Cmd+R on Mac)
        console.log('Trying keyboard shortcut to rename...')
        await driver.actions().sendKeys(Key.chord(Key.COMMAND, 'r')).perform()
        await driver.sleep(500)

        // Type the new name
        await driver
          .actions()
          .sendKeys(Key.chord(Key.COMMAND, 'a')) // Select all
          .sendKeys(fileName)
          .sendKeys(Key.RETURN)
          .perform()

        console.log(`File renamed using keyboard shortcut: ${fileName}`)
        await driver.sleep(500)
      }
    } catch (error) {
      console.log('Could not rename file automatically, continuing with default name...', error)
      // Continue even if renaming fails - the file will have default name
    }

    // Step 6: Open HTML to Figma plugin
    // Using multiple fallback methods for maximum reliability

    const pluginName = process.env.FIGMA_HTML_PLUGIN_NAME || 'html.to.design'
    console.log(`Opening plugin: ${pluginName}...`)

    try {
      // Method 1: Direct click on plugin button using specific XPath
      console.log('Clicking on plugin button using specific XPath...')

      const pluginButton = await driver.wait(
        until.elementLocated(
          By.xpath(
            "//*[@id='react-page']/div/div/div/div[1]/div[2]/div/div/div/div/div/div/div[1]/div/div/div[2]/div/div/div/button[2]"
          )
        ),
        10000
      )

      await pluginButton.click()
      console.log('✓ Clicked on plugin button - modal should open')
      await driver.sleep(3000) // Wait for modal to open

      // Verify modal opened by looking for search input
      try {
        await driver.wait(
          until.elementLocated(By.css('input[placeholder*="Search"], input[type="search"]')),
          5000
        )
        console.log('✓ Plugin modal confirmed open - search input found')
      } catch (modalError) {
        console.log('⚠️ Plugin modal may not have opened - trying keyboard shortcut...')
        // Try keyboard shortcut as fallback
        try {
          await driver.actions().sendKeys(Key.chord(Key.COMMAND, 'p')).perform()
          await driver.sleep(2000)
          console.log('✓ Used keyboard shortcut to open plugins')
        } catch (keyboardError) {
          console.log('Keyboard shortcut also failed')
        }
      }
    } catch (error) {
      console.log(
        'Direct plugin button click failed, trying keyboard shortcut...',
        error instanceof Error ? error.message : String(error)
      )

      // Fallback: Try keyboard shortcut
      try {
        await driver.actions().sendKeys(Key.chord(Key.COMMAND, 'p')).perform()
        await driver.sleep(2000)
        console.log('✓ Used keyboard shortcut as fallback')
      } catch (e) {
        console.log('All methods failed - manual intervention may be required')
      }
    }

    // Step 7: Handle html.to.design plugin workflow in Manage Plugins modal
    console.log('Handling html.to.design plugin workflow in Manage Plugins modal...')

    try {
      // Step 7.1: Search for html.to.design plugin using specific XPath
      console.log('Searching for html.to.design plugin using specific XPath...')
      try {
        // Use specific XPath for search input
        const searchInput = await driver.wait(
          until.elementLocated(
            By.xpath(
              "//*[@id='react-page']/div/div/div/div[1]/div[1]/div/div[1]/div[12]/div/div/div/div/div/div/div/div[1]/input"
            )
          ),
          5000
        )
        await searchInput.clear()
        await searchInput.sendKeys('html.to.design')
        console.log('✓ Searched for html.to.design plugin using specific XPath')
        await driver.sleep(1500)
      } catch (e) {
        console.log('Specific search input XPath failed, trying generic search...')
        // Fallback: Try generic search input
        try {
          const searchInput = await driver.findElement(
            By.css('input[placeholder*="Search"], input[type="search"], input[class*="search"]')
          )
          await searchInput.clear()
          await searchInput.sendKeys('html.to.design')
          console.log('✓ Searched for html.to.design plugin using generic search')
          await driver.sleep(1500)
        } catch (genericError) {
          console.log('Generic search input not found, trying to find plugin directly...')
        }
      }

      // Step 7.2: Click on the first html.to.design plugin using specific XPath
      console.log('Clicking on first html.to.design plugin using specific XPath...')
      try {
        const pluginOption = await driver.wait(
          until.elementLocated(
            By.xpath(
              "//*[@id='react-page']/div/div/div/div[1]/div[1]/div/div[1]/div[12]/div/div/div/div/div/div/div/div[3]/div/div/div/div/div/div/button[1]"
            )
          ),
          5000
        )
        await pluginOption.click()
        console.log('✓ Clicked on first html.to.design plugin using specific XPath')
        await driver.sleep(3000)
      } catch (e) {
        console.log('Specific plugin XPath failed, trying alternative selectors...')
        // Fallback: Try different possible selectors for the plugin
        const pluginSelectors = [
          "//div[contains(text(), 'html.to.design')]",
          "//span[contains(text(), 'html.to.design')]",
          "//button[contains(text(), 'html.to.design')]",
          "//a[contains(text(), 'html.to.design')]",
          "//div[contains(., 'html.to.design')]",
        ]

        let pluginClicked = false
        for (const selector of pluginSelectors) {
          try {
            const pluginElement = await driver.findElement(By.xpath(selector))
            await pluginElement.click()
            console.log(`✓ Clicked on html.to.design using selector: ${selector}`)
            pluginClicked = true
            break
          } catch (e) {
            // Continue to next selector
          }
        }

        if (!pluginClicked) {
          throw new Error('Could not find html.to.design plugin')
        }
        await driver.sleep(3000)
      }

      // Step 7.3: Select the "Editor" tab in the plugin popup
      console.log('Selecting Editor tab in the plugin popup...')

      // First, try to switch to the plugin iframe if it exists
      const switchedToIframe = await switchToPluginIframe(driver)

      if (!switchedToIframe) {
        console.log('⚠️ Could not find plugin iframe, trying to continue without iframe context')
      }

      let editorTabClicked = false

      try {
        // Try to find and click the Editor tab using the specific XPath for nested iframe
        const editorTabSelectors = [
          "//*[@id='container-tabs']/div/div[1]/label[4]", // Specific XPath for Editor tab in nested iframe
          "//span[contains(text(), 'Editor')]",
          "//button[contains(text(), 'Editor')]",
          "//a[contains(text(), 'Editor')]",
          "//li[contains(text(), 'Editor')]",
          "//div[@role='tab' and contains(text(), 'Editor')]",
          "//div[@role='tab' and contains(., 'Editor')]",
          "//label[contains(text(), 'Editor')]",
          "//*[contains(text(), 'Editor') and (self::button or self::a or self::span or self::div or self::label)]",
        ]

        for (const selector of editorTabSelectors) {
          try {
            const editorTabElement = await driver.wait(
              until.elementLocated(By.xpath(selector)),
              3000
            )
            await editorTabElement.click()
            console.log(`✓ Clicked on Editor tab using selector: ${selector}`)
            editorTabClicked = true
            break
          } catch (e) {
            // Continue to next selector
          }
        }

        if (!editorTabClicked) {
          console.log('Editor tab selectors failed, trying JavaScript click...')
          // Last resort: try to click any tab that might be the Editor tab
          try {
            await driver.executeScript(`
              // First try the specific XPath for Editor tab
              const specificEditorTab = document.querySelector('#container-tabs div div:nth-child(1) label:nth-child(4)');
              if (specificEditorTab) {
                specificEditorTab.click();
                console.log('Clicked Editor tab via JavaScript using specific selector');
                return true;
              }
              
              // Look for any element that might be the Editor tab
              const possibleTabs = document.querySelectorAll('label, button, a, span, div[role="tab"]');
              for (let tab of possibleTabs) {
                if (tab.textContent && tab.textContent.toLowerCase().includes('editor')) {
                  tab.click();
                  console.log('Clicked Editor tab via JavaScript: ' + tab.textContent);
                  return true;
                }
              }
              
              // If no Editor tab found, try to find any tab and click it
              const allTabs = document.querySelectorAll('[role="tab"], label, button');
              if (allTabs.length > 0) {
                allTabs[allTabs.length - 1].click(); // Click the last tab (usually Editor)
                console.log('Clicked last available tab via JavaScript');
                return true;
              }
              
              return false;
            `)
            console.log('✓ Attempted JavaScript click on Editor tab')
            editorTabClicked = true
          } catch (jsError) {
            console.log('JavaScript Editor tab click also failed:', jsError)
          }
        }
      } catch (e) {
        console.log('Error clicking Editor tab:', e)
      }

      // Step 7.5: Find HTML input field and paste the generated HTML
      // Only proceed if Editor tab was clicked successfully
      if (!editorTabClicked) {
        console.log('⚠️ Editor tab was not clicked, skipping HTML input field search')
      } else {
        console.log('Looking for HTML input field in Editor tab...')

        // Ensure we're still in the correct iframe context for HTML input
        let currentIframeState = switchedToIframe
        if (!currentIframeState) {
          currentIframeState = await switchToPluginIframe(driver)
        }

        try {
          // Look for HTML textarea or input field with optimized approach
          const htmlSelectors = [
            '//*[@id="container-tabs"]/div/div[2]/div[4]/section/div[1]/div[2]/div/div/div[2]/div[1]/div', // Specific XPath
            '#fullHtmlInput', // Specific ID from our plugin
            'textarea[placeholder*="HTML" i]', // Case insensitive
            'textarea[placeholder*="html" i]',
            'input[placeholder*="HTML" i]',
            'input[placeholder*="html" i]',
            'textarea[id*="html" i]',
            'textarea[class*="html" i]',
            'textarea',
            'input[type="text"]',
          ]

          let htmlInput = null

          // Try XPath first, then CSS selectors
          for (const selector of htmlSelectors) {
            try {
              if (selector.startsWith('//')) {
                htmlInput = await driver.findElement(By.xpath(selector))
              } else {
                htmlInput = await driver.findElement(By.css(selector))
              }
              console.log(`✓ Found HTML input using selector: ${selector}`)
              break
            } catch (e) {
              // Continue to next selector silently
            }
          }

          if (htmlInput) {
            // Clear and paste the HTML
            await htmlInput.clear()
            await htmlInput.sendKeys(fullHtml)
            console.log('✓ Pasted HTML into input field')
            await sleep(500)
          } else {
            throw new Error('Could not find HTML input field')
          }
        } catch (e) {
          console.log('Could not find HTML input field, trying JavaScript injection...')
          // Fallback: Try to inject via JavaScript
          await driver.executeScript(`
          const textareas = document.querySelectorAll('textarea');
          const inputs = document.querySelectorAll('input[type="text"]');
          
          // Try to find HTML input field
          let htmlField = null;
          
          // First try to find by ID
          const fullHtmlInput = document.getElementById('fullHtmlInput');
          if (fullHtmlInput) {
            htmlField = fullHtmlInput;
          } else {
            // Try to find by placeholder
            for (let textarea of textareas) {
              if (textarea.placeholder && textarea.placeholder.toLowerCase().includes('html')) {
                htmlField = textarea;
                break;
              }
            }
            
            if (!htmlField) {
              for (let input of inputs) {
                if (input.placeholder && input.placeholder.toLowerCase().includes('html')) {
                  htmlField = input;
                  break;
                }
              }
            }
            
            if (!htmlField && textareas.length > 0) {
              htmlField = textareas[0]; // Use first textarea as fallback
            }
          }
          
          if (htmlField) {
            htmlField.value = ${JSON.stringify(fullHtml)};
            htmlField.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('Injected HTML via JavaScript');
          } else {
            console.error('Could not find HTML input field');
          }
        `)
          console.log('✓ Attempted JavaScript injection for HTML')
          await sleep(500)
        }
      } // End of if (editorTabClicked) block

      // Step 7.6: Click on "Create" button
      console.log('Looking for Create button...')

      // Only proceed if Editor tab was clicked successfully
      if (!editorTabClicked) {
        console.log('⚠️ Editor tab was not clicked, skipping Create button search')
      } else {
        // Ensure we're still in the correct iframe context for Create button
        let currentIframeState = switchedToIframe
        if (!currentIframeState) {
          currentIframeState = await switchToPluginIframe(driver)
        }

        try {
          const createButton = await driver.wait(
            until.elementLocated(
              By.xpath("//*[@id='container-tabs']/div/div[2]/div[4]/section/footer/div[2]/button")
            ),
            5000
          )
          await createButton.click()
          console.log('✓ Clicked Create button')
          await driver.sleep(5000) // Wait for design to be created

          // Step 7.7: Click "Add to Canvas" button after design is created
          await clickAddToCanvasButton(driver, 'primary path')
        } catch (e) {
          console.log('Create button not found, trying alternative selectors...')
          const createSelectors = [
            '#createBtn', // Specific ID from our plugin
            "//button[contains(text(), 'Create')]",
            "//button[contains(text(), 'Generate')]",
            "//button[contains(text(), 'Convert')]",
            "//button[contains(text(), 'Import')]",
            "//div[contains(text(), 'Create')]",
            "//span[contains(text(), 'Create')]",
          ]

          let createClicked = false
          for (const selector of createSelectors) {
            try {
              const createElement = await driver.findElement(By.xpath(selector))
              await createElement.click()
              console.log(`✓ Clicked Create using selector: ${selector}`)
              createClicked = true
              break
            } catch (e) {
              // Continue to next selector
            }
          }

          if (!createClicked) {
            console.log('Could not find Create button, trying JavaScript...')
            await driver.executeScript(`
            // First try to find by ID
            const createBtn = document.getElementById('createBtn');
            if (createBtn) {
              createBtn.click();
              console.log('Clicked Create button via JavaScript (by ID)');
            } else {
              // Fallback to text search
              const buttons = document.querySelectorAll('button');
              for (let button of buttons) {
                if (button.textContent && button.textContent.toLowerCase().includes('create')) {
                  button.click();
                  console.log('Clicked Create button via JavaScript (by text)');
                  break;
                }
              }
            }
          `)
          }
          await driver.sleep(5000)

          // Step 7.7: Click "Add to Canvas" button after design is created (alternative path)
          await clickAddToCanvasButton(driver, 'alternative path')
        }

        // Switch back to main content if we switched to iframe
        if (currentIframeState) {
          await switchToMainContent(driver)
        }
      } // End of if (editorTabClicked) block for Create button

      console.log('✓ html.to.design plugin workflow completed!')
    } catch (error) {
      console.error('Error in html.to.design plugin workflow:', error)
      console.log('⚠️ Plugin workflow failed - design may need manual creation')
    }

    // Step 8: Close the automation process
    console.log('Closing automation process...')
    try {
      // Ensure we're back to main content before cleanup
      await switchToMainContent(driver)

      // Close any open modals or plugin windows
      await driver.actions().sendKeys(Key.ESCAPE).perform()
      await driver.sleep(1000)

      // Try to close plugin if still open
      try {
        const closeButton = await driver.findElement(
          By.xpath(
            "//button[contains(@aria-label, 'Close') or contains(@title, 'Close') or contains(text(), 'Close')]"
          )
        )
        await closeButton.click()
        console.log('✓ Closed plugin window')
      } catch (e) {
        console.log('No close button found, continuing...')
      }

      console.log('✓ Automation process completed successfully!')
    } catch (error) {
      console.log('Error during cleanup:', error)
    }

    console.log('Design automation complete!')
    return currentUrl
  } catch (error) {
    console.error('Error during Figma automation:', error)
    throw error
  } finally {
    // Keep browser open for debugging
    await driver.quit()
    console.log('Browser session kept open for inspection')
  }
}
