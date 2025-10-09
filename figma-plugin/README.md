# P2 Sim Design Generator - Figma Plugin

A powerful Figma plugin that integrates with the P2 Sim workflow system to automatically generate designs based on prompts and specifications.

## 🚀 Features

- **AI-Powered Design Generation**: Create designs based on natural language prompts
- **Multiple Design Types**: Support for landing pages, components, wireframes, and generic designs
- **Brand Guidelines Integration**: Apply consistent brand styling across generated designs
- **Responsive Design**: Generate designs for multiple breakpoints (mobile, tablet, desktop)
- **Code Export**: Generate HTML, CSS, and React code alongside designs
- **Workflow Integration**: Seamlessly integrate with P2 Sim workflows
- **Export Options**: Export designs in PNG, JPG, SVG, and PDF formats

## 📋 Prerequisites

- Figma Desktop App (latest version)
- P2 Sim account with Figma integration enabled
- Figma API key (for workflow integration)

## 🛠 Installation

### Method 1: Development Installation

1. **Clone the plugin files**:
   ```bash
   git clone <repository-url>
   cd figma-plugin
   ```

2. **Open Figma Desktop App**

3. **Install the plugin**:
   - Go to `Plugins` → `Development` → `Import plugin from manifest...`
   - Select the `manifest.json` file from the plugin directory
   - The plugin will appear in your plugins list

### Method 2: Production Installation

1. **Package the plugin** (when available in Figma Community):
   - Search for "P2 Sim Design Generator" in Figma Community
   - Click "Install" to add to your plugins

## 🎯 Usage

### Basic Usage

1. **Open Figma** and create a new file or open an existing one
2. **Launch the plugin**:
   - Go to `Plugins` → `P2 Sim Design Generator`
   - Or use the keyboard shortcut (if configured)

3. **Configure your design**:
   - Enter a detailed design prompt
   - Select the design type (landing page, component, etc.)
   - Add brand guidelines (optional)
   - Choose responsive breakpoints
   - Select export format

4. **Generate the design**:
   - Click "Generate Design"
   - Wait for the AI to create your design
   - Review and iterate as needed

5. **Export your design**:
   - Click "Export" to save the design
   - Choose your preferred format
   - Download the generated files

### Workflow Integration

The plugin can be invoked directly from P2 Sim workflows:

1. **Add Figma Block** to your workflow
2. **Select "Invoke Plugin"** operation
3. **Configure parameters**:
   - Design prompt
   - Design type
   - Brand guidelines
   - Responsive breakpoints
   - Export format

4. **Run the workflow** - the plugin will be invoked automatically

## 🔧 Configuration

### Plugin Settings

The plugin supports various configuration options:

#### Design Types
- **Landing Page**: Complete landing page layouts with header, hero, features, and footer
- **Component**: Reusable UI components like cards, buttons, forms
- **Wireframe**: Low-fidelity wireframes for planning and prototyping
- **Generic Design**: Custom designs based on your specific requirements

#### Responsive Breakpoints
- **Mobile**: 375px width (iPhone standard)
- **Tablet**: 768px width (iPad standard)
- **Desktop**: 1200px width (desktop standard)

#### Export Formats
- **PNG**: High-quality raster images
- **JPG**: Compressed images for web
- **SVG**: Scalable vector graphics
- **PDF**: Print-ready documents

### Brand Guidelines

You can provide brand guidelines in the following formats:

```json
{
  "colors": ["#3b82f6", "#1f2937", "#6b7280"],
  "fonts": ["Inter", "system-ui", "sans-serif"],
  "spacing": ["8px", "16px", "24px", "32px"],
  "components": ["button", "card", "form"]
}
```

## 🏗 Architecture

### Plugin Structure

```
figma-plugin/
├── manifest.json          # Plugin configuration
├── code.js               # Main plugin logic
├── ui.html               # Plugin UI interface
└── README.md             # Documentation
```

### Key Components

1. **Plugin Code (`code.js`)**:
   - Handles Figma API interactions
   - Manages design generation logic
   - Processes user input and parameters
   - Handles export functionality

2. **UI Interface (`ui.html`)**:
   - User-friendly interface for configuration
   - Real-time feedback and status updates
   - Design history tracking
   - Export options

3. **Workflow Integration**:
   - REST API endpoints for workflow invocation
   - Parameter mapping and validation
   - Response formatting and error handling

## 🔌 API Integration

### Workflow Tool: `invoke_figma_plugin`

