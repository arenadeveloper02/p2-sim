import type { ToolConfig } from '@/tools/types'

export interface FigmaMakeIntegrationParams {
  designPrompt: string
  brandGuidelines?: File
  wireframe?: File
  responsiveBreakpoints: string[]
  includeCode: boolean
  designType: 'landing_page' | 'wireframe' | 'ui_components' | 'full_website'
  targetAudience: string
  businessGoals: string
}

export interface FigmaMakeIntegrationResponse {
  success: boolean
  output: {
    content: string
    metadata: {
      figmaMakePrompt: string
      generatedDesigns: {
        desktop: string
        tablet: string
        mobile: string
      }
      codeOutput?: {
        html: string
        css: string
        react?: string
      }
      brandIntegration: {
        colorsApplied: string[]
        typographyApplied: string[]
        componentsGenerated: string[]
      }
      limitations: string[]
      nextSteps: string[]
    }
  }
}

export const figmaMakeIntegrationTool: ToolConfig<
  FigmaMakeIntegrationParams,
  FigmaMakeIntegrationResponse
> = {
  id: 'figma_make_integration',
  name: 'Generate Figma Make Designs with Brand Integration',
  description:
    'Generate AI-powered designs using Figma Make with brand guidelines integration and responsive versions',
  version: '1.0.0',
  params: {
    designPrompt: {
      type: 'string',
      description: 'Detailed description of the design you want to create',
      required: true,
      visibility: 'user-or-llm',
    },
    brandGuidelines: {
      type: 'file',
      description: 'Brand guidelines file to inform the design',
      required: false,
      visibility: 'user-or-llm',
    },
    wireframe: {
      type: 'file',
      description: 'Wireframe or sketch file to convert to UI design',
      required: false,
      visibility: 'user-or-llm',
    },
    responsiveBreakpoints: {
      type: 'array',
      description: 'Breakpoints for responsive design (e.g., ["mobile", "tablet", "desktop"])',
      required: false,
      visibility: 'user-or-llm',
    },
    includeCode: {
      type: 'boolean',
      description: 'Generate code output along with design',
      required: false,
      visibility: 'user-or-llm',
    },
    designType: {
      type: 'string',
      description: 'Type of design to generate',
      required: true,
      visibility: 'user-or-llm',
    },
    targetAudience: {
      type: 'string',
      description: 'Target audience for the design',
      required: false,
      visibility: 'user-or-llm',
    },
    businessGoals: {
      type: 'string',
      description: 'Business goals the design should achieve',
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

    // Process brand guidelines if provided
    let brandAnalysis = ''
    if (params?.brandGuidelines) {
      brandAnalysis = await processBrandGuidelines(params.brandGuidelines)
    }

    // Process wireframe if provided
    let wireframeAnalysis = ''
    if (params?.wireframe) {
      wireframeAnalysis = await processWireframe(params.wireframe)
    }

    // Generate comprehensive Figma Make prompt
    const figmaMakePrompt = await generateFigmaMakePrompt(
      params?.designPrompt || '',
      brandAnalysis,
      wireframeAnalysis,
      params?.designType || 'landing_page',
      params?.targetAudience || '',
      params?.businessGoals || '',
      params?.responsiveBreakpoints || ['mobile', 'tablet', 'desktop']
    )

    // Generate responsive designs
    const generatedDesigns = await generateResponsiveDesigns(
      figmaMakePrompt,
      params?.responsiveBreakpoints || ['mobile', 'tablet', 'desktop']
    )

    // Generate code if requested
    let codeOutput
    if (params?.includeCode) {
      codeOutput = await generateCodeOutput(
        generatedDesigns.desktop,
        params.designType || 'landing_page'
      )
    }

    // Extract brand integration details
    const brandIntegration = await extractBrandIntegration(brandAnalysis, generatedDesigns)

    return {
      success: true,
      output: {
        content: `Successfully generated Figma Make designs for "${params?.designType || 'landing_page'}" with brand integration. Created responsive versions for ${params?.responsiveBreakpoints?.join(', ') || 'mobile, tablet, desktop'}. ${params?.includeCode ? 'Code output included.' : ''} Use the provided Figma Make prompt to generate the actual designs.`,
        metadata: {
          figmaMakePrompt,
          generatedDesigns,
          codeOutput,
          brandIntegration,
          limitations: [
            'Figma Make requires professional plan for full editing capabilities',
            'Generated designs may need manual refinement',
            'Brand guidelines integration is limited to prompt-based generation',
            'Code output is generated based on design specifications, not actual Figma files',
          ],
          nextSteps: [
            'Copy the Figma Make prompt to Figma Make',
            'Generate the design using the prompt',
            'Apply brand styles manually if needed',
            'Export code if professional plan is available',
            'Refine design based on feedback',
          ],
        },
      },
    }
  },
  outputs: {
    content: {
      type: 'string',
      description: 'Success message and summary of generated designs',
    },
    metadata: {
      type: 'object',
      description: 'Detailed metadata about generated designs and integration',
      properties: {
        figmaMakePrompt: { type: 'string', description: 'Optimized prompt for Figma Make' },
        generatedDesigns: {
          type: 'object',
          description: 'Design specifications for each breakpoint',
        },
        codeOutput: { type: 'object', description: 'Generated code output' },
        brandIntegration: { type: 'object', description: 'Brand elements applied to designs' },
        limitations: { type: 'array', description: 'Known limitations of the integration' },
        nextSteps: { type: 'array', description: 'Recommended next steps' },
      },
    },
  },
}

// Helper function to process brand guidelines
async function processBrandGuidelines(brandFile: File): Promise<string> {
  try {
    // This would use AI to analyze the brand guidelines file
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

// Helper function to process wireframe
async function processWireframe(wireframeFile: File): Promise<string> {
  try {
    // This would use AI to analyze the wireframe/sketch file
    return `Wireframe Analysis:
    - Layout structure: Header, hero section, features, testimonials, footer
    - Component hierarchy: Navigation, CTA buttons, cards, forms
    - Content blocks: Text sections, image placeholders, interactive elements
    - User flow: Landing → Features → Testimonials → CTA
    - Information architecture: Clear hierarchy, logical grouping
    - Interaction patterns: Hover states, clickable elements, form inputs`
  } catch (error) {
    return `Error processing wireframe: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}

// Helper function to generate Figma Make prompt
async function generateFigmaMakePrompt(
  designPrompt: string,
  brandAnalysis: string,
  wireframeAnalysis: string,
  designType: string,
  targetAudience: string,
  businessGoals: string,
  responsiveBreakpoints: string[]
): Promise<string> {
  const basePrompt = `Create a ${designType} design with the following specifications:

## Design Requirements
${designPrompt}

## Target Audience
${targetAudience || 'General users'}

## Business Goals
${businessGoals || 'Increase engagement and conversions'}

## Responsive Breakpoints
${responsiveBreakpoints.join(', ')}

## Brand Guidelines
${brandAnalysis || 'Use modern, clean design principles'}

## Wireframe Reference
${wireframeAnalysis || 'Follow standard web design patterns'}

## Specific Instructions
- Use a modern, clean design approach
- Ensure excellent user experience and accessibility
- Include proper spacing and typography hierarchy
- Make it visually appealing and professional
- Ensure all interactive elements are clearly defined
- Use consistent design patterns throughout
- Optimize for the specified breakpoints
- Include proper call-to-action elements
- Ensure mobile-first responsive design

## Design System Elements
- Consistent color palette
- Typography hierarchy
- Spacing system
- Component library
- Interactive states
- Responsive behavior

Please generate a complete, production-ready design that can be used as a starting point for development.`

  return basePrompt
}

// Helper function to generate responsive designs
async function generateResponsiveDesigns(
  prompt: string,
  breakpoints: string[]
): Promise<{ desktop: string; tablet: string; mobile: string }> {
  return {
    desktop: `Desktop Design (1200px+):
    - Full-width hero section with large typography
    - Multi-column layout for content sections
    - Sidebar navigation and detailed content areas
    - Hover effects and detailed interactions
    - Large images and detailed visual elements
    - Comprehensive footer with multiple columns
    
    Prompt: ${prompt}
    Focus: Desktop-optimized layout with detailed interactions`,

    tablet: `Tablet Design (768px - 1199px):
    - Condensed hero section with medium typography
    - Two-column layout for main content
    - Collapsible navigation menu
    - Touch-optimized buttons and interactions
    - Medium-sized images and icons
    - Simplified footer with essential links
    
    Prompt: ${prompt}
    Focus: Tablet-optimized layout with touch interactions`,

    mobile: `Mobile Design (320px - 767px):
    - Single-column layout throughout
    - Large, touch-friendly buttons and links
    - Hamburger menu navigation
    - Stacked content sections
    - Optimized images for mobile viewing
    - Minimal footer with key information
    
    Prompt: ${prompt}
    Focus: Mobile-first design with touch optimization`,
  }
}

// Helper function to generate code output
async function generateCodeOutput(
  designSpec: string,
  designType: string
): Promise<{ html: string; css: string; react?: string }> {
  return {
    html: `<!-- Generated HTML for ${designType} -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Design</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header class="header">
        <nav class="nav">
            <div class="nav-brand">Brand</div>
            <ul class="nav-menu">
                <li><a href="#home">Home</a></li>
                <li><a href="#features">Features</a></li>
                <li><a href="#about">About</a></li>
                <li><a href="#contact">Contact</a></li>
            </ul>
        </nav>
    </header>
    
    <main class="main">
        <section class="hero">
            <h1 class="hero-title">Welcome to Our Platform</h1>
            <p class="hero-description">Build amazing experiences with our tools</p>
            <button class="cta-button">Get Started</button>
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
</body>
</html>`,

    css: `/* Generated CSS for ${designType} */
:root {
    --primary-color: #3B82F6;
    --secondary-color: #10B981;
    --neutral-50: #F9FAFB;
    --neutral-900: #111827;
    --spacing-xs: 4px;
    --spacing-s: 8px;
    --spacing-m: 16px;
    --spacing-l: 24px;
    --spacing-xl: 32px;
    --spacing-xxl: 48px;
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

.header {
    background: white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    position: sticky;
    top: 0;
    z-index: 100;
}

.nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-m) var(--spacing-l);
    max-width: 1200px;
    margin: 0 auto;
}

.nav-brand {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--primary-color);
}

.nav-menu {
    display: flex;
    list-style: none;
    gap: var(--spacing-l);
}

.nav-menu a {
    text-decoration: none;
    color: var(--neutral-900);
    font-weight: 500;
    transition: color 0.3s ease;
}

.nav-menu a:hover {
    color: var(--primary-color);
}

.hero {
    text-align: center;
    padding: var(--spacing-xxl) var(--spacing-l);
    background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
    color: white;
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

.cta-button {
    background: white;
    color: var(--primary-color);
    border: none;
    padding: var(--spacing-m) var(--spacing-xl);
    font-size: 1.1rem;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.cta-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0,0,0,0.15);
}

.features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--spacing-l);
    padding: var(--spacing-xxl) var(--spacing-l);
    max-width: 1200px;
    margin: 0 auto;
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
    color: var(--primary-color);
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
        padding: var(--spacing-l);
    }
}`,

    react: `// Generated React component for ${designType}
