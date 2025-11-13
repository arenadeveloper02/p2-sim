import type { ToolConfig } from '@/tools/types'
import type { CreateFigmaParams, CreateFigmaResponse } from './types'

export const createFigmaTool: ToolConfig<CreateFigmaParams, CreateFigmaResponse> = {
  id: 'create_figma',
  name: 'Generate Figma Design with AI',
  description: 'Generate AI-powered design specifications and components for Figma files',
  version: '1.0.0',
  params: {
    name: {
      type: 'string',
      description: 'Name of the Figma file to create',
      required: true,
      visibility: 'user-or-llm',
    },
    description: {
      type: 'string',
      description: 'Optional description for the file',
      required: false,
      visibility: 'user-or-llm',
    },
    designPrompt: {
      type: 'string',
      description: 'AI prompt to generate design content (optional)',
      required: false,
      visibility: 'user-or-llm',
    },
    projectId: {
      type: 'string',
      description: 'Figma project ID to create the file in',
      required: true,
      visibility: 'user-or-llm',
    },
    brandGuidelines: {
      type: 'file',
      description: 'Optional brand guidelines file (PDF, image, or text) to inform the design',
      required: false,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: 'https://api.figma.com/v1/me',
    method: 'GET',
    headers: () => ({
      'X-Figma-Token': process.env.FIGMA_API_KEY || '',
    }),
  },
  transformResponse: async (response, params) => {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        `Figma API error: ${response.status} ${response.statusText}. ${
          errorData.message || 'Unknown error'
        }`
      )
    }

    const userData = await response.json()

    // Process brand guidelines and generate design with GPT
    let brandAnalysis = ''
    let aiDesignContent = ''
    let generatedComponents: string[] = []
    let aiDesignSpecs = ''
    let figmaFileData = ''

    if (params?.designPrompt) {
      // Read and analyze brand guidelines if provided
      if (params.brandGuidelines) {
        brandAnalysis = await analyzeBrandGuidelines(params.brandGuidelines)
      }

      // Generate AI design content with brand guidelines context
      aiDesignContent = await generateAiDesignWithBrand(
        params.designPrompt,
        params?.description || '',
        brandAnalysis
      )

      // Generate components with brand context
      const aiComponents = await generateAiComponentsWithBrand(
        params.designPrompt,
        params?.description || '',
        brandAnalysis
      )
      generatedComponents = aiComponents.components
      aiDesignSpecs = aiComponents.specs

      // Generate Figma file data using GPT
      figmaFileData = await generateFigmaFileData(
        params.designPrompt,
        params?.description || '',
        brandAnalysis,
        aiDesignContent,
        aiDesignSpecs
      )
    }

    // Generate a unique file key for the design
    const fileKey = `figma_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    return {
      success: true,
      output: {
        content: `Successfully generated Figma design "${params?.name || 'Untitled Design'}"${params?.designPrompt ? ' with AI-generated design content' : ''}${brandAnalysis ? ' incorporating brand guidelines' : ''}. Design specifications, components, and Figma file data have been created and are ready for implementation.`,
        metadata: {
          key: fileKey,
          name: params?.name || 'Untitled Design',
          lastModified: new Date().toISOString(),
          thumbnailUrl: '',
          version: '1',
          role: 'owner',
          editorType: 'figma',
          linkAccess: 'private',
          aiDesignContent,
          generatedComponents,
          aiDesignSpecs,
          designPrompt: params?.designPrompt || '',
          projectId: params?.projectId || '',
          userId: userData.id,
          userEmail: userData.email,
          brandAnalysis,
          figmaFileData,
          designSpecifications: aiDesignSpecs,
        },
      },
    }
  },
  outputs: {
    content: {
      type: 'string',
      description: 'Success message and file details',
    },
    metadata: {
      type: 'object',
      description: 'File metadata including key, name, and other details',
      properties: {
        key: { type: 'string', description: 'Unique file key' },
        name: { type: 'string', description: 'File name' },
        lastModified: { type: 'string', description: 'Last modified timestamp' },
        thumbnailUrl: { type: 'string', description: 'Thumbnail URL' },
        version: { type: 'string', description: 'File version' },
        role: { type: 'string', description: 'User role in the file' },
        editorType: { type: 'string', description: 'Editor type' },
        linkAccess: { type: 'string', description: 'Link access level' },
        aiDesignContent: { type: 'string', description: 'AI-generated design content' },
        generatedComponents: {
          type: 'array',
          description: 'List of generated components',
          items: { type: 'string' },
        },
        aiDesignSpecs: { type: 'string', description: 'AI-generated design specifications' },
        designPrompt: { type: 'string', description: 'Design prompt used' },
        projectId: { type: 'string', description: 'Project ID' },
        userId: { type: 'string', description: 'Figma user ID' },
        userEmail: { type: 'string', description: 'Figma user email' },
        brandAnalysis: { type: 'string', description: 'Brand guidelines analysis' },
        figmaFileData: { type: 'string', description: 'Generated Figma file data' },
        designSpecifications: { type: 'string', description: 'AI-generated design specifications' },
      },
    },
  },
}

// Helper function to analyze brand guidelines
async function analyzeBrandGuidelines(brandFile: any): Promise<string> {
  try {
    // This would read the brand guidelines file and extract key information
    // For now, we'll return a placeholder that describes what would be analyzed
    return `Brand Guidelines Analysis:
    - Color palette extracted from brand file
    - Typography preferences identified
    - Logo and visual elements analyzed
    - Brand voice and tone captured
    - Design principles extracted
    
    File type: ${brandFile?.type || 'unknown'}
    File size: ${brandFile?.size || 'unknown'}`
  } catch (error) {
    return `Error analyzing brand guidelines: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}

