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

import { existsSync } from 'fs'
import fs from 'fs/promises'
import Anthropic from '@anthropic-ai/sdk'
import { Builder, By, Key, until, type WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome'
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
  designTargets?: string[]
}

interface TargetExperienceConfig {
  id: string
  label: string
  viewportWidth: number
  description: string
}

interface GeneratedTargetHtml extends TargetExperienceConfig {
  html: string
  iteration: number
}

interface FigmaDesignResult {
  success: boolean
  renderedData?: string
  renderedTargets?: GeneratedTargetHtml[]
  error?: string
  figmaFileUrl?: string
  designTargets?: string[]
}

const TARGET_EXPERIENCE_MAP: Record<string, TargetExperienceConfig> = {
  desktop: {
    id: 'desktop',
    label: 'Desktop (1440px)',
    viewportWidth: 1440,
    description: 'Wide desktop layouts with multi-column sections',
  },
  mobile: {
    id: 'mobile',
    label: 'Mobile (375px)',
    viewportWidth: 375,
    description: 'Single-column mobile-first layouts',
  },
  tablet: {
    id: 'tablet',
    label: 'Tablet (1280px)',
    viewportWidth: 1280,
    description: 'Medium-width layouts with condensed columns',
  },
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

    // Step 2: Call Claude API to generate HTML and CSS per target experience
    console.log('Step 2: Calling Claude API to generate target-specific designs...')
    const targetExperiences = resolveTargetExperiences(inputs.designTargets)
    console.log('Target experiences:', targetExperiences)
    const generatedTargets: GeneratedTargetHtml[] = []

    for (const [index, targetExperience] of targetExperiences.entries()) {
      console.log(
        `→ Generating HTML for ${targetExperience.label} (${targetExperience.viewportWidth}px) [${
          index + 1
        }/${targetExperiences.length}]`
      )
      const targetPrompt = buildTargetPrompt(
        inputs.prompt,
        targetExperience,
        generatedTargets[generatedTargets.length - 1]
      )
      const renderedData = await generateHTMLCSS(systemPrompt, targetPrompt)

      if (!renderedData) {
        return {
          success: false,
          error: `Failed to generate HTML/CSS for ${targetExperience.label}`,
        }
      }

      const cleanedHtml = cleanGeneratedHtml(renderedData)
      generatedTargets.push({
        ...targetExperience,
        html: cleanedHtml,
        iteration: index + 1,
      })
    }

    if (generatedTargets.length === 0) {
      return {
        success: false,
        error: 'Failed to generate HTML/CSS from Claude API',
      }
    }

    // Step 4: Do Selenium automation
    console.log('Step 4: Starting Figma automation...')
    const figmaFileUrl = await automateDesignCreation(
      inputs.projectId,
      inputs.fileName,
      generatedTargets,
      inputs.designTargets || []
    )

    return {
      success: true,
      renderedData: generatedTargets[0]?.html,
      renderedTargets: generatedTargets,
      figmaFileUrl,
      designTargets: targetExperiences.map((target) => target.id),
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
 * Helper function to read file content from S3 or local filesystem
 */
async function readFileContent(filePath: string, fileType: string): Promise<string> {
  // Check if it's an S3 URL or local file path
  if (filePath.startsWith('s3://') || filePath.includes('/api/files/serve/')) {
    console.log(`Reading ${fileType} from S3/cloud storage...`)

    // Extract the S3 key from the URL
    let s3Key: string
    if (filePath.startsWith('s3://')) {
      s3Key = filePath.replace('s3://', '').split('/').slice(1).join('/')
    } else if (filePath.includes('/api/files/serve/s3/')) {
      s3Key = decodeURIComponent(filePath.split('/api/files/serve/s3/')[1])
    } else if (filePath.includes('/api/files/serve/blob/')) {
      s3Key = decodeURIComponent(filePath.split('/api/files/serve/blob/')[1])
    } else {
      s3Key = decodeURIComponent(filePath.substring('/api/files/serve/'.length))
    }

    console.log(`S3 key extracted for ${fileType}:`, s3Key)

    // Download file from S3
    const fileBuffer = await downloadFile(s3Key)
    console.log(`Downloaded ${fileType} from S3, size:`, fileBuffer.length)

    // Check if it's a PDF file
    const filename = s3Key.split('/').pop() || s3Key
    const isPdf = filename.toLowerCase().endsWith('.pdf')

    if (isPdf) {
      console.log(`Parsing PDF ${fileType} with Claude Vision...`)
      const text = await extractTextFromPdfWithClaudeVision(fileBuffer, fileType)
      console.log(`PDF ${fileType} parsed via Claude, extracted text length:`, text.length)
      return text
    }
    return fileBuffer.toString('utf-8')
  }
  // Local file path
  const localBuffer = await fs.readFile(filePath)
  if (filePath.toLowerCase().endsWith('.pdf')) {
    console.log(`Parsing local PDF ${fileType} with Claude Vision...`)
    return extractTextFromPdfWithClaudeVision(localBuffer, fileType)
  }
  return localBuffer.toString('utf-8')
}

async function extractTextFromPdfWithClaudeVision(
  fileBuffer: Buffer,
  fileType: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is not set. Please set it to your Claude API key.'
    )
  }

  const anthropic = new Anthropic({ apiKey })
  const base64Data = fileBuffer.toString('base64')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 16384,
    temperature: 0,
    system:
      'You are a meticulous design analyst. Extract all textual content, layout instructions, and structural details from the provided PDF. Return clean, plain text that preserves hierarchy, sections, and component descriptions.',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `The attached ${fileType} may contain design wireframes or brand guidelines. Extract every piece of useful textual information, list key sections, and preserve ordering.`,
          },
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64Data,
            },
          },
        ],
      },
    ],
  })

  const textBlock = message.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text' || !textBlock.text.trim()) {
    throw new Error('Claude Vision did not return text for the PDF')
  }

  return textBlock.text
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
      const wireframes = await readFileContent(inputs.wireframesFile, 'wireframes')
      systemPrompt += `\n=== WIREFRAMES (STRUCTURE TO FOLLOW) ===\n${wireframes}\n\n`
      hasWireframes = true
    } catch (error) {
      console.warn('Could not read wireframes file:', inputs.wireframesFile, error)
    }
  }

  // Read brand guidelines file if provided
  if (inputs.brandGuidelinesFile) {
    console.log('Reading brand guidelines file:', inputs.brandGuidelinesFile)
    try {
      const brandGuidelines = await readFileContent(inputs.brandGuidelinesFile, 'brand guidelines')
      systemPrompt += `\n=== BRAND GUIDELINES (COLORS & STYLING TO USE) ===\n${brandGuidelines}\n\n`
      hasBrandGuidelines = true
    } catch (error) {
      console.warn('Could not read brand guidelines file:', inputs.brandGuidelinesFile, error)
    }
  }

  // Read additional data file if provided
  if (inputs.additionalDataFile) {
    console.log('Reading additional data file:', inputs.additionalDataFile)
    try {
      const additionalData = await readFileContent(inputs.additionalDataFile, 'additional data')
      systemPrompt += `\n=== ADDITIONAL DATA ===\n${additionalData}\n\n`
    } catch (error) {
      console.warn('Could not read additional data file:', inputs.additionalDataFile, error)
    }
  }

  // Add additional info if provided
  if (inputs.additionalInfo) {
    console.log('Reading additional information:', inputs.additionalInfo)
    systemPrompt += `\n=== ADDITIONAL INFORMATION ===\n${inputs.additionalInfo}\n\n`
  }
  if (inputs.description) {
    console.log('Reading description:', inputs.description)
    systemPrompt += `\n=== DESCRIPTION ===\n${inputs.description}\n\n`
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

CRITICAL OUTPUT REQUIREMENTS:
- Your response must ONLY contain HTML code
- Start directly with <!DOCTYPE html> - no explanations, no markdown, no code blocks
- Do NOT include any comments starting with #
- Do NOT include any text before or after the HTML
- Do NOT include any explanations, descriptions, or additional text
- Output ONLY the raw HTML with embedded CSS in <style> tags
- The output must be valid HTML that can be directly used without any modifications`

  return systemPrompt
}

function normalizeTargetKey(target?: string): string {
  if (!target) {
    return ''
  }
  return target.toLowerCase().replace(/[^a-z]/g, '')
}

function capitalizeTargetLabel(value?: string): string {
  if (!value || value.length === 0) {
    return 'Custom'
  }
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function resolveTargetExperiences(designTargets?: string[]): TargetExperienceConfig[] {
  const requestedTargets = designTargets && designTargets.length > 0 ? designTargets : ['desktop']
  const resolved: TargetExperienceConfig[] = []

  for (const target of requestedTargets) {
    const normalizedKey = normalizeTargetKey(target)
    const config = TARGET_EXPERIENCE_MAP[normalizedKey] || {
      id: normalizedKey || 'custom',
      label: capitalizeTargetLabel(target),
      viewportWidth: TARGET_EXPERIENCE_MAP.desktop.viewportWidth,
      description: 'Custom target experience derived from user input',
    }

    const alreadyExists = resolved.some((item) => item.id === config.id)
    if (!alreadyExists) {
      resolved.push(config)
    }
  }
  console.log('Resolved target experiences:', resolved)
  return resolved
}

function buildTargetPrompt(
  basePrompt: string,
  target: TargetExperienceConfig,
  previous?: GeneratedTargetHtml
): string {
  const viewportInstruction = `Target viewport width: ${target.viewportWidth}px (${target.label}).`

  if (!previous) {
    return `${basePrompt}

Create the ${target.label} experience optimized for ${target.viewportWidth}px. ${viewportInstruction}
Emphasize ${target.description}, ensure clear hierarchy, and keep the code fully self-contained starting with <!DOCTYPE html>.

OUTPUT ONLY HTML: No comments, no explanations, no markdown. Start directly with <!DOCTYPE html>.`
  }

  return `You already generated the ${previous.label} layout. Adapt it for the ${target.label} experience.

${viewportInstruction}
Preserve the same content hierarchy, brand alignment, and structure, but adjust layout, stacking, spacing, and typography scales for ${target.label}.

OUTPUT ONLY HTML: No comments, no explanations, no markdown. Output must begin with <!DOCTYPE html>.

=== PREVIOUS HTML (${previous.label}) ===
${previous.html}

=== ORIGINAL PROMPT ===
${basePrompt}
`
}

function cleanGeneratedHtml(renderedData: string): string {
  return renderedData
    .replace(/```html\n?/g, '')
    .replace(/```\n?/g, '')
    .replace(/\r?\n|\r/g, '')
    .replace(/\\/g, '')
    .replace(/\s\s+/g, ' ')
    .trim()
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
 * Helper function to check if running in headless mode
 */
async function isHeadlessMode(driver: WebDriver): Promise<boolean> {
  return false
}

/**
 * Helper function to wait for iframe content to load (longer waits for headless)
 */
async function waitForIframeContent(driver: WebDriver, baseWaitTime = 2000): Promise<void> {
  const isHeadless = await isHeadlessMode(driver)
  const actualWaitTime = isHeadless ? baseWaitTime * 5 : baseWaitTime // 5x longer in headless
  await driver.sleep(actualWaitTime)

  // Also wait for document ready state (longer timeout in headless)
  try {
    await driver.wait(
      async () => {
        const readyState = await driver.executeScript('return document.readyState')
        return readyState === 'complete'
      },
      isHeadless ? 30000 : 10000
    )
  } catch (e) {
    // Ignore ready state errors, continue anyway
  }
}

/**
 * Helper function to switch to the innermost plugin iframe and return whether switch was successful
 * Handles nested iframe structure: plugin-iframe-in-modal -> Network Plugin Iframe -> Inner Plugin Iframe
 */
async function switchToPluginIframe(driver: WebDriver): Promise<boolean> {
  try {
    const isHeadless = await isHeadlessMode(driver)
    console.log(`Looking for nested plugin iframes... (headless: ${isHeadless})`)

    // Always reset to main document context before searching
    await driver.switchTo().defaultContent()
    await driver.sleep(isHeadless ? 3000 : 1000)

    // Step 1: Find the main plugin iframe with multiple possible selectors
    let mainIframe = null
    const mainIframeSelectors = [
      By.id('plugin-iframe-in-modal'),
      By.name('Shim Plugin Iframe'),
      By.css("iframe[id*='plugin-iframe']"),
      By.css("iframe[name*='Plugin']"),
      By.xpath("//*[@id='plugin-iframe-in-modal']"),
      By.xpath('/html/body/div[2]/div/div/div/div[8]/div/div/div[1]/div/div[2]/div[1]/div/iframe'),
    ]

    const mainIframeTimeout = isHeadless ? 30000 : 10000
    for (const selector of mainIframeSelectors) {
      try {
        mainIframe = await driver.wait(until.elementLocated(selector), mainIframeTimeout)
        await driver.wait(until.elementIsVisible(mainIframe), isHeadless ? 15000 : 5000)
        console.log(`✓ Found main plugin iframe using selector: ${selector.toString()}`)
        break
      } catch (e) {
        console.log(`Could not find main plugin iframe using selector: ${selector.toString()}`)
        // Continue to next selector
      }
    }

    if (!mainIframe) {
      throw new Error('Could not find main plugin iframe')
    }

    await waitForIframeContent(driver, 2000)
    await driver.switchTo().frame(mainIframe)
    console.log('✓ Switched to main plugin iframe')
    await waitForIframeContent(driver, 2000)
    // Step 2: Find the Network Plugin Iframe with multiple possible selectors
    let networkIframe = null
    const networkIframeSelectors = [
      By.name('Network Plugin Iframe'),
      By.css("iframe[name='Network Plugin Iframe']"),
      By.css("iframe[name*='Network']"),
      By.css("iframe[name*='Plugin']"),
      By.css("iframe[name='page-iframe']"),
      By.css("iframe[name*='page']"),
      By.css("iframe[id*='page']"),
      By.css("iframe[class*='page']"),
      By.css('iframe'),
      By.xpath('/html/body/iframe'),
    ]

    const networkIframeTimeout = isHeadless ? 30000 : 10000
    for (const selector of networkIframeSelectors) {
      try {
        networkIframe = await driver.wait(until.elementLocated(selector), networkIframeTimeout)
        await driver.wait(until.elementIsVisible(networkIframe), isHeadless ? 15000 : 5000)
        console.log(`✓ Found Network Plugin Iframe using selector: ${selector.toString()}`)
        break
      } catch (e) {
        networkIframe = null
        // Continue to next selector
        console.log(`Could not find Network Plugin Iframe using selector: ${selector.toString()}`)
      }
    }

    if (!networkIframe) {
      // Fallback: inspect iframe attributes to pick the best candidate
      // Wait longer in headless mode for iframes to appear
      await driver.sleep(isHeadless ? 5000 : 2000)
      const iframeCandidates = await driver.findElements(By.css('iframe'))
      console.log(`Found ${iframeCandidates.length} iframe candidate(s) for Network Plugin Iframe`)

      for (const iframe of iframeCandidates) {
        try {
          const id = (await iframe.getAttribute('id'))?.toLowerCase() || ''
          const name = (await iframe.getAttribute('name'))?.toLowerCase() || ''
          const src = (await iframe.getAttribute('src'))?.toLowerCase() || ''
          if (
            id.includes('network') ||
            name.includes('network') ||
            id.includes('plugin') ||
            name.includes('plugin') ||
            name.includes('page-iframe') ||
            name.includes('page') ||
            src.includes('plugin') ||
            src.includes('network')
          ) {
            networkIframe = iframe
            console.log(
              `✓ Selected iframe by attributes for Network Plugin (id: ${id || 'n/a'}, name: ${name || 'n/a'})`
            )
            break
          }
        } catch (e) {
          // Continue to next iframe
        }
      }

      if (!networkIframe && iframeCandidates.length > 0) {
        networkIframe = iframeCandidates[0]
        console.log(
          `✓ Defaulted to first iframe inside plugin-iframe-in-modal (total iframes: ${iframeCandidates.length})`
        )
      }

      if (!networkIframe) {
        throw new Error('Could not find Network Plugin Iframe')
      }
      console.log('✓ Selected fallback Network Plugin Iframe successfully')
    }

    await waitForIframeContent(driver, 2000)
    await driver.switchTo().frame(networkIframe)
    console.log('✓ Switched to Network Plugin Iframe')
    await waitForIframeContent(driver, 2000)
    // Step 3: Find the Inner Plugin Iframe with multiple possible selectors
    let innerIframe = null
    const innerIframeSelectors = [
      By.id('plugin-iframe'),
      By.name('Inner Plugin Iframe'),
      By.css("iframe[id*='plugin-iframe']"),
      By.css("iframe[name*='Inner']"),
      By.xpath("//*[@id='plugin-iframe']"),
      By.xpath('/html/body/iframe'),
    ]

    const innerIframeTimeout = isHeadless ? 20000 : 10000
    for (const selector of innerIframeSelectors) {
      try {
        innerIframe = await driver.wait(until.elementLocated(selector), innerIframeTimeout)
        await driver.wait(until.elementIsVisible(innerIframe), isHeadless ? 5000 : 5000)
        console.log(`✓ Found Inner Plugin Iframe using selector: ${selector.toString()}`)
        break
      } catch (e) {
        // Continue to next selector
        innerIframe = null
      }
    }

    if (!innerIframe) {
      // Fallback: inspect iframe attributes to pick the best candidate
      // Wait longer in headless mode for iframes to appear
      await driver.sleep(2000)
      const iframeCandidates = await driver.findElements(By.css('iframe'))
      console.log(`Found ${iframeCandidates.length} iframe candidate(s) for Inner Plugin Iframe`)

      for (const iframe of iframeCandidates) {
        try {
          const id = (await iframe.getAttribute('id'))?.toLowerCase() || ''
          const name = (await iframe.getAttribute('name'))?.toLowerCase() || ''
          const src = (await iframe.getAttribute('src'))?.toLowerCase() || ''
          if (
            id.includes('plugin-iframe') ||
            name.includes('inner') ||
            name.includes('plugin') ||
            src.includes('plugin')
          ) {
            innerIframe = iframe
            console.log(
              `✓ Selected iframe by attributes for Inner Plugin (id: ${id || 'n/a'}, name: ${name || 'n/a'})`
            )
            break
          }
        } catch (e) {
          // Continue to next iframe
        }
      }

      if (!innerIframe && iframeCandidates.length > 0) {
        innerIframe = iframeCandidates[0]
        console.log(
          `✓ Defaulted to first iframe inside Inner (total iframes: ${iframeCandidates.length})`
        )
      } else if (!innerIframe) {
        throw new Error('Could not find Inner Plugin Iframe')
      }
    }

    await waitForIframeContent(driver, 2000)
    await driver.switchTo().frame(innerIframe)
    console.log('✓ Switched to Inner Plugin Iframe')
    await waitForIframeContent(driver, 2000)
    return true
    // Verify we're in the correct iframe by checking for Editor tab
    // try {
    //   const editorTab = await driver.findElement(
    //     By.xpath("//*[@id='container-tabs']/div/div[1]/label[4]")
    //   )
    //   console.log('✓ Confirmed Editor tab found in innermost iframe')
    //   return true
    // } catch (e) {
    //   console.log('⚠️ Editor tab not found in innermost iframe, but iframe structure is correct')
    //   return true // Still return true as we're in the right iframe structure
    // }
  } catch (error) {
    console.log('Error switching to nested plugin iframes:', error)

    // Fallback: Try to find any iframe with plugin content
    try {
      await driver.sleep(2000)
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
            await driver.sleep(2000)
            const nestedIframes = await driver.findElements(By.tagName('iframe'))
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
                  const deepIframes = await driver.findElements(By.tagName('iframe'))
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
 * Helper function to handle and dismiss any alerts (like WebGL errors)
 * This function will check for alerts multiple times to catch alerts that appear asynchronously
 */
async function handleAlerts(driver: WebDriver, maxAttempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Wait a bit for alert to appear (longer wait on first attempt)
      await driver.sleep(attempt === 1 ? 2000 : 500)

      // Try to handle alert if present
      try {
        const alert = await driver.switchTo().alert()
        const alertText = await alert.getText()
        console.log(`Alert detected (attempt ${attempt}): ${alertText}`)

        // Dismiss WebGL error alerts or any other alerts
        if (
          alertText.includes('WebGL') ||
          alertText.includes('Could not initialize') ||
          alertText.includes('Back to Files')
        ) {
          console.log('Dismissing WebGL error alert...')
          await alert.accept()
          console.log('✓ WebGL error alert dismissed')
        } else {
          // Accept any other alerts
          await alert.accept()
          console.log('✓ Alert dismissed')
        }

        // Switch back to default content
        await driver.switchTo().defaultContent()
      } catch (alertError) {
        // No alert present, which is fine
        // This is expected most of the time
        if (attempt === 1) {
          // Only log on first attempt to avoid spam
        }
      }
    } catch (error) {
      // Error accessing alert, likely no alert present
      if (attempt === 1) {
        // Only log on first attempt
      }
    }
  }
}

/**
 * Automate Figma design creation using Selenium
 */
async function automateDesignCreation(
  projectId: string,
  fileName: string,
  targetHtmlPayloads: GeneratedTargetHtml[],
  designTargets: string[]
): Promise<string> {
  if (!targetHtmlPayloads || targetHtmlPayloads.length === 0) {
    throw new Error('No HTML payloads provided for automation')
  }

  const isLinux = process.platform === 'linux'

  // Configure Chrome options
  const options = new chrome.Options()

  // Base configuration
  options.addArguments('--disable-blink-features=AutomationControlled')
  options.addArguments('--start-maximized')
  options.addArguments('--window-size=1920,1080')
  options.addArguments('--no-sandbox')
  options.addArguments('--disable-dev-shm-usage')

  // Platform-specific WebGL / GPU config
  if (isLinux) {
    // ✅ Linux / Docker: software GL via SwiftShader, but DO NOT disable GPU entirely
    options.addArguments('--enable-webgl')
    options.addArguments('--enable-webgl2')
    options.addArguments('--ignore-gpu-blacklist')
    options.addArguments('--use-gl=swiftshader') // software GL
    options.addArguments('--use-angle=gl') // avoid Vulkan ANGLE backend
    options.addArguments('--enable-zero-copy')
  } else {
    // macOS / Windows: hardware accelerated
    options.addArguments('--enable-webgl')
    options.addArguments('--enable-webgl2')
    options.addArguments('--ignore-gpu-blacklist')
    options.addArguments('--enable-accelerated-2d-canvas')
  }

  // Extra generic flags
  options.excludeSwitches('enable-automation')
  options.addArguments('--disable-blink-features=AutomationControlled')

  // These prefs DO NOT actually block JS alerts like the WebGL popup,
  // but keeping them is harmless.
  options.setUserPreferences({
    'profile.default_content_setting_values.notifications': 2,
  })

  const chromeBinaryPath = resolveChromeBinaryPath()
  const chromedriverPath = resolveChromedriverPath()

  options.setChromeBinaryPath(chromeBinaryPath)

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
    await passwordInput.sendKeys('K50[<-Shzj9*')

    // Click login button
    const loginButton = await driver.findElement(By.css('button[type="submit"]'))
    await loginButton.click()

    // Wait for login to complete (wait for redirect or dashboard)
    await driver.wait(async () => {
      const currentUrl = await driver.getCurrentUrl()
      return currentUrl.includes('figma.com/files') || currentUrl.includes('figma.com/file')
    }, 60000)

    console.log('Login successful!')

    // Handle any alerts (like WebGL errors) after login
    // await handleAlerts(driver)

    // Step 2: Navigate to the project URL
    const projectUrl = `https://www.figma.com/files/team/1244904543242467158/project/${projectId}`
    console.log(`Navigating to project: ${projectUrl}`)
    await driver.get(projectUrl)

    // Wait for the page to load
    await driver.sleep(3000)

    // Handle any alerts (like WebGL errors) after navigation
    await handleAlerts(driver)

    // Step 2.1: Verify project access by checking if projectId is in the URL
    console.log('Verifying project access...')
    const currentUrlAfterNavigation = await driver.getCurrentUrl()
    console.log(`Current URL after navigation: ${currentUrlAfterNavigation}`)

    if (!currentUrlAfterNavigation.includes(projectId)) {
      const errorMessage = `Access denied: Arena Developer do not have access to this project ${projectId}. Please share the project with Arena Developer (arenadeveloper@position2.com).`
      console.error(errorMessage)
      throw new Error(errorMessage)
    }

    console.log('✓ Project access verified - projectId found in URL')

    // Step 3: Click on "Create" option
    console.log('Clicking on Create option...')
    // Try to find and click the create/new file button
    try {
      // Look for create button - adjust selector based on actual Figma UI
      const createButton = await driver.wait(
        until.elementLocated(By.xpath("//button[contains(., 'Create') or contains(., 'New')]")),
        5000
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

    // Handle any alerts (like WebGL errors) after creating new file
    // await handleAlerts(driver)

    // Step 5: Get the new file URL
    const currentUrl = await driver.getCurrentUrl()
    console.log(`New file created: ${currentUrl}`)

    const totalTargets = targetHtmlPayloads.length
    for (let index = 0; index < totalTargets; index++) {
      await runHtmlToDesignWorkflow(
        driver,
        targetHtmlPayloads[index],
        index,
        totalTargets,
        designTargets[index]
      )
    }

    await logoutOfFigma(driver)

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

async function runHtmlToDesignWorkflow(
  driver: WebDriver,
  payload: GeneratedTargetHtml,
  index: number,
  total: number,
  designTarget: string
): Promise<void> {
  const fullHtml = payload.html
  const label = payload.label
  console.log(
    `\n=== Starting html.to.design workflow for ${label} (${payload.viewportWidth}px) [${
      index + 1
    }/${total}] ===`
  )

  // Cleanup: Ensure any existing plugin windows are closed before starting
  // Always ensure we're on main content, but do more aggressive cleanup for subsequent iterations
  console.log(`[${label}] Preparing to open plugin (iteration ${index + 1})...`)
  try {
    // Switch back to main content
    await switchToMainContent(driver)
    await driver.sleep(1000)

    if (index > 0) {
      console.log(`[${label}] Cleaning up any existing plugin windows before starting...`)

      // Try to close any open plugin windows
      try {
        // Press Escape multiple times to close any modals
        for (let i = 0; i < 3; i++) {
          await driver.actions().sendKeys(Key.ESCAPE).perform()
          await driver.sleep(500)
        }
      } catch (e) {
        // Continue
      }

      // Try to find and close any open plugin close buttons
      const closeButtonSelectors = [
        "//*[@id='react-page']/div/div/div/div[8]/div/div/div[2]/button",
        '/html/body/div[2]/div/div/div/div[8]/div/div/div[2]/button',
        "//button[contains(@aria-label, 'Close') or contains(@title, 'Close')]",
        "//button[contains(@class, 'close')]",
      ]
      for (const selector of closeButtonSelectors) {
        try {
          const closeBtn = await driver.findElement(By.xpath(selector))
          await closeBtn.click()
          console.log(`[${label}] ✓ Closed existing plugin window`)
          await driver.sleep(1500)
          break
        } catch (e) {
          // Continue to next selector
        }
      }

      // Additional wait to ensure cleanup is complete
      await driver.sleep(1000)
    }
  } catch (cleanupError) {
    console.log(`[${label}] Cleanup completed (or no cleanup needed)`)
  }

  // Step 6: Open HTML to Figma plugin
  // Using multiple fallback methods for maximum reliability
  const pluginName = process.env.FIGMA_HTML_PLUGIN_NAME || 'html.to.design'
  console.log(`Opening plugin: ${pluginName} for ${label}...`)
  try {
    await driver.sleep(2000)
    // Method 1: Direct click on plugin button using specific XPath
    console.log('Clicking on plugin button using specific XPath...')

    const pluginButton = await driver.wait(
      until.elementLocated(
        By.xpath(
          "//*[@id='react-page']/div/div/div/div[1]/div[2]/div/div/div/div/div/div/div[1]/div/div/div[2]/div/div/div/button[2]"
        )
      ),
      5000
    )

    await pluginButton.click()
    console.log('✓ Clicked on plugin button - modal should open')
    await driver.sleep(3000) // Wait for modal to open
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
      // For Linux/Windows
      try {
        await driver.actions().sendKeys(Key.chord(Key.CONTROL, 'p')).perform()
        await driver.sleep(2000)
        console.log('All methods failed - manual intervention may be required')
      } catch (e) {
        console.log('Keyboard shortcut also failed')
      }
    }
  }

  // Verify modal opened by looking for search input
  await driver.sleep(2000)
  try {
    await driver.wait(
      until.elementLocated(By.css('input[placeholder*="Search"], input[type="search"]')),
      5000
    )
    console.log('✓ Plugin modal confirmed open - search input found')
  } catch (modalError) {
    console.log('⚠️ error in searching for plugin', modalError)
  }

  // Wait for plugin to open
  await driver.sleep(3000)

  // Step 7: Handle html.to.design plugin workflow in Manage Plugins modal
  console.log(`[${label}] Handling html.to.design plugin workflow...`)

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
    let pluginClicked = false
    try {
      const pluginOption = await driver.wait(
        until.elementLocated(
          By.xpath(
            "//*[@id='react-page']/div/div/div/div[1]/div[1]/div/div[1]/div[12]/div/div/div/div/div/div/div/div[3]/div/div/div/div/div/div/div[1]/button[1]"
          )
        ),
        5000
      )
      await pluginOption.click()
      console.log('✓ Clicked on first html.to.design plugin using specific XPath')
      pluginClicked = true
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

    // Verify that the plugin popup actually opened
    if (pluginClicked) {
      console.log('Verifying plugin popup opened...')
      let popupOpened = false
      try {
        // Wait for plugin UI elements to appear (Editor tab, container-tabs, etc.)
        await driver.wait(until.elementLocated(By.xpath("//*[@id='container-tabs']")), 10000)
        console.log('✓ Plugin popup confirmed open - container-tabs found')
        popupOpened = true
      } catch (e) {
        console.log('container-tabs not found, trying alternative verification...')
        // Try alternative verification methods
        try {
          // Check for plugin iframe
          await driver.wait(until.elementLocated(By.css('iframe[src*="plugin"]')), 5000)
          console.log('✓ Plugin popup confirmed open - iframe found')
          popupOpened = true
        } catch (e2) {
          console.log('Plugin iframe not found, trying to find Editor tab...')
          try {
            await driver.wait(
              until.elementLocated(
                By.xpath("//label[contains(text(), 'Editor') or contains(., 'Editor')]")
              ),
              5000
            )
            console.log('✓ Plugin popup confirmed open - Editor tab found')
            popupOpened = true
          } catch (e3) {
            console.log('⚠️ Could not verify plugin popup opened, but continuing...')
          }
        }
      }

      if (!popupOpened) {
        console.log('⚠️ Plugin popup may not have opened properly. Trying to reopen...')
        // Try pressing Escape and reopening
        try {
          await driver.actions().sendKeys(Key.ESCAPE).perform()
          await driver.sleep(1000)
          // Try clicking plugin button again
          const pluginOption = await driver.findElement(
            By.xpath(
              "//*[@id='react-page']/div/div/div/div[1]/div[1]/div/div[1]/div[12]/div/div/div/div/div/div/div/div[3]/div/div/div/div/div/div/div[1]/button[1]"
            )
          )
          await pluginOption.click()
          await driver.sleep(3000)
          console.log('✓ Retried opening plugin')
        } catch (retryError) {
          console.log('⚠️ Retry failed, continuing anyway...')
        }
      }
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
        "//*[@id='container-tabs']/div/div[1]/label[4]",
        "//*[@id='container-tabs']/div/div[1]/label[4]/div", // Specific XPath for Editor tab in nested iframe
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
          const editorTabElement = await driver.wait(until.elementLocated(By.xpath(selector)), 3000)
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

      if (editorTabClicked) {
        console.log('✓ Editor tab clicked successfully')
        await driver.sleep(2000) // Wait for tab content to load
      } else {
        console.log('⚠️ Could not click Editor tab, continuing anyway...')
      }
    } catch (e) {
      console.log('Error clicking Editor tab:', e)
    }

    // Step 7.4: Click the container-settings button after navigating to editor section
    console.log('Clicking container-settings button in editor section...')
    try {
      const containerSettingsButton = await driver.wait(
        until.elementLocated(By.xpath("//*[@id='container-settings']/button")),
        5000
      )
      await containerSettingsButton.click()
      console.log('✓ Clicked container-settings button')
      await driver.sleep(1000) // Wait for any UI changes
    } catch (error) {
      console.log(
        'Could not find container-settings button, trying alternative selectors...',
        error instanceof Error ? error.message : String(error)
      )
      // Fallback: Try alternative selectors
      try {
        const alternativeSelectors = [
          "//*[@id='container-settings']//button",
          "//div[@id='container-settings']/button",
          "//div[@id='container-settings']//button[1]",
          '/html/body/div[1]/div/div/div[2]/div/div[2]/div[4]/section/footer/div[1]/button',
        ]
        let buttonClicked = false
        for (const selector of alternativeSelectors) {
          try {
            const button = await driver.findElement(By.xpath(selector))
            await button.click()
            console.log(`✓ Clicked container-settings button using selector: ${selector}`)
            buttonClicked = true
            await driver.sleep(1000)
            break
          } catch (e) {
            // Continue to next selector
          }
        }
        if (!buttonClicked) {
          console.log('⚠️ Could not click container-settings button, continuing anyway...')
        }
      } catch (fallbackError) {
        console.log('⚠️ All container-settings button selectors failed, continuing anyway...')
      }
    }

    // Step 7.4.1: Click on viewport width input and set it to the target viewportWidth
    console.log(`Setting viewport width to ${payload.viewportWidth}px...`)
    try {
      const viewportInput = await driver.wait(
        until.elementLocated(
          By.xpath('/html/body/div[4]/div[1]/div[1]/form/fieldset[1]/div/div[1]/div[2]/input')
        ),
        5000
      )
      await viewportInput.click()
      await driver.sleep(200) // Wait for focus

      // Clear the input using multiple methods to ensure it's cleared
      try {
        // Method 1: Select all and delete using keyboard shortcuts
        await driver.actions().keyDown(Key.COMMAND).sendKeys('a').keyUp(Key.COMMAND).perform()
        await driver.sleep(100)
        await driver.actions().sendKeys(Key.DELETE).perform()
      } catch (e) {
        // Try Ctrl+A for Windows/Linux
        try {
          await driver.actions().keyDown(Key.CONTROL).sendKeys('a').keyUp(Key.CONTROL).perform()
          await driver.sleep(100)
          await driver.actions().sendKeys(Key.DELETE).perform()
        } catch (e2) {
          // Fallback to clear() method
          await viewportInput.clear()
        }
      }

      // Method 2: Also try JavaScript to set value directly (clears and sets in one go)
      try {
        await driver.executeScript(
          `arguments[0].value = ''; arguments[0].dispatchEvent(new Event('input', { bubbles: true }));`,
          viewportInput
        )
        await driver.sleep(100)
      } catch (jsError) {
        console.log('JavaScript clear failed, continuing with sendKeys...')
      }

      await driver.sleep(200) // Wait after clearing
      await viewportInput.sendKeys(payload.viewportWidth.toString())
      console.log(`✓ Set viewport width to ${payload.viewportWidth}px`)
      await driver.sleep(500) // Wait for value to be set
    } catch (error) {
      console.log(
        'Could not find or set viewport width input, trying alternative selectors...',
        error instanceof Error ? error.message : String(error)
      )
      // Fallback: Try alternative selectors
      try {
        const alternativeSelectors = [
          "//input[@type='number']",
          "//input[contains(@placeholder, 'width') or contains(@placeholder, 'Width')]",
          '//form//fieldset//input',
        ]
        let inputSet = false
        for (const selector of alternativeSelectors) {
          try {
            const input = await driver.findElement(By.xpath(selector))
            await input.click()
            await driver.sleep(200) // Wait for focus

            // Clear the input using multiple methods
            try {
              // Method 1: Select all and delete using keyboard shortcuts
              await driver.actions().keyDown(Key.COMMAND).sendKeys('a').keyUp(Key.COMMAND).perform()
              await driver.sleep(100)
              await driver.actions().sendKeys(Key.DELETE).perform()
            } catch (e) {
              // Try Ctrl+A for Windows/Linux
              try {
                await driver
                  .actions()
                  .keyDown(Key.CONTROL)
                  .sendKeys('a')
                  .keyUp(Key.CONTROL)
                  .perform()
                await driver.sleep(100)
                await driver.actions().sendKeys(Key.DELETE).perform()
              } catch (e2) {
                // Fallback to clear() method
                await input.clear()
              }
            }

            // Method 2: Also try JavaScript to clear
            try {
              await driver.executeScript(
                `arguments[0].value = ''; arguments[0].dispatchEvent(new Event('input', { bubbles: true }));`,
                input
              )
              await driver.sleep(100)
            } catch (jsError) {
              // Continue
            }

            await driver.sleep(200) // Wait after clearing
            await input.sendKeys(payload.viewportWidth.toString())
            console.log(`✓ Set viewport width using selector: ${selector}`)
            inputSet = true
            await driver.sleep(500)
            break
          } catch (e) {
            // Continue to next selector
          }
        }
        if (!inputSet) {
          console.log('⚠️ Could not set viewport width, continuing anyway...')
        }
      } catch (fallbackError) {
        console.log('⚠️ All viewport width input selectors failed, continuing anyway...')
      }
    }

    // Step 7.4.2: Click on close button
    console.log('Clicking close button...')
    try {
      const closeButton = await driver.wait(
        until.elementLocated(By.xpath('/html/body/div[4]/div[1]/div[1]/div[2]/div[2]/button')),
        3000
      )
      await closeButton.click()
      console.log('✓ Clicked close button')
      await driver.sleep(1000) // Wait for modal/dialog to close
    } catch (error) {
      console.log(
        'Could not find close button, trying alternative selectors...',
        error instanceof Error ? error.message : String(error)
      )
      // Fallback: Try alternative selectors
      try {
        const alternativeSelectors = [
          "//div[contains(@class, 'close')]//button",
          "//button[contains(text(), 'Close') or contains(@aria-label, 'Close')]",
          "//button[@type='button' and contains(@class, 'close')]",
        ]
        let closeClicked = false
        for (const selector of alternativeSelectors) {
          try {
            const button = await driver.findElement(By.xpath(selector))
            await button.click()
            console.log(`✓ Clicked close button using selector: ${selector}`)
            closeClicked = true
            await driver.sleep(1000)
            break
          } catch (e) {
            // Continue to next selector
          }
        }
        if (!closeClicked) {
          console.log('⚠️ Could not click close button, continuing anyway...')
        }
      } catch (fallbackError) {
        console.log('⚠️ All close button selectors failed, continuing anyway...')
      }
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
        // Debug: Log HTML content details
        console.log(`[NextJS] HTML content details:`, {
          length: fullHtml.length,
          firstChars: fullHtml.substring(0, 100),
          lastChars: fullHtml.substring(Math.max(0, fullHtml.length - 100)),
          hasNewlines: fullHtml.includes('\n'),
          hasSpecialChars: /[^\x00-\x7F]/.test(fullHtml),
        })

        // Look for HTML textarea or input field
        const htmlSelectors = [
          '#fullHtmlInput', // Specific ID from our plugin
          '.cm-activeLine.cm-line', // CodeMirror active line
          'textarea[placeholder*="HTML"]',
          'textarea[placeholder*="html"]',
          'input[placeholder*="HTML"]',
          'input[placeholder*="html"]',
          'textarea[id*="html"]',
          'textarea[id*="HTML"]',
          'textarea[class*="html"]',
          'textarea[class*="HTML"]',
          'textarea',
          'input[type="text"]',
        ]

        let htmlInput = null
        try {
          htmlInput = await driver.findElement(
            By.xpath(
              '//*[@id="container-tabs"]/div/div[2]/div[4]/section/div[1]/div[2]/div/div/div[2]/div[1]/div'
            )
          )
          console.log('[NextJS] ✓ Found HTML input using XPath')
        } catch (e) {
          console.log('[NextJS] XPath selector failed, trying CSS selectors...')
        }

        if (!htmlInput) {
          for (const selector of htmlSelectors) {
            try {
              htmlInput = await driver.findElement(By.css(selector))
              console.log(`[NextJS] ✓ Found HTML input using selector: ${selector}`)
              break
            } catch (e) {
              // Continue to next selector
            }
          }
        }

        if (htmlInput) {
          console.log('[NextJS] Attempting to paste HTML content...')
          try {
            console.log('[NextJS] Attempting fast JavaScript injection method...')
            await htmlInput.clear()
            console.log('[NextJS] Full HTML ', fullHtml)
            console.log('[NextJS] ✓ Cleared input field')

            // Method 1: Fast JavaScript injection with proper HTML handling
            const result = await driver.executeScript(
              `
                const element = arguments[0];
                const content = arguments[1];
                
                console.log('[JS] Starting fast HTML injection...');
                console.log('[JS] Content length:', content.length);
                console.log('[JS] Element type:', element.tagName);
                console.log('[JS] Element classes:', element.className);
                
                // Focus the element first
                element.focus();
                
                // Clear existing content
                element.value = '';
                element.textContent = '';
                element.innerHTML = '';
                
                // Check if this is a CodeMirror editor
                const isCodeMirror = element.className.includes('cm-') || element.closest('.cm-editor');
                
                if (isCodeMirror) {
                  console.log('[JS] Detected CodeMirror editor, using special handling');
                  
                  // For CodeMirror, try to find the editor instance
                  const cmEditor = element.closest('.cm-editor');
                  if (cmEditor && window.CodeMirror) {
                    // Try to get CodeMirror instance
                    const cmInstance = cmEditor.CodeMirror || cmEditor._cm;
                    if (cmInstance) {
                      cmInstance.setValue(content);
                      console.log('[JS] Set content via CodeMirror API');
                    } else {
                      element.innerHTML = content;
                      element.textContent = content;
                    }
                  } else {
                    // Fallback for CodeMirror without API access
                    element.innerHTML = content;
                    element.textContent = content;
                  }
                } else if (element.tagName === 'DIV' || element.contentEditable === 'true') {
                  // For contentEditable divs - use innerHTML for HTML rendering
                  console.log('[JS] Using innerHTML for HTML content');
                  element.innerHTML = content;
                  
                  // Also set textContent as fallback
                  element.textContent = content;
                } else if (element.tagName === 'TEXTAREA') {
                  // For textarea elements - use value
                  console.log('[JS] Using value for textarea');
                  element.value = content;
                } else {
                  // For other input elements - try both methods
                  console.log('[JS] Using both value and innerHTML');
                  element.value = content;
                  element.innerHTML = content;
                }
                
                // Simulate proper HTML paste event
                const pasteEvent = new ClipboardEvent('paste', {
                  bubbles: true,
                  cancelable: true,
                  clipboardData: new DataTransfer()
                });
                
                // Trigger all necessary events in sequence
                element.dispatchEvent(new Event('focus', { bubbles: true }));
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(pasteEvent);
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('keyup', { bubbles: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));
                
                // Verify content was set
                const setContent = element.value || element.textContent || element.innerHTML;
                const success = setContent.length > 0 && setContent.length >= content.length * 0.8;
                
                console.log('[JS] Fast injection result:', {
                  success,
                  expectedLength: content.length,
                  actualLength: setContent.length,
                  elementType: element.tagName,
                  hasHtmlTags: setContent.includes('<'),
                  contentPreview: setContent.substring(0, 100)
                });
                
                return { 
                  success, 
                  method: 'fast_javascript',
                  contentLength: setContent.length,
                  expectedLength: content.length,
                  hasHtmlTags: setContent.includes('<')
                };
              `,
              htmlInput,
              fullHtml
            )

            if (result && typeof result === 'object' && 'success' in result && result.success) {
              console.log('[NextJS] ✓ Fast JavaScript injection successful')
            } else {
              throw new Error('Fast injection failed')
            }
          } catch (pasteError) {
            console.log('[NextJS] Fast method failed, trying clipboard simulation...')

            // Method 2: Clipboard simulation with execCommand
            try {
              await driver.executeScript(
                `
                  const element = arguments[0];
                  const content = arguments[1];
                  
                  console.log('[JS] Trying clipboard simulation...');
                  
                  // Focus and select all
                  element.focus();
                  element.select();
                  
                  // Use execCommand for HTML pasting
                  const success = document.execCommand('insertHTML', false, content);
                  
                  if (!success) {
                    // Fallback to direct HTML setting
                    if (element.tagName === 'DIV' || element.contentEditable === 'true' || element.className.includes('cm-')) {
                      element.innerHTML = content;
                      element.textContent = content;
                    } else {
                      element.value = content;
                    }
                  }
                  
                  // Trigger events
                  element.dispatchEvent(new Event('input', { bubbles: true }));
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                  
                  console.log('[JS] Clipboard simulation completed');
                  return { success: true, method: 'clipboard' };
                `,
                htmlInput,
                fullHtml
              )
              console.log('[NextJS] ✓ Used clipboard simulation')
            } catch (clipboardError) {
              console.log('[NextJS] Clipboard simulation failed, trying direct HTML setting...')

              // Method 3: Direct HTML setting (fastest fallback)
              await driver.executeScript(
                `
                  const element = arguments[0];
                  const content = arguments[1];
                  
                  console.log('[JS] Direct HTML setting...');
                  
                  // Direct HTML assignment (fastest)
                  if (element.tagName === 'DIV' || element.contentEditable === 'true' || element.className.includes('cm-')) {
                    element.innerHTML = content;
                    element.textContent = content;
                  } else {
                    element.value = content;
                  }
                  
                  // Minimal event triggering
                  element.dispatchEvent(new Event('input', { bubbles: true }));
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                  
                  console.log('[JS] Direct HTML setting completed');
                  return { success: true, method: 'direct' };
                `,
                htmlInput,
                fullHtml
              )
              console.log('[NextJS] ✓ Used direct HTML setting')
            }
          }

          // Verify the content was pasted
          try {
            const pastedValue =
              (await htmlInput.getAttribute('value')) ||
              (await htmlInput.getAttribute('textContent')) ||
              (await htmlInput.getAttribute('innerHTML'))
            console.log(
              `[NextJS] Verification - pasted content length: ${pastedValue?.length || 0}`
            )

            if ((pastedValue?.length || 0) < fullHtml.length * 0.8) {
              console.log('[NextJS] ⚠️ Warning: Content may not have been fully pasted')
            }
          } catch (verifyError) {
            console.log('[NextJS] Could not verify pasted content:', verifyError)
          }
        }

        await driver.sleep(2000) // Increased wait time
      } catch (e) {
        console.log('[NextJS] Could not find HTML input field, trying JavaScript injection...')
        // Enhanced fallback: Try to inject via JavaScript with better error handling
        try {
          const injectionResult = await driver.executeScript(
            `
            console.log('[JS] Starting HTML injection...');
            
            const textareas = document.querySelectorAll('textarea');
            const inputs = document.querySelectorAll('input[type="text"]');
            const codeMirrorElements = document.querySelectorAll('.cm-activeLine.cm-line');
            
            console.log('[JS] Found elements:', {
              textareas: textareas.length,
              inputs: inputs.length,
              codeMirror: codeMirrorElements.length
            });
            
            // Try to find HTML input field
            let htmlField = null;
            
            // First try to find by ID
            const fullHtmlInput = document.getElementById('fullHtmlInput');
            if (fullHtmlInput) {
              htmlField = fullHtmlInput;
              console.log('[JS] Found by ID: fullHtmlInput');
            } else {
              // Try CodeMirror elements first
              for (let cmElement of codeMirrorElements) {
                if (cmElement.contentEditable === 'true' || cmElement.tagName === 'DIV') {
                  htmlField = cmElement;
                  console.log('[JS] Found CodeMirror element');
                  break;
                }
              }
              
              // Try to find by placeholder
              if (!htmlField) {
                for (let textarea of textareas) {
                  if (textarea.placeholder && textarea.placeholder.toLowerCase().includes('html')) {
                    htmlField = textarea;
                    console.log('[JS] Found by placeholder in textarea');
                    break;
                  }
                }
              }
              
              if (!htmlField) {
                for (let input of inputs) {
                  if (input.placeholder && input.placeholder.toLowerCase().includes('html')) {
                    htmlField = input;
                    console.log('[JS] Found by placeholder in input');
                    break;
                  }
                }
              }
              
              if (!htmlField && textareas.length > 0) {
                htmlField = textareas[0]; // Use first textarea as fallback
                console.log('[JS] Using first textarea as fallback');
              }
            }
            
            if (htmlField) {
              console.log('[JS] Setting HTML content...');
              const htmlContent = arguments[0];
              
              // Clear existing content first
              htmlField.value = '';
              htmlField.textContent = '';
              htmlField.innerHTML = '';
              
              if (htmlField.tagName === 'DIV' || htmlField.contentEditable === 'true') {
                // For contentEditable divs (like CodeMirror)
                htmlField.textContent = htmlContent;
                htmlField.innerHTML = htmlContent;
              } else {
                // For regular input/textarea elements
                htmlField.value = htmlContent;
              }
              
              // Trigger all necessary events
              htmlField.dispatchEvent(new Event('input', { bubbles: true }));
              htmlField.dispatchEvent(new Event('change', { bubbles: true }));
              htmlField.dispatchEvent(new Event('keyup', { bubbles: true }));
              htmlField.dispatchEvent(new Event('blur', { bubbles: true }));
              
              // Verify content was set
              const setContent = htmlField.value || htmlField.textContent || htmlField.innerHTML;
              const success = setContent.length > 0 && setContent.length >= htmlContent.length * 0.8;
              
              console.log('[JS] HTML content injection result:', {
                success,
                expectedLength: htmlContent.length,
                actualLength: setContent.length,
                elementType: htmlField.tagName
              });
              
              return { 
                success, 
                elementType: htmlField.tagName,
                contentLength: setContent.length,
                expectedLength: htmlContent.length
              };
            } else {
              console.error('[JS] Could not find HTML input field');
              return { success: false, error: 'No suitable input field found' };
            }
          `,
            fullHtml
          )

          console.log('[NextJS] JavaScript injection result:', injectionResult)
          await driver.sleep(2000) // Increased wait time
        } catch (injectionError) {
          console.error('[NextJS] JavaScript injection failed:', injectionError)
          throw new Error('All HTML input methods failed')
        }
      }
    } // End of if (editorTabClicked) block

    // Step 7.6: Click on "Create" button
    console.log('[NextJS] Looking for Create button...')

    // Only proceed if Editor tab was clicked successfully
    if (!editorTabClicked) {
      console.log('[NextJS] ⚠️ Editor tab was not clicked, skipping Create button search')
    } else {
      // Add timeout wrapper to prevent getting stuck
      const createButtonTimeout = 15000 // 15 seconds timeout
      const startTime = Date.now()

      let createClicked = false
      try {
        console.log('[NextJS] Waiting for Create button...')

        // Try the primary Create button selector with timeout
        const createButton = await Promise.race([
          driver.wait(
            until.elementLocated(
              By.xpath("//*[@id='container-tabs']/div/div[2]/div[4]/section/footer/div[2]/button")
            ),
            10000
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Create button timeout')), createButtonTimeout)
          ),
        ])

        await createButton.click()
        console.log('[NextJS] ✓ Clicked Create button')
        createClicked = true
        await driver.sleep(10000) // Wait for design to be created
      } catch (e) {
        console.log('[NextJS] Primary Create button not found, trying alternative selectors...')
        const createSelectors = [
          '#createBtn', // Specific ID from our plugin
          "//button[contains(text(), 'Create')]",
          "//button[contains(text(), 'Generate')]",
          "//button[contains(text(), 'Convert')]",
          "//button[contains(text(), 'Import')]",
          "//div[contains(text(), 'Create')]",
          "//span[contains(text(), 'Create')]",
        ]

        // Try alternative selectors with timeout check
        for (const selector of createSelectors) {
          try {
            // Check if we're still within timeout
            if (Date.now() - startTime > createButtonTimeout) {
              console.log('[NextJS] ⏰ Create button search timeout reached')
              break
            }

            const createElement = await driver.findElement(By.xpath(selector))
            await createElement.click()
            console.log(`[NextJS] ✓ Clicked Create using selector: ${selector}`)
            createClicked = true
            break
          } catch (e) {
            // Continue to next selector
          }
        }

        if (!createClicked) {
          console.log('[NextJS] Could not find Create button, trying JavaScript...')
          try {
            const jsResult = await driver.executeScript(`
              console.log('[JS] Looking for Create button...');
              
              // First try to find by ID
              const createBtn = document.getElementById('createBtn');
              if (createBtn) {
                createBtn.click();
                console.log('[JS] Clicked Create button via JavaScript (by ID)');
                return { success: true, method: 'byId' };
              } else {
                // Fallback to text search
                const buttons = document.querySelectorAll('button');
                for (let button of buttons) {
                  if (button.textContent && button.textContent.toLowerCase().includes('create')) {
                    button.click();
                    console.log('[JS] Clicked Create button via JavaScript (by text)');
                    return { success: true, method: 'byText' };
                  }
                }
              }
              
              console.log('[JS] No Create button found');
              return { success: false, error: 'No Create button found' };
            `)

            console.log('[NextJS] JavaScript Create button result:', jsResult)
            if (
              jsResult &&
              typeof jsResult === 'object' &&
              'success' in jsResult &&
              jsResult.success
            ) {
              createClicked = true
            }
          } catch (jsError) {
            console.error('[NextJS] JavaScript Create button failed:', jsError)
          }
        }

        if (createClicked) {
          console.log('[NextJS] ✓ Create button clicked successfully')
          await driver.sleep(5000) // Wait for design to be created
        } else {
          console.log('[NextJS] ⚠️ Could not find or click Create button')
        }
      }

      // Click "Add to Canvas" button
      try {
        await driver.sleep(2000)
        console.log('[NextJS] Looking for Add to Canvas button...')
        const addToCanvasButton = await driver.findElement(
          By.xpath('/html/body/div[6]/div[1]/div[3]/div[1]/div[2]/button')
        )
        await addToCanvasButton.click()
        console.log('[NextJS] ✓ Clicked Add to Canvas button')
        await driver.sleep(5000)
      } catch (e) {
        console.log(
          '[NextJS] Could not find Add to Canvas button:',
          e instanceof Error ? e.message : String(e)
        )
      }
      await switchToMainContent(driver)
    } // End of if (editorTabClicked) block for Create button

    console.log(`✓ html.to.design plugin workflow completed for ${label}!`)
  } catch (error) {
    console.error(`Error in html.to.design plugin workflow for ${label}:`, error)
    console.log('⚠️ Plugin workflow failed - design may need manual creation')
  } finally {
    console.log(`[${label}] Closing plugin workflow...`)
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
        console.log(`[${label}] ✓ Closed plugin window`)
        await driver.sleep(1000) // Wait for modal to close
      } catch (e) {
        console.log(`[${label}] No close button found, continuing...`)
        try {
          const alternativeSelectors = [
            "//button[contains(@aria-label, 'Close') or contains(@title, 'Close')]",
            "//button[contains(@class, 'close')]",
            "//div[contains(@class, 'close')]//button",
            '//*[@id="react-page"]/div/div/div/div[8]/div/div/div[2]',
          ]
          let closeClicked = false
          for (const selector of alternativeSelectors) {
            try {
              const button = await driver.findElement(By.xpath(selector))
              await button.click()
              console.log(`[${label}] ✓ Closed popup using selector: ${selector}`)
              closeClicked = true
              await driver.sleep(1000)
              break
            } catch (e) {
              // Continue to next selector
            }
          }
        } catch (e) {
          console.log(`[${label}] No close button found, continuing...`)
        }
      }

      // After closing plugin modal, click on Design tab and set X/Y axis values
      try {
        console.log(`[${label}] Clicking on Design tab...`)
        await driver.sleep(2000) // Wait for UI to stabilize after modal close

        // Click on Design tab using provided XPath
        const designTabSelectors = [
          "//*[@id='tab:r1rk:-0-trigger']",
          '/html/body/div[2]/div/div/div/div[1]/div[1]/div/div[1]/div[12]/div/div/div/div/div[1]/div/div/div[2]/div[1]/div/button[1]',
          "//button[contains(text(), 'Design')]",
          "//div[contains(text(), 'Design')]",
        ]

        let designTabClicked = false
        for (const selector of designTabSelectors) {
          try {
            const designTab = await driver.wait(until.elementLocated(By.xpath(selector)), 5000)
            await designTab.click()
            console.log(`[${label}] ✓ Clicked Design tab using selector: ${selector}`)
            designTabClicked = true
            await driver.sleep(2000) // Wait for Design tab to load
            break
          } catch (e) {
            // Continue to next selector
          }
        }

        if (designTabClicked) {
          // Set X Axis value to index * 1000
          console.log(`[${label}] Setting X Axis to ${index * 1000}...`)
          const xAxisValue = (index * 1800).toString()
          const xAxisSelectors = [
            "//*[@id='properties-panel-scroll-container']/div/div/div/div[2]/div/div[3]/fieldset/div[1]/div/div/div/input",
            '/html/body/div[2]/div/div/div/div[1]/div[1]/div/div[1]/div[12]/div/div/div/div/div[1]/div/div/div[3]/div/div[1]/div/div/div/div[2]/div/div[3]/fieldset/div[1]/div/div/div/input',
            "//input[contains(@placeholder, 'X') or contains(@aria-label, 'X')]",
          ]

          let xAxisSet = false
          for (const selector of xAxisSelectors) {
            try {
              const xAxisInput = await driver.wait(until.elementLocated(By.xpath(selector)), 5000)
              await xAxisInput.click()
              await driver.sleep(200) // Wait for focus

              // Clear the input
              try {
                await driver
                  .actions()
                  .keyDown(Key.COMMAND)
                  .sendKeys('a')
                  .keyUp(Key.COMMAND)
                  .perform()
                await driver.sleep(100)
                await driver.actions().sendKeys(Key.DELETE).perform()
              } catch (e) {
                try {
                  await driver
                    .actions()
                    .keyDown(Key.CONTROL)
                    .sendKeys('a')
                    .keyUp(Key.CONTROL)
                    .perform()
                  await driver.sleep(100)
                  await driver.actions().sendKeys(Key.DELETE).perform()
                } catch (e2) {
                  await xAxisInput.clear()
                }
              }

              await driver.sleep(200)
              await xAxisInput.sendKeys(xAxisValue)
              console.log(`[${label}] ✓ Set X Axis to ${xAxisValue}`)
              xAxisSet = true
              await driver.sleep(500)
              break
            } catch (e) {
              // Continue to next selector
            }
          }

          if (!xAxisSet) {
            console.log(`[${label}] ⚠️ Could not set X Axis value`)
          }

          // Set Y Axis value to index * 100
          console.log(`[${label}] Setting Y Axis to ${index * 100}...`)
          const yAxisValue = (100).toString()
          const yAxisSelectors = [
            "//*[@id='properties-panel-scroll-container']/div/div/div/div[2]/div/div[3]/fieldset/div[2]/div/div/div/input",
            '/html/body/div[2]/div/div/div/div[1]/div[1]/div/div[1]/div[12]/div/div/div/div/div[1]/div/div/div[3]/div/div[1]/div/div/div/div[2]/div/div[3]/fieldset/div[2]/div/div/div/input',
            "//input[contains(@placeholder, 'Y') or contains(@aria-label, 'Y')]",
          ]

          let yAxisSet = false
          for (const selector of yAxisSelectors) {
            try {
              const yAxisInput = await driver.wait(until.elementLocated(By.xpath(selector)), 5000)
              await yAxisInput.click()
              await driver.sleep(200) // Wait for focus

              // Clear the input
              try {
                await driver
                  .actions()
                  .keyDown(Key.COMMAND)
                  .sendKeys('a')
                  .keyUp(Key.COMMAND)
                  .perform()
                await driver.sleep(100)
                await driver.actions().sendKeys(Key.DELETE).perform()
              } catch (e) {
                try {
                  await driver
                    .actions()
                    .keyDown(Key.CONTROL)
                    .sendKeys('a')
                    .keyUp(Key.CONTROL)
                    .perform()
                  await driver.sleep(100)
                  await driver.actions().sendKeys(Key.DELETE).perform()
                } catch (e2) {
                  await yAxisInput.clear()
                }
              }

              await driver.sleep(200)
              await yAxisInput.sendKeys(yAxisValue)
              console.log(`[${label}] ✓ Set Y Axis to ${yAxisValue}`)
              yAxisSet = true
              await driver.sleep(500)
              break
            } catch (e) {
              // Continue to next selector
            }
          }

          if (!yAxisSet) {
            console.log(`[${label}] ⚠️ Could not set Y Axis value`)
          }
        } else {
          console.log(`[${label}] ⚠️ Could not click Design tab`)
        }
      } catch (error) {
        console.log(
          `[${label}] Error setting Design tab and axis values:`,
          error instanceof Error ? error.message : String(error)
        )
      }

      console.log(`[${label}] ✓ Plugin cleanup completed`)
    } catch (error) {
      console.log(`[${label}] Error during plugin cleanup:`, error)
    }
  }
}

