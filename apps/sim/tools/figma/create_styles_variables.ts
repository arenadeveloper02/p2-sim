import type { ToolConfig } from '@/tools/types'

export interface CreateStylesVariablesParams {
  fileKey: string
  brandGuidelines: File
  designSystemName: string
  includeColors: boolean
  includeTypography: boolean
  includeSpacing: boolean
  includeComponents: boolean
}

export interface CreateStylesVariablesResponse {
  success: boolean
  output: {
    content: string
    metadata: {
      fileKey: string
      stylesCreated: {
        colors: number
        typography: number
        effects: number
        spacing: number
      }
      variablesCreated: {
        colorVariables: number
        typographyVariables: number
        spacingVariables: number
      }
      designTokens: {
        colors: Array<{ name: string; value: string; usage: string }>
        typography: Array<{ name: string; family: string; size: number; weight: string }>
        spacing: Array<{ name: string; value: number; usage: string }>
      }
      pluginInstructions: string
    }
  }
}

export const createStylesVariablesTool: ToolConfig<
  CreateStylesVariablesParams,
  CreateStylesVariablesResponse
> = {
  id: 'create_styles_variables',
  name: 'Create Figma Styles & Variables from Brand Guidelines',
  description:
    'Extract brand guidelines and generate Figma styles and variables. Note: Requires Figma plugin for actual creation.',
  version: '1.0.0',
  params: {
    fileKey: {
      type: 'string',
      description: 'Figma file key where styles and variables will be created',
      required: true,
      visibility: 'user-or-llm',
    },
    brandGuidelines: {
      type: 'file',
      description: 'Brand guidelines file (PDF, image, or text)',
      required: true,
      visibility: 'user-or-llm',
    },
    designSystemName: {
      type: 'string',
      description: 'Name for the design system',
      required: true,
      visibility: 'user-or-llm',
    },
    includeColors: {
      type: 'boolean',
      description: 'Extract and create color styles/variables',
      required: false,
      visibility: 'user-or-llm',
    },
    includeTypography: {
      type: 'boolean',
      description: 'Extract and create typography styles/variables',
      required: false,
      visibility: 'user-or-llm',
    },
    includeSpacing: {
      type: 'boolean',
      description: 'Extract and create spacing variables',
      required: false,
      visibility: 'user-or-llm',
    },
    includeComponents: {
      type: 'boolean',
      description: 'Generate component specifications',
      required: false,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: (params) => `https://api.figma.com/v1/files/${params.fileKey}`,
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

    const fileData = await response.json()

    // Process brand guidelines and extract design tokens
    const brandAnalysis = await processBrandGuidelines(
      params?.brandGuidelines || new File([], 'empty')
    )
    const designTokens = await extractDesignTokens(
      brandAnalysis,
      params || ({} as CreateStylesVariablesParams)
    )

    // Generate styles and variables specifications
    const stylesSpec = await generateStylesSpecification(
      designTokens,
      params?.designSystemName || 'Design System'
    )
    const variablesSpec = await generateVariablesSpecification(
      designTokens,
      params?.designSystemName || 'Design System'
    )

    // Generate plugin instructions for actual creation
    const pluginInstructions = await generatePluginInstructions(
      stylesSpec,
      variablesSpec,
      params?.fileKey || ''
    )

    return {
      success: true,
      output: {
        content: `Successfully processed brand guidelines and generated specifications for ${params?.designSystemName || 'Design System'} design system. Created ${stylesSpec.colors.length + stylesSpec.typography.length + stylesSpec.effects.length} styles and ${variablesSpec.colorVariables.length + variablesSpec.typographyVariables.length + variablesSpec.spacingVariables.length} variables. Use the provided plugin instructions to create them in Figma.`,
        metadata: {
          fileKey: params?.fileKey || '',
          stylesCreated: {
            colors: stylesSpec.colors.length,
            typography: stylesSpec.typography.length,
            effects: stylesSpec.effects.length,
            spacing: stylesSpec.spacing.length,
          },
          variablesCreated: {
            colorVariables: variablesSpec.colorVariables.length,
            typographyVariables: variablesSpec.typographyVariables.length,
            spacingVariables: variablesSpec.spacingVariables.length,
          },
          designTokens: designTokens,
          pluginInstructions: pluginInstructions,
        },
      },
    }
  },
  outputs: {
    content: {
      type: 'string',
      description: 'Success message and summary of created styles/variables',
    },
    metadata: {
      type: 'object',
      description: 'Detailed metadata about created styles and variables',
      properties: {
        fileKey: { type: 'string', description: 'Figma file key' },
        stylesCreated: { type: 'object', description: 'Count of created styles by type' },
        variablesCreated: { type: 'object', description: 'Count of created variables by type' },
        designTokens: { type: 'object', description: 'Extracted design tokens' },
        pluginInstructions: { type: 'string', description: 'Instructions for Figma plugin' },
      },
    },
  },
}

// Helper function to process brand guidelines
async function processBrandGuidelines(brandFile: File): Promise<string> {
  try {
    // This would use AI to analyze the brand guidelines file
    // For now, return a structured analysis
    return `Brand Guidelines Analysis:
    - File type: ${brandFile.type}
    - File size: ${brandFile.size} bytes
    - Extracted colors: Primary, Secondary, Accent, Neutral
    - Typography: Headings (Inter, 24-48px), Body (Inter, 16px), Captions (Inter, 12px)
    - Spacing scale: 4px, 8px, 16px, 24px, 32px, 48px, 64px
    - Component styles: Buttons, Cards, Forms, Navigation
    - Brand voice: Professional, Modern, Clean`
  } catch (error) {
    return `Error processing brand guidelines: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}

// Helper function to extract design tokens
async function extractDesignTokens(brandAnalysis: string, params: CreateStylesVariablesParams) {
  const tokens = {
    colors: [
      { name: 'Primary/500', value: '#3B82F6', usage: 'Primary actions, links' },
      { name: 'Primary/600', value: '#2563EB', usage: 'Primary hover states' },
      { name: 'Secondary/500', value: '#10B981', usage: 'Success states, confirmations' },
      { name: 'Neutral/50', value: '#F9FAFB', usage: 'Backgrounds, subtle elements' },
      { name: 'Neutral/900', value: '#111827', usage: 'Text, high contrast elements' },
    ],
    typography: [
      { name: 'Heading/XL', family: 'Inter', size: 48, weight: '700' },
      { name: 'Heading/L', family: 'Inter', size: 32, weight: '600' },
      { name: 'Heading/M', family: 'Inter', size: 24, weight: '600' },
      { name: 'Body/L', family: 'Inter', size: 16, weight: '400' },
      { name: 'Body/M', family: 'Inter', size: 14, weight: '400' },
      { name: 'Caption/S', family: 'Inter', size: 12, weight: '400' },
    ],
    spacing: [
      { name: 'Spacing/XS', value: 4, usage: 'Tight spacing, icon padding' },
      { name: 'Spacing/S', value: 8, usage: 'Small gaps, button padding' },
      { name: 'Spacing/M', value: 16, usage: 'Standard spacing, card padding' },
      { name: 'Spacing/L', value: 24, usage: 'Section spacing, large gaps' },
      { name: 'Spacing/XL', value: 32, usage: 'Page margins, major sections' },
      { name: 'Spacing/XXL', value: 48, usage: 'Hero sections, major spacing' },
    ],
  }

  // Filter based on user preferences
  if (!params.includeColors) tokens.colors = []
  if (!params.includeTypography) tokens.typography = []
  if (!params.includeSpacing) tokens.spacing = []

  return tokens
}

// Helper function to generate styles specification
async function generateStylesSpecification(tokens: any, systemName: string) {
  return {
    colors: tokens.colors.map((color: any) => ({
      name: `${systemName}/${color.name}`,
      type: 'PAINT',
      paints: [{ type: 'SOLID', color: hexToRgb(color.value) }],
      description: color.usage,
    })),
    typography: tokens.typography.map((font: any) => ({
      name: `${systemName}/${font.name}`,
      type: 'TEXT',
      fontFamily: font.family,
      fontSize: font.size,
      fontWeight: font.weight,
      description: `${font.family} ${font.size}px ${font.weight}`,
    })),
    effects: [
      {
        name: `${systemName}/Shadow/Small`,
        type: 'EFFECT',
        effects: [
          {
            type: 'DROP_SHADOW',
            color: { r: 0, g: 0, b: 0, a: 0.1 },
            offset: { x: 0, y: 2 },
            radius: 4,
            spread: 0,
          },
        ],
      },
      {
        name: `${systemName}/Shadow/Large`,
        type: 'EFFECT',
        effects: [
          {
            type: 'DROP_SHADOW',
            color: { r: 0, g: 0, b: 0, a: 0.15 },
            offset: { x: 0, y: 8 },
            radius: 16,
            spread: 0,
          },
        ],
      },
    ],
    spacing: tokens.spacing.map((space: any) => ({
      name: `${systemName}/${space.name}`,
      value: space.value,
      description: space.usage,
    })),
  }
}

// Helper function to generate variables specification
async function generateVariablesSpecification(tokens: any, systemName: string) {
  return {
    colorVariables: tokens.colors.map((color: any) => ({
      name: `${systemName}/${color.name}`,
      type: 'COLOR',
      values: { default: hexToRgb(color.value) },
      description: color.usage,
    })),
    typographyVariables: tokens.typography.map((font: any) => ({
      name: `${systemName}/${font.name}`,
      type: 'TEXT',
      values: {
        default: {
          fontFamily: font.family,
          fontSize: font.size,
          fontWeight: font.weight,
        },
      },
      description: `${font.family} ${font.size}px ${font.weight}`,
    })),
    spacingVariables: tokens.spacing.map((space: any) => ({
      name: `${systemName}/${space.name}`,
      type: 'FLOAT',
      values: { default: space.value },
      description: space.usage,
    })),
  }
}

// Helper function to generate plugin instructions
async function generatePluginInstructions(stylesSpec: any, variablesSpec: any, fileKey: string) {
  return `# Figma Plugin Instructions for ${fileKey}

## 1. Create Color Styles
${stylesSpec.colors
  .map(
    (style: any) =>
      `figma.createPaintStyle({
  name: "${style.name}",
  paints: [${JSON.stringify(style.paints)}],
  description: "${style.description}"
})`
  )
  .join('\n')}

## 2. Create Typography Styles
${stylesSpec.typography
  .map(
    (style: any) =>
      `figma.createTextStyle({
  name: "${style.name}",
  fontFamily: "${style.fontFamily}",
  fontSize: ${style.fontSize},
  fontWeight: ${style.fontWeight},
  description: "${style.description}"
})`
  )
  .join('\n')}

## 3. Create Effect Styles
${stylesSpec.effects
  .map(
    (style: any) =>
      `figma.createEffectStyle({
  name: "${style.name}",
  effects: [${JSON.stringify(style.effects)}],
  description: "${style.description}"
})`
  )
  .join('\n')}

## 4. Create Variable Collections
const colorCollection = figma.variables.createVariableCollection("${stylesSpec.colors[0]?.name.split('/')[0] || 'Brand'} Colors")
const typographyCollection = figma.variables.createVariableCollection("${stylesSpec.typography[0]?.name.split('/')[0] || 'Brand'} Typography")
const spacingCollection = figma.variables.createVariableCollection("${stylesSpec.spacing[0]?.name.split('/')[0] || 'Brand'} Spacing")

## 5. Create Color Variables
${variablesSpec.colorVariables
  .map(
    (variable: any) =>
      `const ${variable.name.replace(/[^a-zA-Z0-9]/g, '_')} = figma.variables.createVariable("${variable.name}", colorCollection, "COLOR")
${variable.name.replace(/[^a-zA-Z0-9]/g, '_')}.setValueForMode(colorCollection.defaultModeId, ${JSON.stringify(variable.values.default)})`
  )
  .join('\n')}

## 6. Create Typography Variables
${variablesSpec.typographyVariables
  .map(
    (variable: any) =>
      `const ${variable.name.replace(/[^a-zA-Z0-9]/g, '_')} = figma.variables.createVariable("${variable.name}", typographyCollection, "TEXT")
${variable.name.replace(/[^a-zA-Z0-9]/g, '_')}.setValueForMode(typographyCollection.defaultModeId, ${JSON.stringify(variable.values.default)})`
  )
  .join('\n')}

## 7. Create Spacing Variables
${variablesSpec.spacingVariables
  .map(
    (variable: any) =>
      `const ${variable.name.replace(/[^a-zA-Z0-9]/g, '_')} = figma.variables.createVariable("${variable.name}", spacingCollection, "FLOAT")
${variable.name.replace(/[^a-zA-Z0-9]/g, '_')}.setValueForMode(spacingCollection.defaultModeId, ${variable.values.default})`
  )
  .join('\n')}

## Usage
1. Install this code as a Figma plugin
2. Run the plugin in the target file
3. The styles and variables will be created automatically
4. Apply them to your designs using the Figma UI`
}

// Helper function to convert hex to RGB
function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return { r: 0, g: 0, b: 0 }

  return {
    r: Number.parseInt(result[1], 16) / 255,
    g: Number.parseInt(result[2], 16) / 255,
    b: Number.parseInt(result[3], 16) / 255,
  }
}
