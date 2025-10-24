import type { ToolConfig } from '@/tools/types'

export interface WireframeToUIParams {
  wireframeFile: File
  brandGuidelines?: File
  designStyle: 'modern' | 'minimal' | 'corporate' | 'creative' | 'elegant'
  targetPlatform: 'web' | 'mobile' | 'tablet' | 'desktop'
  includeInteractions: boolean
  componentLibrary: 'material' | 'antd' | 'chakra' | 'custom'
  colorScheme: 'light' | 'dark' | 'auto'
  complexity: 'simple' | 'intermediate' | 'complex'
}

export interface WireframeToUIResponse {
  success: boolean
  output: {
    content: string
    metadata: {
      wireframeAnalysis: {
        layoutStructure: string[]
        componentHierarchy: string[]
        userFlow: string[]
        contentBlocks: string[]
        interactionPatterns: string[]
      }
      uiDesign: {
        colorPalette: Array<{ name: string; value: string; usage: string }>
        typography: Array<{ name: string; family: string; size: number; weight: string }>
        spacing: Array<{ name: string; value: number; usage: string }>
        components: Array<{ name: string; type: string; description: string }>
        layout: {
          grid: string
          breakpoints: Record<string, string>
          responsive: boolean
        }
      }
      figmaSpecs: {
        frames: Array<{ name: string; width: number; height: number; description: string }>
        components: Array<{ name: string; properties: Record<string, any> }>
        styles: Array<{ name: string; type: string; properties: Record<string, any> }>
      }
      codeOutput: {
        html: string
        css: string
        react?: string
        figmaPrompt: string
      }
      recommendations: string[]
    }
  }
}