The plugin integrates with P2 Sim through a dedicated workflow tool:

```typescript
interface InvokeFigmaPluginParams {
  designPrompt: string
  designType: 'landing_page' | 'component' | 'wireframe' | 'generic'
  brandGuidelines?: string
  responsiveBreakpoints?: string[]
  figmaFileKey?: string
  teamId?: string
  projectId?: string
  exportFormat?: 'PNG' | 'JPG' | 'SVG' | 'PDF'
  includeCode?: boolean
  designSystem?: {
    colors?: string[]
    fonts?: string[]
    spacing?: string[]
    components?: string[]
  }
}
```

### Response Format

```typescript
interface InvokeFigmaPluginResponse {
  success: boolean
  output: {
    pluginInvocation: {
      status: 'success' | 'error' | 'pending'
      message: string
      pluginId: string
      figmaFileKey?: string
      generatedFrameId?: string
      elementCount?: number
    }
    designSpecifications: {
      type: string
      prompt: string
      brandGuidelines?: string
      responsiveBreakpoints: string[]
      timestamp: string
    }
    exportOptions?: {
      formats: string[]
      downloadUrls?: string[]
    }
    codeOutput?: {
      html?: string
      css?: string
      react?: string
      figmaSpecs?: string
    }
    nextSteps: string[]
    limitations: string[]
  }
}
```

## 🚨 Limitations

### Current Limitations

1. **Manual Plugin Installation**: Requires manual installation in Figma (no automatic deployment)
2. **API Restrictions**: Figma Plugin API has limitations compared to REST API
3. **Real-time Collaboration**: Requires Figma Professional plan for full collaboration features
4. **File Size Limits**: Large designs may hit Figma's file size limits
5. **Network Access**: Plugin requires network access for workflow integration

### Workarounds

1. **Batch Processing**: Process designs in smaller batches
2. **Optimization**: Use efficient design patterns to reduce file size
3. **Caching**: Cache frequently used design elements
4. **Error Handling**: Implement robust error handling and retry logic

## 🔧 Development

### Local Development

1. **Setup**:
   ```bash
   cd figma-plugin
   npm install  # if using build tools
   ```

2. **Development Mode**:
   - Make changes to `code.js` or `ui.html`
   - Reload the plugin in Figma
   - Test your changes

3. **Debugging**:
   - Use Figma's developer console
   - Check browser console for UI errors
   - Use `console.log()` for debugging

### Building for Production

1. **Minify Code**:
   ```bash
   # Minify JavaScript
   npx terser code.js -o code.min.js
   
   # Minify HTML
   npx html-minifier ui.html -o ui.min.html
   ```

2. **Update Manifest**:
   - Update file references to minified versions
   - Update version numbers
   - Test thoroughly

3. **Package for Distribution**:
   - Create a zip file with all plugin files
   - Submit to Figma Community (if desired)
   - Or distribute manually

## 📚 Examples

### Example 1: Landing Page Generation

```javascript
// Workflow configuration
{
  "designPrompt": "Create a modern landing page for a SaaS product with hero section, features, pricing, and footer",
  "designType": "landing_page",
  "brandGuidelines": "Blue and white color scheme, modern typography, clean design",
  "responsiveBreakpoints": ["mobile", "tablet", "desktop"],
  "exportFormat": "PNG",
  "includeCode": true
}
```

### Example 2: Component Generation

```javascript
// Workflow configuration
{
  "designPrompt": "Create a user profile card component with avatar, name, email, and action buttons",
  "designType": "component",
  "brandGuidelines": "Rounded corners, subtle shadows, primary blue color",
  "responsiveBreakpoints": ["mobile", "desktop"],
  "exportFormat": "SVG"
}
```

### Example 3: Wireframe Generation

```javascript
// Workflow configuration
{
  "designPrompt": "Create a wireframe for a dashboard with sidebar navigation, main content area, and data tables",
  "designType": "wireframe",
  "responsiveBreakpoints": ["tablet", "desktop"],
  "exportFormat": "PDF"
}
```

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Test thoroughly**
5. **Submit a pull request**

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check this README and inline comments
- **Issues**: Report bugs and feature requests via GitHub Issues
- **Community**: Join our Discord community for support
- **Email**: Contact support@p2sim.ai for enterprise support

## 🔄 Changelog

### Version 1.0.0
- Initial release
- Basic design generation
- Workflow integration
- Export functionality
- Responsive design support

---

**Made with ❤️ by the P2 Sim team**