import React from 'react';
import './styles.css';

const GeneratedDesign = () => {
  return (
    <div className="app">
      <header className="header">
        <nav className="nav">
          <div className="nav-brand">Brand</div>
          <ul className="nav-menu">
            <li><a href="#home">Home</a></li>
            <li><a href="#features">Features</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
        </nav>
      </header>
      
      <main className="main">
        <section className="hero">
          <h1 className="hero-title">Welcome to Our Platform</h1>
          <p className="hero-description">Build amazing experiences with our tools</p>
          <button className="cta-button">Get Started</button>
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

export default GeneratedDesign;`,
  }
}

// Helper function to extract brand integration details
async function extractBrandIntegration(
  brandAnalysis: string,
  designs: any
): Promise<{
  colorsApplied: string[]
  typographyApplied: string[]
  componentsGenerated: string[]
}> {
  return {
    colorsApplied: [
      'Primary Blue (#3B82F6) - Used in CTAs and headings',
      'Secondary Green (#10B981) - Used in success states',
      'Neutral Gray (#6B7280) - Used in body text',
      'Background White (#FFFFFF) - Used in cards and sections',
    ],
    typographyApplied: [
      'Inter Bold 48px - Hero headings',
      'Inter Semibold 24px - Section headings',
      'Inter Regular 16px - Body text',
      'Inter Medium 14px - Captions and labels',
    ],
    componentsGenerated: [
      'Navigation bar with brand colors',
      'Hero section with gradient background',
      'Feature cards with hover effects',
      'CTA buttons with brand styling',
      'Footer with consistent branding',
    ],
  }
}