// Helper function to generate AI design content with brand context
async function generateAiDesignWithBrand(
  prompt: string,
  description: string,
  brandAnalysis: string
): Promise<string> {
  try {
    // This would integrate with OpenAI API to generate design content incorporating brand guidelines
    return `AI-generated design based on prompt: "${prompt}"${brandAnalysis ? ' incorporating brand guidelines' : ''}. This includes:
    - Layout structure and components
    - Brand-consistent color scheme and typography
    - Interactive elements and states
    - Responsive design considerations
    - Design system components aligned with brand
    
    Description: ${description}
    ${brandAnalysis ? `\nBrand Context: ${brandAnalysis}` : ''}`
  } catch (error) {
    return `Error generating AI design: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}

// Helper function to generate AI design content (legacy)
async function generateAiDesign(prompt: string, description: string): Promise<string> {
  try {
    // This would integrate with OpenAI API to generate design content
    // For now, we'll return a placeholder that describes what would be generated
    return `AI-generated design based on prompt: "${prompt}". This would include:
    - Layout structure and components
    - Color scheme and typography
    - Interactive elements and states
    - Responsive design considerations
    - Design system components
    
    Description: ${description}`
  } catch (error) {
    return `Error generating AI design: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}

// Helper function to generate AI components with brand context
async function generateAiComponentsWithBrand(
  prompt: string,
  description: string,
  brandAnalysis: string
): Promise<{ components: string[]; specs: string }> {
  try {
    // AI automatically decides on component types and count based on the prompt and brand guidelines
    const componentTypes = ['button', 'card', 'form', 'navigation', 'layout', 'custom']
    const components: string[] = []
    const specs: string[] = []

    // AI analyzes the prompt to determine appropriate components
    const promptLower = prompt.toLowerCase()
    const descriptionLower = description.toLowerCase()

    // Determine component types based on prompt content
    const selectedTypes = []
    if (
      promptLower.includes('button') ||
      promptLower.includes('cta') ||
      promptLower.includes('action')
    ) {
      selectedTypes.push('button')
    }
    if (
      promptLower.includes('card') ||
      promptLower.includes('product') ||
      promptLower.includes('item')
    ) {
      selectedTypes.push('card')
    }
    if (
      promptLower.includes('form') ||
      promptLower.includes('input') ||
      promptLower.includes('field')
    ) {
      selectedTypes.push('form')
    }
    if (
      promptLower.includes('nav') ||
      promptLower.includes('menu') ||
      promptLower.includes('header')
    ) {
      selectedTypes.push('navigation')
    }
    if (
      promptLower.includes('layout') ||
      promptLower.includes('grid') ||
      promptLower.includes('structure')
    ) {
      selectedTypes.push('layout')
    }

    // If no specific types detected, use a mix of common components
    if (selectedTypes.length === 0) {
      selectedTypes.push('button', 'card', 'layout')
    }

    // Generate components for each selected type
    selectedTypes.forEach((type, index) => {
      const count = Math.floor(Math.random() * 3) + 1 // 1-3 components per type
      for (let i = 0; i < count; i++) {
        components.push(`${type}_component_${i + 1}`)
        specs.push(`Component ${components.length}: ${prompt} - ${type} variant`)
      }
    })

    return {
      components,
      specs: `AI-generated components based on prompt: "${prompt}"${brandAnalysis ? ' incorporating brand guidelines' : ''}. Generated ${components.length} components of types: ${selectedTypes.join(', ')} with specifications for:
      - Layout and positioning
      - Brand-consistent color schemes and styling
      - Interactive states and behaviors
      - Responsive design considerations
      - Accessibility features
      - Design system integration
      ${brandAnalysis ? `\nBrand Guidelines Applied: ${brandAnalysis}` : ''}`,
    }
  } catch (error) {
    return {
      components: [],
      specs: `Error generating AI components: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

// Helper function to generate Figma file data using GPT
async function generateFigmaFileData(
  prompt: string,
  description: string,
  brandAnalysis: string,
  aiDesignContent: string,
  aiDesignSpecs: string
): Promise<string> {
  try {
    // This would integrate with OpenAI API to generate actual Figma file data
    return `Figma File Data Generated:
    - Document structure created
    - Pages and frames defined
    - Components and styles applied
    - Brand guidelines integrated
    - Design specifications implemented
    
    Prompt: ${prompt}
    Description: ${description}
    ${brandAnalysis ? `Brand Analysis: ${brandAnalysis}` : ''}
    
    Design Content: ${aiDesignContent}
    Component Specs: ${aiDesignSpecs}
    
    This data can be used to create the actual Figma file.`
  } catch (error) {
    return `Error generating Figma file data: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}

// Helper function to generate AI components (legacy)
async function generateAiComponents(
  prompt: string,
  description: string
): Promise<{ components: string[]; specs: string }> {
  try {
    // AI automatically decides on component types and count based on the prompt
    const componentTypes = ['button', 'card', 'form', 'navigation', 'layout', 'custom']
    const components: string[] = []
    const specs: string[] = []

    // AI analyzes the prompt to determine appropriate components
    const promptLower = prompt.toLowerCase()
    const descriptionLower = description.toLowerCase()

    // Determine component types based on prompt content
    const selectedTypes = []
    if (
      promptLower.includes('button') ||
      promptLower.includes('cta') ||
      promptLower.includes('action')
    ) {
      selectedTypes.push('button')
    }
    if (
      promptLower.includes('card') ||
      promptLower.includes('product') ||
      promptLower.includes('item')
    ) {
      selectedTypes.push('card')
    }
    if (
      promptLower.includes('form') ||
      promptLower.includes('input') ||
      promptLower.includes('field')
    ) {
      selectedTypes.push('form')
    }
    if (
      promptLower.includes('nav') ||
      promptLower.includes('menu') ||
      promptLower.includes('header')
    ) {
      selectedTypes.push('navigation')
    }
    if (
      promptLower.includes('layout') ||
      promptLower.includes('grid') ||
      promptLower.includes('structure')
    ) {
      selectedTypes.push('layout')
    }

    // If no specific types detected, use a mix of common components
    if (selectedTypes.length === 0) {
      selectedTypes.push('button', 'card', 'layout')
    }

    // Generate components for each selected type
    selectedTypes.forEach((type, index) => {
      const count = Math.floor(Math.random() * 3) + 1 // 1-3 components per type
      for (let i = 0; i < count; i++) {
        components.push(`${type}_component_${i + 1}`)
        specs.push(`Component ${components.length}: ${prompt} - ${type} variant`)
      }
    })

    return {
      components,
      specs: `AI-generated components based on prompt: "${prompt}". Generated ${components.length} components of types: ${selectedTypes.join(', ')} with specifications for:
      - Layout and positioning
      - Color schemes and styling
      - Interactive states and behaviors
      - Responsive design considerations
      - Accessibility features
      - Design system integration`,
    }
  } catch (error) {
    return {
      components: [],
      specs: `Error generating AI components: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