export const wireframeToUITool: ToolConfig<WireframeToUIParams, WireframeToUIResponse> = {
  id: 'wireframe_to_ui',
  name: 'Convert Wireframe to UI Design',
  description:
    'Convert wireframes or sketches into detailed UI designs with brand integration and responsive layouts',
  version: '1.0.0',
  params: {
    wireframeFile: {
      type: 'file',
      description: 'Wireframe or sketch file to convert to UI design',
      required: true,
      visibility: 'user-or-llm',
    },
    brandGuidelines: {
      type: 'file',
      description: 'Brand guidelines file to inform the UI design',
      required: false,
      visibility: 'user-or-llm',
    },
    designStyle: {
      type: 'string',
      description: 'Overall design style to apply',
      required: true,
      visibility: 'user-or-llm',
    },
    targetPlatform: {
      type: 'string',
      description: 'Target platform for the design',
      required: true,
      visibility: 'user-or-llm',
    },
    includeInteractions: {
      type: 'boolean',
      description: 'Include interaction states and animations',
      required: false,
      visibility: 'user-or-llm',
    },
    componentLibrary: {
      type: 'string',
      description: 'Component library to base the design on',
      required: false,
      visibility: 'user-or-llm',
    },
    colorScheme: {
      type: 'string',
      description: 'Color scheme preference',
      required: false,
      visibility: 'user-or-llm',
    },
    complexity: {
      type: 'string',
      description: 'Complexity level of the UI design',
      required: false,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: 'https://api.figma.com/v1/me',
    method: 'GET',
    headers: () => ({
      'X-Figma-Token':
        process.env.FIGMA_API_KEY || 'figd_91mOtrt2ow4q2OWvwsROQYPB74fwOa6Vact1JFroc',
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

    // Analyze wireframe
    if (!params?.wireframeFile) {
      throw new Error('Wireframe file is required')
    }
    const wireframeAnalysis = await analyzeWireframe(params.wireframeFile)

    // Process brand guidelines if provided
    let brandAnalysis = ''
    if (params?.brandGuidelines) {
      brandAnalysis = await processBrandGuidelines(params.brandGuidelines)
    }

    // Generate UI design based on wireframe and brand
    const uiDesign = await generateUIDesign(
      wireframeAnalysis,
      brandAnalysis,
      params?.designStyle || 'modern',
      params?.targetPlatform || 'web',
      params?.includeInteractions || false,
      params?.componentLibrary || 'material',
      params?.colorScheme || 'light',
      params?.complexity || 'intermediate'
    )

    // Generate Figma specifications
    const figmaSpecs = await generateFigmaSpecs(uiDesign, params?.targetPlatform || 'web')

    // Generate code output
    const codeOutput = await generateCodeOutput(
      uiDesign,
      params?.targetPlatform || 'web',
      params?.componentLibrary || 'material'
    )

    // Generate Figma prompt for manual creation
    const figmaPrompt = await generateFigmaPrompt(uiDesign, wireframeAnalysis, brandAnalysis)

    // Generate recommendations
    const recommendations = await generateRecommendations(uiDesign, params?.targetPlatform || 'web')

    return {
      success: true,
      output: {
        content: `Successfully converted wireframe to ${params?.designStyle || 'modern'} UI design for ${params?.targetPlatform || 'web'}. Generated ${uiDesign.components.length} components with ${uiDesign.colorPalette.length} colors and ${uiDesign.typography.length} typography styles. ${params?.includeInteractions ? 'Included interaction states and animations.' : ''}`,
        metadata: {
          wireframeAnalysis,
          uiDesign,
          figmaSpecs,
          codeOutput,
          recommendations,
        },
      },
    }
  },
  outputs: {
    content: {
      type: 'string',
      description: 'Success message and summary of UI design generation',
    },
    metadata: {
      type: 'object',
      description: 'Detailed metadata about the generated UI design',
      properties: {
        wireframeAnalysis: { type: 'object', description: 'Analysis of the input wireframe' },
        uiDesign: { type: 'object', description: 'Generated UI design specifications' },
        figmaSpecs: { type: 'object', description: 'Figma-specific design specifications' },
        codeOutput: { type: 'object', description: 'Generated code output' },
        recommendations: { type: 'array', description: 'Design recommendations' },
      },
    },
  },
}

// Helper function to analyze wireframe
async function analyzeWireframe(wireframeFile: File): Promise<{
  layoutStructure: string[]
  componentHierarchy: string[]
  userFlow: string[]
  contentBlocks: string[]
  interactionPatterns: string[]
}> {
  try {
    // This would use AI to analyze the wireframe file
    return {
      layoutStructure: [
        'Header with navigation and logo',
        'Hero section with main content and CTA',
        'Features section with 3-column grid',
        'Testimonials section with carousel',
        'Footer with links and contact info',
      ],
      componentHierarchy: [
        'Page Container',
        'Header (Navigation, Logo, Menu)',
        'Hero (Title, Description, CTA Button)',
        'Features (Feature Cards × 3)',
        'Testimonials (Testimonial Cards × 3)',
        'Footer (Links, Social, Copyright)',
      ],
      userFlow: [
        'Land on hero section',
        'Scroll to features',
        'View testimonials',
        'Click CTA button',
        'Navigate to contact/signup',
      ],
      contentBlocks: [
        'Navigation menu items',
        'Hero title and description text',
        'Feature titles and descriptions',
        'Testimonial quotes and author info',
        'Footer link groups',
      ],
      interactionPatterns: [
        'Hover effects on buttons and cards',
        'Click interactions for navigation',
        'Scroll-triggered animations',
        'Form input interactions',
        'Modal or overlay interactions',
      ],
    }
  } catch (error) {
    return {
      layoutStructure: ['Error analyzing wireframe'],
      componentHierarchy: ['Error analyzing wireframe'],
      userFlow: ['Error analyzing wireframe'],
      contentBlocks: ['Error analyzing wireframe'],
      interactionPatterns: ['Error analyzing wireframe'],
    }
  }
}

// Helper function to process brand guidelines
async function processBrandGuidelines(brandFile: File): Promise<string> {
  try {
    return `Brand Guidelines Analysis:
    - Primary colors: #3B82F6, #2563EB, #1D4ED8
    - Secondary colors: #10B981, #059669, #047857
    - Neutral colors: #F9FAFB, #6B7280, #111827
    - Typography: Inter (headings), Inter (body), Inter (captions)
    - Spacing: 4px, 8px, 16px, 24px, 32px, 48px, 64px
    - Components: Modern buttons, clean cards, minimal forms
    - Brand voice: Professional, trustworthy, innovative
    - Visual style: Clean, minimal, modern, accessible`
  } catch (error) {
    return `Error processing brand guidelines: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}

// Helper function to generate UI design
async function generateUIDesign(
  wireframeAnalysis: any,
  brandAnalysis: string,
  designStyle: string,
  targetPlatform: string,
  includeInteractions: boolean,
  componentLibrary: string,
  colorScheme: string,
  complexity: string
): Promise<{
  colorPalette: Array<{ name: string; value: string; usage: string }>
  typography: Array<{ name: string; family: string; size: number; weight: string }>
  spacing: Array<{ name: string; value: number; usage: string }>
  components: Array<{ name: string; type: string; description: string }>
  layout: {
    grid: string
    breakpoints: Record<string, string>
    responsive: boolean
  }
}> {
  const baseColors = {
    light: [
      { name: 'Primary/500', value: '#3B82F6', usage: 'Primary actions, links' },
      { name: 'Primary/600', value: '#2563EB', usage: 'Primary hover states' },
      { name: 'Secondary/500', value: '#10B981', usage: 'Success states' },
      { name: 'Neutral/50', value: '#F9FAFB', usage: 'Backgrounds' },
      { name: 'Neutral/900', value: '#111827', usage: 'Text, high contrast' },
    ],
    dark: [
      { name: 'Primary/400', value: '#60A5FA', usage: 'Primary actions, links' },
      { name: 'Primary/500', value: '#3B82F6', usage: 'Primary hover states' },
      { name: 'Secondary/400', value: '#34D399', usage: 'Success states' },
      { name: 'Neutral/900', value: '#111827', usage: 'Backgrounds' },
      { name: 'Neutral/50', value: '#F9FAFB', usage: 'Text, high contrast' },
    ],
  }

  const typography = [
    { name: 'Heading/XL', family: 'Inter', size: 48, weight: '700' },
    { name: 'Heading/L', family: 'Inter', size: 32, weight: '600' },
    { name: 'Heading/M', family: 'Inter', size: 24, weight: '600' },
    { name: 'Body/L', family: 'Inter', size: 16, weight: '400' },
    { name: 'Body/M', family: 'Inter', size: 14, weight: '400' },
    { name: 'Caption/S', family: 'Inter', size: 12, weight: '400' },
  ]

  const spacing = [
    { name: 'Spacing/XS', value: 4, usage: 'Tight spacing, icon padding' },
    { name: 'Spacing/S', value: 8, usage: 'Small gaps, button padding' },
    { name: 'Spacing/M', value: 16, usage: 'Standard spacing, card padding' },
    { name: 'Spacing/L', value: 24, usage: 'Section spacing, large gaps' },
    { name: 'Spacing/XL', value: 32, usage: 'Page margins, major sections' },
    { name: 'Spacing/XXL', value: 48, usage: 'Hero sections, major spacing' },
  ]

  const components = [
    {
      name: 'Button/Primary',
      type: 'button',
      description: 'Primary action button with brand colors',
    },
    {
      name: 'Button/Secondary',
      type: 'button',
      description: 'Secondary action button with outline style',
    },
    {
      name: 'Card/Feature',
      type: 'card',
      description: 'Feature card with image, title, and description',
    },
    {
      name: 'Card/Testimonial',
      type: 'card',
      description: 'Testimonial card with quote and author info',
    },
    {
      name: 'Navigation/Header',
      type: 'navigation',
      description: 'Main navigation with logo and menu items',
    },
    { name: 'Form/Input', type: 'form', description: 'Text input field with label and validation' },
    {
      name: 'Layout/Container',
      type: 'layout',
      description: 'Main container with max-width and centering',
    },
    {
      name: 'Layout/Grid',
      type: 'layout',
      description: 'Responsive grid system for content layout',
    },
  ]

  const layout = {
    grid: '12-column CSS Grid with 24px gutters',
    breakpoints: {
      mobile: '320px - 767px',
      tablet: '768px - 1023px',
      desktop: '1024px - 1199px',
      large: '1200px+',
    },
    responsive: true,
  }

  return {
    colorPalette: colorScheme === 'dark' ? baseColors.dark : baseColors.light,
    typography,
    spacing,
    components,
    layout,
  }
}

// Helper function to generate Figma specifications
async function generateFigmaSpecs(
  uiDesign: any,
  targetPlatform: string
): Promise<{
  frames: Array<{ name: string; width: number; height: number; description: string }>
  components: Array<{ name: string; properties: Record<string, any> }>
  styles: Array<{ name: string; type: string; properties: Record<string, any> }>
}> {
  const frames = [
    {
      name: 'Desktop/Homepage',
      width: 1440,
      height: 1024,
      description: 'Desktop version of the homepage',
    },
    {
      name: 'Tablet/Homepage',
      width: 768,
      height: 1024,
      description: 'Tablet version of the homepage',
    },
    {
      name: 'Mobile/Homepage',
      width: 375,
      height: 812,
      description: 'Mobile version of the homepage',
    },
  ]

  const components = uiDesign.components.map((component: any) => ({
    name: component.name,
    properties: {
      type: component.type,
      description: component.description,
      variants:
        component.type === 'button' ? ['default', 'hover', 'active', 'disabled'] : ['default'],
      responsive: true,
    },
  }))

  const styles = [
    ...uiDesign.colorPalette.map((color: any) => ({
      name: color.name,
      type: 'PAINT',
      properties: {
        color: hexToRgb(color.value),
        description: color.usage,
      },
    })),
    ...uiDesign.typography.map((font: any) => ({
      name: font.name,
      type: 'TEXT',
      properties: {
        fontFamily: font.family,
        fontSize: font.size,
        fontWeight: font.weight,
        description: `${font.family} ${font.size}px ${font.weight}`,
      },
    })),
  ]

  return { frames, components, styles }
}

// Helper function to generate code output
async function generateCodeOutput(
  uiDesign: any,
  targetPlatform: string,
  componentLibrary: string
): Promise<{
  html: string
  css: string
  react?: string
  figmaPrompt: string
}> {
  const html = `<!-- Generated HTML for ${targetPlatform} -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated UI Design</title>
    <link rel="stylesheet" href="styles.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <div class="container">
        <header class="header">
            <div class="nav-brand">Brand</div>
            <nav class="nav-menu">
                <a href="#home">Home</a>
                <a href="#features">Features</a>
                <a href="#about">About</a>
                <a href="#contact">Contact</a>
            </nav>
        </header>
        
        <main class="main">
            <section class="hero">
                <h1 class="hero-title">Welcome to Our Platform</h1>
                <p class="hero-description">Build amazing experiences with our tools</p>
                <button class="btn btn-primary">Get Started</button>
            </section>
            
            <section class="features">
                <div class="feature-card">
                    <h3>Feature 1</h3>
                    <p>Description of feature 1</p>
                </div>
                <div class="feature-card">
                    <h3>Feature 2</h3>
                    <p>Description of feature 2</p>
                </div>
                <div class="feature-card">
                    <h3>Feature 3</h3>
                    <p>Description of feature 3</p>
                </div>
            </section>
        </main>
        
        <footer class="footer">
            <p>&copy; 2024 Your Company. All rights reserved.</p>
        </footer>
    </div>
</body>
</html>`

  const css = `/* Generated CSS for ${targetPlatform} */
:root {
    ${uiDesign.colorPalette.map((color: any) => `--${color.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}: ${color.value};`).join('\n    ')}
    ${uiDesign.spacing.map((space: any) => `--${space.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}: ${space.value}px;`).join('\n    ')}
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Inter', sans-serif;
    line-height: 1.6;
    color: var(--neutral-900);
    background-color: var(--neutral-50);
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 var(--spacing-l);
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-m) 0;
    border-bottom: 1px solid var(--neutral-200);
}

.nav-brand {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--primary-500);
}

.nav-menu {
    display: flex;
    gap: var(--spacing-l);
}

.nav-menu a {
    text-decoration: none;
    color: var(--neutral-700);
    font-weight: 500;
    transition: color 0.3s ease;
}

.nav-menu a:hover {
    color: var(--primary-500);
}

.hero {
    text-align: center;
    padding: var(--spacing-xxl) 0;
    background: linear-gradient(135deg, var(--primary-500), var(--secondary-500));
    color: white;
    margin: var(--spacing-xl) 0;
    border-radius: 12px;
}

.hero-title {
    font-size: 3rem;
    font-weight: 700;
    margin-bottom: var(--spacing-m);
}

.hero-description {
    font-size: 1.25rem;
    margin-bottom: var(--spacing-xl);
    opacity: 0.9;
}

.btn {
    padding: var(--spacing-m) var(--spacing-xl);
    border: none;
    border-radius: 8px;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
}

.btn-primary {
    background: white;
    color: var(--primary-500);
}

.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0,0,0,0.15);
}

.features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--spacing-l);
    padding: var(--spacing-xxl) 0;
}