async function logoutOfFigma(driver: WebDriver): Promise<void> {
  try {
    console.log('[NextJS] Navigating to Figma homepage before logout...')
    await driver.get('https://www.figma.com/')
    await driver.sleep(3000) // Wait for page to load
    console.log('[NextJS] ✓ Navigated to Figma homepage')

    // Click on the user dropdown menu
    console.log('[NextJS] Looking for user dropdown menu...')
    await driver.sleep(2000) // Wait for dropdown to appear

    // Look for "Arena Developer" text and click on it
    console.log('[NextJS] Looking for Arena Developer text...')
    try {
      const arenaDeveloperOption = await driver.wait(
        until.elementLocated(
          By.xpath(
            '/html/body/div[2]/div/div/div/div[1]/div[1]/nav/div[1]/div[1]/div/div[1]/button'
          )
        ),
        5000
      )
      await arenaDeveloperOption.click()
      console.log('[NextJS] ✓ Clicked on Arena Developer')
      await driver.sleep(2000) // Wait for submenu to appear
    } catch (arenaError) {
      console.log('[NextJS] Arena Developer not found, trying direct logout...')
    }

    // Click on Log out option using text search
    console.log('[NextJS] Looking for Log out option...')
    const logoutOption = await driver.wait(
      until.elementLocated(By.xpath('/html/body/div[4]/div/div/div/ul/div/ul[4]/li')),
      5000
    )
    await logoutOption.click()
    console.log('[NextJS] ✓ Clicked Log out option')
    await driver.sleep(3000) // Wait for logout to complete
  } catch (e) {
    console.log(
      '[NextJS] Could not complete logout process:',
      e instanceof Error ? e.message : String(e)
    )
  }
}

function resolveChromedriverPath(): string {
  const candidates = [
    process.env.CHROMEDRIVER_PATH,
    '/usr/bin/chromedriver',
    '/usr/lib/chromium/chromedriver',
    '/usr/local/bin/chromedriver',
    '/opt/homebrew/bin/chromedriver',
  ].filter(Boolean) as string[]

  for (const path of candidates) {
    if (existsSync(path)) {
      return path
    }
  }

  throw new Error(
    'Could not locate ChromeDriver. Set CHROMEDRIVER_PATH or install chromedriver in a standard location.'
  )
}

function resolveChromeBinaryPath(): string {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/lib/chromium/chrome',
    '/usr/bin/google-chrome',
    '/opt/google/chrome/chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean) as string[]

  for (const path of candidates) {
    if (existsSync(path)) {
      return path
    }
  }

  throw new Error(
    'Could not locate a Chrome/Chromium binary. Set CHROME_BIN or install Chrome/Chromium in the container/host.'
  )
}