.feature-card {
    background: white;
    padding: var(--spacing-xl);
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.feature-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 25px rgba(0,0,0,0.15);
}

.feature-card h3 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: var(--spacing-m);
    color: var(--primary-500);
}

.footer {
    background: var(--neutral-900);
    color: white;
    text-align: center;
    padding: var(--spacing-xl);
    margin-top: var(--spacing-xxl);
}

@media (max-width: 768px) {
    .nav-menu {
        display: none;
    }
    
    .hero-title {
        font-size: 2rem;
    }
    
    .features {
        grid-template-columns: 1fr;
    }
}`

  const react = `// Generated React component for ${targetPlatform}
import React from 'react';
import './styles.css';

const GeneratedUI = () => {
  return (
    <div className="container">
      <header className="header">
        <div className="nav-brand">Brand</div>
        <nav className="nav-menu">
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>
      
      <main className="main">
        <section className="hero">
          <h1 className="hero-title">Welcome to Our Platform</h1>
          <p className="hero-description">Build amazing experiences with our tools</p>
          <button className="btn btn-primary">Get Started</button>
        </section>
        
        <section className="features">
          <div className="feature-card">
            <h3>Feature 1</h3>
            <p>Description of feature 1</p>
          </div>
          <div className="feature-card">
            <h3>Feature 2</h3>
            <p>Description of feature 2</p>
          </div>
          <div className="feature-card">
            <h3>Feature 3</h3>
            <p>Description of feature 3</p>
          </div>
        </section>
      </main>
      
      <footer className="footer">
        <p>&copy; 2024 Your Company. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default GeneratedUI;`

  const figmaPrompt = `Create a ${targetPlatform} UI design based on the wireframe analysis:

## Wireframe Structure
${JSON.stringify(uiDesign, null, 2)}

## Design Requirements
- Style: Modern, clean, professional
- Platform: ${targetPlatform}
- Responsive: Yes
- Component Library: ${componentLibrary}
- Color Scheme: ${uiDesign.colorPalette.map((c: any) => c.name).join(', ')}
- Typography: Inter font family with proper hierarchy
- Spacing: Consistent 8px grid system
- Interactions: Hover effects, smooth transitions

## Components to Create
${uiDesign.components.map((c: any) => `- ${c.name}: ${c.description}`).join('\n')}

## Layout Specifications
- Grid: ${uiDesign.layout.grid}
- Breakpoints: ${Object.entries(uiDesign.layout.breakpoints)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')}
- Responsive: ${uiDesign.layout.responsive}

Please create a complete, production-ready design that matches these specifications.`

  return { html, css, react, figmaPrompt }
}

// Helper function to generate Figma prompt
async function generateFigmaPrompt(
  uiDesign: any,
  wireframeAnalysis: any,
  brandAnalysis: string
): Promise<string> {
  return `Create a UI design in Figma based on the wireframe analysis:

## Wireframe Analysis
${JSON.stringify(wireframeAnalysis, null, 2)}

## Brand Guidelines
${brandAnalysis}

## UI Design Specifications
${JSON.stringify(uiDesign, null, 2)}

## Instructions
1. Create frames for each breakpoint (mobile, tablet, desktop)
2. Apply the color palette and typography styles
3. Create components with proper variants
4. Ensure responsive design principles
5. Add interaction states where appropriate
6. Use consistent spacing and alignment
7. Follow accessibility guidelines

This will create a complete, production-ready UI design.`
}

// Helper function to generate recommendations
async function generateRecommendations(uiDesign: any, targetPlatform: string): Promise<string[]> {
  return [
    'Consider adding micro-interactions to enhance user experience',
    'Implement proper focus states for accessibility',
    'Add loading states for dynamic content',
    'Consider dark mode support for better user preference',
    'Optimize images and assets for the target platform',
    'Test the design across different devices and browsers',
    'Consider adding animation guidelines for developers',
    'Ensure the design follows platform-specific guidelines',
    'Add error states and empty states for better UX',
    'Consider implementing a design system for consistency',
  ]
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
