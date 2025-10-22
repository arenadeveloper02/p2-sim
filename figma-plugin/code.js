// Figma Plugin: Arena Design
// Plain JavaScript ES5 - No libraries or ES6 features

var pollingInterval = null;
var currentSettings = {
  apiUrl: '',
  pollInterval: 60,
  isPolling: false
};

// Internal JSON storage for designs
var designsDatabase = [
  {
    id: 'design-shophub-complete',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>ShopHub - Complete Test</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background-color: #ffffff;
            padding: 0px;
            font-family: 'Inter', sans-serif;
        }
        
        header {
            background-color: #ffffff;
            padding: 20px 60px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .logo {
            font-size: 28px;
            font-weight: 700;
            color: #6366f1;
        }
        
        nav {
            display: flex;
            gap: 32px;
            align-items: center;
        }
        
        .nav-link {
            font-size: 16px;
            color: #333;
            font-weight: 500;
            text-decoration: none;
        }
        
        .header-buttons {
            display: flex;
            gap: 16px;
        }
        
        .btn-secondary {
            padding: 10px 24px;
            background-color: #ffffff;
            color: #6366f1;
            border: 2px solid #6366f1;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
        }
        
        .btn-primary {
            padding: 10px 24px;
            background-color: #6366f1;
            color: #ffffff;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
        }
        
        .hero {
            background-color: #f8f9ff;
            padding: 80px 60px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 60px;
        }
        
        .hero-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }
        
        .hero-title {
            font-size: 56px;
            font-weight: 700;
            color: #1a1a1a;
            line-height: 1.2;
        }
        
        .hero-description {
            font-size: 20px;
            color: #666;
            line-height: 1.6;
        }
        
        .hero-buttons {
            display: flex;
            gap: 16px;
        }
        
        .btn-large {
            padding: 16px 32px;
            font-size: 18px;
            border-radius: 8px;
            font-weight: 600;
        }
        
        .hero-image {
            flex: 1;
            background-color: #e0e7ff;
            height: 400px;
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            color: #6366f1;
        }
        
        .features {
            padding: 80px 60px;
            background-color: #ffffff;
        }
        
        .section-title {
            font-size: 42px;
            font-weight: 700;
            text-align: center;
            margin-bottom: 16px;
            color: #1a1a1a;
        }
        
        .section-subtitle {
            font-size: 18px;
            color: #666;
            text-align: center;
            margin-bottom: 60px;
        }
        
        .features-grid {
            display: flex;
            gap: 32px;
            justify-content: space-between;
        }
        
        .feature-card {
            flex: 1;
            background-color: #f9fafb;
            padding: 40px 32px;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        
        .feature-title {
            font-size: 22px;
            font-weight: 600;
            color: #1a1a1a;
        }
        
        .feature-description {
            font-size: 16px;
            color: #666;
            line-height: 1.6;
        }
        
        .products {
            padding: 80px 60px;
            background-color: #f8f9ff;
        }
        
        .products-grid {
            display: flex;
            gap: 32px;
            justify-content: space-between;
        }
        
        .product-card {
            flex: 1;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        
        .product-image {
            height: 200px;
            background-color: #e0e7ff;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #6366f1;
        }
        
        .product-info {
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .product-name {
            font-size: 20px;
            font-weight: 600;
            color: #1a1a1a;
        }
        
        .product-price {
            font-size: 24px;
            font-weight: 700;
            color: #1a1a1a;
        }
        
        .product-button {
            margin-top: 8px;
            padding: 12px 24px;
            background-color: #6366f1;
            color: #ffffff;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
        }
        
        .cta-section {
            padding: 80px 60px;
            background-color: #6366f1;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: 24px;
        }
        
        .cta-title {
            font-size: 42px;
            font-weight: 700;
            color: #ffffff;
        }
        
        .cta-description {
            font-size: 20px;
            color: #e0e7ff;
            max-width: 600px;
        }
        
        .cta-button {
            padding: 16px 48px;
            background-color: #ffffff;
            color: #6366f1;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
        }
        
        footer {
            background-color: #1a1a1a;
            padding: 60px 60px 32px 60px;
            color: #ffffff;
        }
        
        .footer-content {
            display: flex;
            justify-content: space-between;
            gap: 60px;
            margin-bottom: 40px;
        }
        
        .footer-column {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        
        .footer-logo {
            font-size: 24px;
            font-weight: 700;
            color: #6366f1;
        }
        
        .footer-description {
            font-size: 14px;
            color: #999;
            line-height: 1.6;
        }
        
        .footer-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .footer-link {
            font-size: 14px;
            color: #999;
        }
        
        .footer-bottom {
            padding-top: 32px;
            border-top: 1px solid #333;
            text-align: center;
            color: #999;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <header>
        <div class="logo">ShopHub</div>
        <nav>
            <div class="nav-link">Home</div>
            <div class="nav-link">Products</div>
            <div class="nav-link">Categories</div>
            <div class="nav-link">About</div>
            <div class="nav-link">Contact</div>
        </nav>
        <div class="header-buttons">
            <button class="btn-secondary">Sign In</button>
            <button class="btn-primary">Sign Up</button>
        </div>
    </header>
    
    <section class="hero">
        <div class="hero-content">
            <h1 class="hero-title">Discover Amazing Products You'll Love</h1>
            <p class="hero-description">Shop the latest trends from top brands with fast shipping and secure checkout. Your perfect purchase is just a click away.</p>
            <div class="hero-buttons">
                <button class="btn-primary btn-large">Shop Now</button>
                <button class="btn-secondary btn-large">Learn More</button>
            </div>
        </div>
        <div class="hero-image">Hero Image Placeholder</div>
    </section>
    
    <section class="features">
        <h2 class="section-title">Why Shop With Us</h2>
        <p class="section-subtitle">We provide the best shopping experience with unmatched quality and service</p>
        <div class="features-grid">
            <div class="feature-card">
                <h3 class="feature-title">Free Shipping</h3>
                <p class="feature-description">Enjoy free shipping on all orders over $50. Fast and reliable delivery to your doorstep.</p>
            </div>
            <div class="feature-card">
                <h3 class="feature-title">Secure Payment</h3>
                <p class="feature-description">Your transactions are protected with industry-leading security and encryption.</p>
            </div>
            <div class="feature-card">
                <h3 class="feature-title">Premium Quality</h3>
                <p class="feature-description">All products are carefully selected and verified for quality and authenticity.</p>
            </div>
            <div class="feature-card">
                <h3 class="feature-title">Easy Returns</h3>
                <p class="feature-description">Not satisfied? Return any item within 30 days for a full refund, no questions asked.</p>
            </div>
        </div>
    </section>
    
    <section class="products">
        <h2 class="section-title">Featured Products</h2>
        <p class="section-subtitle">Check out our handpicked selection of trending products</p>
        <div class="products-grid">
            <div class="product-card">
                <div class="product-image">Product 1</div>
                <div class="product-info">
                    <h3 class="product-name">Wireless Headphones Pro</h3>
                    <div class="product-price">$149.99</div>
                    <button class="product-button">Add to Cart</button>
                </div>
            </div>
            <div class="product-card">
                <div class="product-image">Product 2</div>
                <div class="product-info">
                    <h3 class="product-name">Premium Leather Jacket</h3>
                    <div class="product-price">$299.99</div>
                    <button class="product-button">Add to Cart</button>
                </div>
            </div>
            <div class="product-card">
                <div class="product-image">Product 3</div>
                <div class="product-info">
                    <h3 class="product-name">Smart Coffee Maker</h3>
                    <div class="product-price">$89.99</div>
                    <button class="product-button">Add to Cart</button>
                </div>
            </div>
        </div>
    </section>
    
    <section class="cta-section">
        <h2 class="cta-title">Ready to Start Shopping?</h2>
        <p class="cta-description">Join thousands of happy customers and discover amazing deals on products you love. Sign up today and get 20% off your first order!</p>
        <button class="cta-button">Sign Up Now</button>
    </section>
    
    <footer>
        <div class="footer-content">
            <div class="footer-column">
                <div class="footer-logo">ShopHub</div>
                <p class="footer-description">Your ultimate destination for quality products and exceptional shopping experience.</p>
            </div>
            <div class="footer-column">
                <h4 class="footer-title">Shop</h4>
                <div class="footer-link">All Products</div>
                <div class="footer-link">Categories</div>
                <div class="footer-link">Deals</div>
            </div>
            <div class="footer-column">
                <h4 class="footer-title">Support</h4>
                <div class="footer-link">FAQs</div>
                <div class="footer-link">Shipping Info</div>
                <div class="footer-link">Returns</div>
            </div>
            <div class="footer-column">
                <h4 class="footer-title">Company</h4>
                <div class="footer-link">About Us</div>
                <div class="footer-link">Careers</div>
                <div class="footer-link">Contact Us</div>
            </div>
        </div>
        <div class="footer-bottom">© 2024 ShopHub. All rights reserved.</div>
    </footer>
</body>
</html>`,
    css: `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    background-color: #ffffff;
    padding: 0px;
    font-family: 'Inter', sans-serif;
}

header {
    background-color: #ffffff;
    padding: 20px 60px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.logo {
    font-size: 28px;
    font-weight: 700;
    color: #6366f1;
}

nav {
    display: flex;
    gap: 32px;
    align-items: center;
}

.nav-link {
    font-size: 16px;
    color: #333;
    font-weight: 500;
    text-decoration: none;
}

.header-buttons {
    display: flex;
    gap: 16px;
}

.btn-secondary {
    padding: 10px 24px;
    background-color: #ffffff;
    color: #6366f1;
    border: 2px solid #6366f1;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
}

.btn-primary {
    padding: 10px 24px;
    background-color: #6366f1;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
}

.hero {
    background-color: #f8f9ff;
    padding: 80px 60px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 60px;
}

.hero-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.hero-title {
    font-size: 56px;
    font-weight: 700;
    color: #1a1a1a;
    line-height: 1.2;
}

.hero-description {
    font-size: 20px;
    color: #666;
    line-height: 1.6;
}

.hero-buttons {
    display: flex;
    gap: 16px;
}

.btn-large {
    padding: 16px 32px;
    font-size: 18px;
    border-radius: 8px;
    font-weight: 600;
}

.hero-image {
    flex: 1;
    background-color: #e0e7ff;
    height: 400px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    color: #6366f1;
}

.features {
    padding: 80px 60px;
    background-color: #ffffff;
}

.section-title {
    font-size: 42px;
    font-weight: 700;
    text-align: center;
    margin-bottom: 16px;
    color: #1a1a1a;
}

.section-subtitle {
    font-size: 18px;
    color: #666;
    text-align: center;
    margin-bottom: 60px;
}

.features-grid {
    display: flex;
    gap: 32px;
    justify-content: space-between;
}

.feature-card {
    flex: 1;
    background-color: #f9fafb;
    padding: 40px 32px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.feature-title {
    font-size: 22px;
    font-weight: 600;
    color: #1a1a1a;
}

.feature-description {
    font-size: 16px;
    color: #666;
    line-height: 1.6;
}

.products {
    padding: 80px 60px;
    background-color: #f8f9ff;
}

.products-grid {
    display: flex;
    gap: 32px;
    justify-content: space-between;
}

.product-card {
    flex: 1;
    background-color: #ffffff;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.product-image {
    height: 200px;
    background-color: #e0e7ff;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6366f1;
}

.product-info {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.product-name {
    font-size: 20px;
    font-weight: 600;
    color: #1a1a1a;
}

.product-price {
    font-size: 24px;
    font-weight: 700;
    color: #1a1a1a;
}

.product-button {
    margin-top: 8px;
    padding: 12px 24px;
    background-color: #6366f1;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
}

.cta-section {
    padding: 80px 60px;
    background-color: #6366f1;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 24px;
}

.cta-title {
    font-size: 42px;
    font-weight: 700;
    color: #ffffff;
}

.cta-description {
    font-size: 20px;
    color: #e0e7ff;
    max-width: 600px;
}

.cta-button {
    padding: 16px 48px;
    background-color: #ffffff;
    color: #6366f1;
    border: none;
    border-radius: 8px;
    font-size: 18px;
    font-weight: 600;
    cursor: pointer;
}

footer {
    background-color: #1a1a1a;
    padding: 60px 60px 32px 60px;
    color: #ffffff;
}

.footer-content {
    display: flex;
    justify-content: space-between;
    gap: 60px;
    margin-bottom: 40px;
}

.footer-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.footer-logo {
    font-size: 24px;
    font-weight: 700;
    color: #6366f1;
}

.footer-description {
    font-size: 14px;
    color: #999;
    line-height: 1.6;
}

.footer-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 8px;
}

.footer-link {
    font-size: 14px;
    color: #999;
}

.footer-bottom {
    padding-top: 32px;
    border-top: 1px solid #333;
    text-align: center;
    color: #999;
    font-size: 14px;
}`,
    fileKey: "",
    projectId: "",
    status: "NEW"
  }
];

// Show UI
figma.showUI(__html__, { width: 450, height: 480 });

// Load saved settings
function loadSettings() {
  figma.clientStorage.getAsync('pollInterval').then(function(pollInterval) {
    var interval = pollInterval || 60;
    
    currentSettings.pollInterval = interval;
    
    // Count NEW and COMPLETED designs
    var newCount = 0;
    var completedCount = 0;
    for (var i = 0; i < designsDatabase.length; i++) {
      if (designsDatabase[i].status === 'NEW') {
        newCount++;
      } else if (designsDatabase[i].status === 'COMPLETED') {
        completedCount++;
      }
    }
    
    figma.ui.postMessage({
      type: 'settings-loaded',
      pollInterval: interval,
      isPolling: false,
      newCount: newCount,
      completedCount: completedCount,
      totalCount: designsDatabase.length
    });
  });
}

// Start polling
function startPolling(pollInterval) {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  
  currentSettings.isPolling = true;
  currentSettings.pollInterval = pollInterval;
  figma.clientStorage.setAsync('pollInterval', pollInterval);
  
  // Immediate first call
  pollDesigns();
  
  // Set up interval
  pollingInterval = setInterval(function() {
    pollDesigns();
  }, pollInterval * 1000);
  
  figma.ui.postMessage({ type: 'polling-started' });
}

// Stop polling
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  
  currentSettings.isPolling = false;
  figma.ui.postMessage({ type: 'polling-stopped' });
}

// Poll designs from internal storage
function pollDesigns() {
  figma.ui.postMessage({ 
    type: 'update-status', 
    status: 'polling',
    message: 'Checking for new designs...'
  });
  
  try {
    var currentFileKey = figma.fileKey;
    
    // Filter for NEW status items that match current file (or have no specific fileKey)
    var newItems = [];
    var skippedItems = 0;
    
    for (var i = 0; i < designsDatabase.length; i++) {
      if (designsDatabase[i].status === 'NEW') {
        // Process if fileKey matches current file, is empty, or is a placeholder
        // if (!designsDatabase[i].fileKey || 
        //     designsDatabase[i].fileKey === currentFileKey) {
          newItems.push(designsDatabase[i]);
        // } else {
        //   skippedItems++;
        // }
      }
    }
    
    if (newItems.length === 0) {
      var message = 'No new designs for this file';
      if (skippedItems > 0) {
        message = 'No designs for this file (' + skippedItems + ' for other files)';
      }
      figma.ui.postMessage({ 
        type: 'update-status', 
        status: 'success',
        message: message
      });
      return;
    }
    
    // Process all NEW items for this file
    var processed = 0;
    for (var i = 0; i < newItems.length; i++) {
      var item = newItems[i];
      processDesignData(item);
      processed++;
    }
    
    var message = 'Processed ' + processed + ' design(s)';
    if (skippedItems > 0) {
      message += ' (' + skippedItems + ' pending for other files)';
    }
    
    figma.ui.postMessage({ 
      type: 'update-status', 
      status: 'success',
      message: message
    });
  } catch (error) {
    console.error('Polling error:', error);
    figma.ui.postMessage({ 
      type: 'update-status', 
      status: 'error',
      message: 'Error: ' + (error.message || 'Unknown error')
    });
  }
}

// Process design data
function processDesignData(data) {
  var html = data.html;
  var css = data.css;
  var fileKey = data.fileKey;
  var projectId = data.projectId;
  var id = data.id;
  
  // Parse CSS into style objects
  var styles = parseCSS(css);
  
  // Parse HTML and create Figma nodes
  var rootNode = parseHTML(html, styles);
  
  // Create a container frame for the design
  var containerFrame = figma.createFrame();
  containerFrame.name = 'Design - ' + new Date().toLocaleString();
  if (id) {
    containerFrame.name = 'Design (ID: ' + id + ')';
  }
  
  // Position in viewport
  containerFrame.x = figma.viewport.center.x - 400;
  containerFrame.y = figma.viewport.center.y - 300;
  
  // Set initial size (will auto-resize based on content)
  containerFrame.resize(1200, 800);
  containerFrame.clipsContent = false;
  
  // Configure auto-layout
  containerFrame.layoutMode = 'VERTICAL';
  containerFrame.primaryAxisSizingMode = 'AUTO';
  containerFrame.counterAxisSizingMode = 'AUTO';
  containerFrame.paddingLeft = 0;
  containerFrame.paddingRight = 0;
  containerFrame.paddingTop = 0;
  containerFrame.paddingBottom = 0;
  containerFrame.itemSpacing = 0;
  containerFrame.fills = []; // Transparent container
  
  // Add the root node to the container
  if (rootNode) {
    containerFrame.appendChild(rootNode);
  }
  
  // Select and focus the new design
  figma.currentPage.selection = [containerFrame];
  figma.viewport.scrollAndZoomIntoView([containerFrame]);
  
  figma.notify('✓ Design created successfully!');
  
  // Update status to COMPLETED
  if (id) {
    updateDesignStatus(id, 'COMPLETED');
  }
}

// Update design status to COMPLETED in internal storage
function updateDesignStatus(designId, status) {
  // Find and update the design in internal storage
  for (var i = 0; i < designsDatabase.length; i++) {
    if (designsDatabase[i].id === designId) {
      designsDatabase[i].status = status;
      console.log('Status updated to ' + status + ' for design ID: ' + designId);
      
      // Notify UI of database update
      figma.ui.postMessage({
        type: 'database-updated',
        design: designsDatabase[i]
      });
      
      return;
    }
  }
  console.error('Design not found: ' + designId);
}

// Parse CSS string into style objects
function parseCSS(cssString) {
  var styleMap = {};
  
  console.log('=== PARSING CSS ===');
  console.log('CSS String length:', cssString.length);
  
  // Enhanced CSS parser - handles comments and complex selectors
  var cleanCSS = cssString.replace(/\/\*[\s\S]*?\*\//g, ''); // Remove comments
  var ruleRegex = /([^{]+)\{([^}]+)\}/g;
  var match;
  
  while ((match = ruleRegex.exec(cleanCSS)) !== null) {
    var selector = match[1].replace(/^\s+|\s+$/g, '');
    var declarations = match[2].replace(/^\s+|\s+$/g, '');
    
    console.log('Found CSS rule for selector:', selector);
    
    var styles = {};
    var declarationRegex = /([^:]+):([^;]+);?/g;
    var declMatch;
    
    while ((declMatch = declarationRegex.exec(declarations)) !== null) {
      var property = declMatch[1].replace(/^\s+|\s+$/g, '');
      var value = declMatch[2].replace(/^\s+|\s+$/g, '');
      styles[property] = value;
      
      if (property === 'display' || property === 'flex-direction') {
        console.log('  -> Flex property:', property, '=', value);
      }
    }
    
    // Handle multiple selectors (comma-separated)
    var selectors = selector.split(',');
    for (var i = 0; i < selectors.length; i++) {
      var cleanSelector = selectors[i].replace(/^\s+|\s+$/g, '');
      styleMap[cleanSelector] = styles;
    }
  }
  
  console.log('=== CSS PARSING COMPLETE ===');
  console.log('Total rules parsed:', Object.keys(styleMap).length);
  
  return styleMap;
}

// Parse HTML and create Figma nodes
function parseHTML(htmlString, styles) {
  // Create a simple DOM-like structure
  var doc = parseDOMFromString(htmlString);
  
  // Create root frame
  var rootFrame = figma.createFrame();
  rootFrame.name = 'Design Root';
  rootFrame.layoutMode = 'VERTICAL';
  rootFrame.primaryAxisSizingMode = 'AUTO';
  rootFrame.counterAxisSizingMode = 'AUTO';
  rootFrame.itemSpacing = 0; // No spacing at root level
  rootFrame.fills = []; // Transparent background
  
  // Apply body styles if they exist
  var bodyStyles = styles['body'] || {};
  if (bodyStyles['background-color'] || bodyStyles['background']) {
    var bgColor = parseColor(bodyStyles['background-color'] || bodyStyles['background']);
    if (bgColor) {
      rootFrame.fills = [{ type: 'SOLID', color: bgColor }];
    }
  }
  
  // Process body or first element
  var bodyElement = doc.body;
  if (bodyElement && bodyElement.children) {
    // Process all top-level children separately
    for (var i = 0; i < bodyElement.children.length; i++) {
      processElement(bodyElement.children[i], rootFrame, styles);
    }
  }
  
  return rootFrame;
}

// Process DOM element and create Figma nodes
function processElement(element, parent, styles) {
  var tagName = element.tagName.toLowerCase();
  
  console.log('=== PROCESSING ELEMENT ===');
  console.log('Tag:', tagName, 'Class:', element.className, 'ID:', element.id);
  
  // Get applicable styles
  var elementStyles = getApplicableStyles(element, styles);
  
  // Handle different HTML elements
  // Container elements: div, section, article, main, header, footer, nav
  if (tagName === 'div' || tagName === 'section' || tagName === 'article' || 
      tagName === 'main' || tagName === 'header' || tagName === 'footer' || 
      tagName === 'nav' || tagName === 'aside') {
    var frame = figma.createFrame();
    
    // Set better name based on class or tag
    if (element.className) {
      var className = element.className.split(' ')[0];
      frame.name = className.toUpperCase();
    } else {
      frame.name = tagName.toUpperCase();
    }
    
    // Apply styles first to get layout mode
    applyStylesToFrame(frame, elementStyles);
    
    // Process children
    var children = element.children;
    var hasChildren = children.length > 0;
    
    for (var i = 0; i < children.length; i++) {
      processElement(children[i], frame, styles);
    }
    
    // Add text content only if no children and text is meaningful
    if (!hasChildren && element.textContent) {
      var trimmedText = element.textContent.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
      // Only create text if it's not just a placeholder or class name
      var isPlaceholder = trimmedText.indexOf('class=') > -1 || 
                         trimmedText.indexOf('<div') > -1 ||
                         trimmedText.indexOf('<') > -1;
      
      if (trimmedText && trimmedText.length > 0 && !isPlaceholder) {
        var text = figma.createText();
        figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
          text.characters = trimmedText;
          text.fontSize = 14;
          applyStylesToText(text, elementStyles);
        });
        frame.appendChild(text);
      }
    }
    
    // Handle elements that should have text content but are being processed as containers
    // This is a fallback for elements that should display text
    if (hasChildren && element.textContent) {
      var trimmedText = element.textContent.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
      var isPlaceholder = trimmedText.indexOf('class=') > -1 || 
                         trimmedText.indexOf('<div') > -1 ||
                         trimmedText.indexOf('<') > -1;
      
      // If this element has meaningful text content and no meaningful children, create text
      if (trimmedText && trimmedText.length > 0 && !isPlaceholder && children.length === 0) {
        var text = figma.createText();
        figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
          text.characters = trimmedText;
          text.fontSize = 14;
          applyStylesToText(text, elementStyles);
        });
        frame.appendChild(text);
      }
    }
    
    parent.appendChild(frame);
    
  } else if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || tagName === 'h4' || tagName === 'h5' || tagName === 'h6') {
    var text = figma.createText();
    text.name = tagName.toUpperCase();
    
    var trimmedText = element.textContent ? element.textContent.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ') : '';
    
    // Skip if contains HTML tags
    if (trimmedText && trimmedText.indexOf('<') === -1 && trimmedText.length > 0) {
      // Load font before setting characters
      figma.loadFontAsync({ family: "Inter", style: "Bold" }).then(function() {
        text.fontName = { family: "Inter", style: "Bold" };
        text.characters = trimmedText;
        
        // Set size based on heading level
        var sizes = {
          'h1': 32, 'h2': 28, 'h3': 24, 'h4': 20, 'h5': 18, 'h6': 16
        };
        text.fontSize = sizes[tagName] || 16;
        
        applyStylesToText(text, elementStyles);
      });
      
      parent.appendChild(text);
    }
    
  } else if (tagName === 'p' || tagName === 'span' || tagName === 'a') {
    var text = figma.createText();
    text.name = tagName.toUpperCase();
    
    var trimmedText = element.textContent ? element.textContent.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ') : '';
    
    // Skip if contains HTML tags or is placeholder text
    if (trimmedText && trimmedText.indexOf('<') === -1 && trimmedText.length > 0) {
      figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
        text.fontName = { family: "Inter", style: "Regular" };
        text.characters = trimmedText;
        text.fontSize = 14;
        
        applyStylesToText(text, elementStyles);
      });
      
      parent.appendChild(text);
    }
    
  } else if (tagName === 'div' && element.textContent && !element.children.length) {
    // Handle div elements that contain only text (no children)
    var text = figma.createText();
    text.name = 'TEXT';
    
    var trimmedText = element.textContent.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
    
    // Skip if contains HTML tags or is placeholder text
    if (trimmedText && trimmedText.indexOf('<') === -1 && trimmedText.length > 0) {
      figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
        text.fontName = { family: "Inter", style: "Regular" };
        text.characters = trimmedText;
        text.fontSize = 14;
        
        applyStylesToText(text, elementStyles);
      });
      
      parent.appendChild(text);
    }
    
  } else if (tagName === 'div' && element.textContent && element.children.length === 0) {
    // Handle div elements that should display text content
    var trimmedText = element.textContent.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
    
    if (trimmedText && trimmedText.indexOf('<') === -1 && trimmedText.length > 0) {
      var text = figma.createText();
      text.name = 'TEXT';
      
      figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
        text.fontName = { family: "Inter", style: "Regular" };
        text.characters = trimmedText;
        text.fontSize = 14;
        
        applyStylesToText(text, elementStyles);
      });
      
      parent.appendChild(text);
    }
    
  } else if (tagName === 'button') {
    var button = figma.createFrame();
    button.name = 'BUTTON';
    button.cornerRadius = 6;
    button.paddingLeft = 16;
    button.paddingRight = 16;
    button.paddingTop = 10;
    button.paddingBottom = 10;
    
    // Button should HUG contents, not fill width
    button.layoutMode = 'HORIZONTAL';
    button.primaryAxisSizingMode = 'AUTO'; // Hug width
    button.counterAxisSizingMode = 'AUTO'; // Hug height
    button.primaryAxisAlignItems = 'CENTER';
    button.counterAxisAlignItems = 'CENTER';
    
    // Default button styling
    button.fills = [{ type: 'SOLID', color: { r: 0.09, g: 0.63, b: 0.98 } }];
    
    var text = figma.createText();
    var btnText = element.textContent ? element.textContent.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ') : 'Button';
    
    // Skip if contains HTML tags
    if (btnText && btnText.indexOf('<') === -1 && btnText.length > 0) {
      figma.loadFontAsync({ family: "Inter", style: "Medium" }).then(function() {
        text.fontName = { family: "Inter", style: "Medium" };
        text.characters = btnText;
        text.fontSize = 14;
        text.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      });
      
      button.appendChild(text);
    }
    
    // Apply custom styles from CSS (will override defaults if present)
    applyStylesToFrame(button, elementStyles);
    
    // Apply text styles after frame styles to ensure proper text color
    if (text && elementStyles['color']) {
      var textColor = parseColor(elementStyles['color']);
      if (textColor) {
        text.fills = [{ type: 'SOLID', color: textColor }];
      }
    }
    
    parent.appendChild(button);
    
  } else {
    // For other elements, process children
    var children = element.children;
    for (var i = 0; i < children.length; i++) {
      processElement(children[i], parent, styles);
    }
  }
}

// Get applicable styles for an element
function getApplicableStyles(element, styles) {
  var applicableStyles = {};
  
  console.log('Getting styles for element:', element.tagName, 'class:', element.className);
  
  // Tag selector
  var tagStyles = styles[element.tagName.toLowerCase()];
  if (tagStyles) {
    console.log('  -> Found tag styles for', element.tagName);
    mergeStyles(applicableStyles, tagStyles);
  }
  
  // Class selector - handle multiple classes with proper precedence
  if (element.className) {
    var classes = element.className.split(' ').filter(function(cls) { return cls.trim().length > 0; });
    for (var i = 0; i < classes.length; i++) {
      var className = classes[i].trim();
      if (className) {
        var classStyles = styles['.' + className];
        if (classStyles) {
          console.log('  -> Found class styles for', className);
          mergeStyles(applicableStyles, classStyles);
        }
      }
    }
  }
  
  // ID selector (highest precedence)
  if (element.id) {
    var idStyles = styles['#' + element.id];
    if (idStyles) {
      console.log('  -> Found ID styles for', element.id);
      mergeStyles(applicableStyles, idStyles);
    }
  }
  
  console.log('Final applicable styles:', applicableStyles);
  return applicableStyles;
}

// Helper function to merge styles with proper precedence
function mergeStyles(target, source) {
  for (var prop in source) {
    if (source.hasOwnProperty(prop)) {
      target[prop] = source[prop];
      if (prop === 'display' || prop === 'flex-direction') {
        console.log('    -> Applied:', prop, '=', source[prop]);
      }
    }
  }
}

// Apply CSS styles to Figma frame
function applyStylesToFrame(frame, styles) {
  // DEBUG: Log styles being applied
  console.log('Applying styles to frame:', frame.name, 'display:', styles['display'], 'flex-direction:', styles['flex-direction']);
  
  // Background color
  if (styles['background-color'] || styles['background']) {
    var color = parseColor(styles['background-color'] || styles['background']);
    if (color) {
      frame.fills = [{ type: 'SOLID', color: color }];
    }
  }
  
  // Display flex - Enable auto-layout (DO THIS FIRST before sizing)
  var hasFlexLayout = styles['display'] === 'flex';
  var hasExplicitSize = false;
  
  if (hasFlexLayout) {
    var direction = styles['flex-direction'] || 'row';
    console.log('  -> Setting layout mode:', direction === 'column' ? 'VERTICAL' : 'HORIZONTAL');
    frame.layoutMode = direction === 'column' ? 'VERTICAL' : 'HORIZONTAL';
    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'AUTO';
    frame.clipsContent = false;
    
    // Set alignment properties
    var alignItems = styles['align-items'];
    if (alignItems) {
      if (alignItems === 'center') {
        frame.counterAxisAlignItems = 'CENTER';
      } else if (alignItems === 'flex-start') {
        frame.counterAxisAlignItems = 'MIN';
      } else if (alignItems === 'flex-end') {
        frame.counterAxisAlignItems = 'MAX';
      }
    }
    
    var justifyContent = styles['justify-content'];
    if (justifyContent) {
      if (justifyContent === 'center') {
        frame.primaryAxisAlignItems = 'CENTER';
      } else if (justifyContent === 'flex-start') {
        frame.primaryAxisAlignItems = 'MIN';
      } else if (justifyContent === 'flex-end') {
        frame.primaryAxisAlignItems = 'MAX';
      } else if (justifyContent === 'space-between') {
        frame.primaryAxisAlignItems = 'SPACE_BETWEEN';
      }
    }
    
    try {
      frame.layoutWrap = 'NO_WRAP';
    } catch (e) {
      // Property may not exist in all versions
    }
  } else {
    // Default to vertical layout for non-flex containers
    frame.layoutMode = 'VERTICAL';
    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'AUTO';
    frame.clipsContent = false;
    
    // For elements that should be inline or have specific display properties
    if (styles['display'] === 'inline' || styles['display'] === 'inline-block') {
      frame.layoutMode = 'HORIZONTAL';
      frame.primaryAxisSizingMode = 'AUTO';
      frame.counterAxisSizingMode = 'AUTO';
    }
  }
  
  // Padding (apply before sizing)
  if (styles['padding']) {
    var padding = parseSize(styles['padding']) || 0;
    frame.paddingLeft = padding;
    frame.paddingRight = padding;
    frame.paddingTop = padding;
    frame.paddingBottom = padding;
  }
  
  var paddingProps = ['padding-left', 'padding-right', 'padding-top', 'padding-bottom'];
  for (var i = 0; i < paddingProps.length; i++) {
    var prop = paddingProps[i];
    if (styles[prop]) {
      var padding = parseSize(styles[prop]) || 0;
      
      if (prop === 'padding-left') frame.paddingLeft = padding;
      if (prop === 'padding-right') frame.paddingRight = padding;
      if (prop === 'padding-top') frame.paddingTop = padding;
      if (prop === 'padding-bottom') frame.paddingBottom = padding;
    }
  }
  
  // Border radius
  if (styles['border-radius']) {
    var radius = parseSize(styles['border-radius']) || 0;
    frame.cornerRadius = radius;
  }
  
  // Border handling
  if (styles['border']) {
    var borderWidth = parseSize(styles['border']) || 1;
    var borderColor = parseColor(styles['border-color']) || { r: 0, g: 0, b: 0 };
    frame.strokes = [{ type: 'SOLID', color: borderColor }];
    frame.strokeWeight = borderWidth;
  }
  
  if (styles['border-width']) {
    var borderWidth = parseSize(styles['border-width']) || 1;
    frame.strokeWeight = borderWidth;
  }
  
  if (styles['border-color']) {
    var borderColor = parseColor(styles['border-color']);
    if (borderColor) {
      frame.strokes = [{ type: 'SOLID', color: borderColor }];
    }
  }
  
  // Width and Height - apply after layout mode is set
  if (styles['width']) {
    var width = parseSize(styles['width']);
    if (width && width > 0 && width < 10000) {
      if (frame.layoutMode === 'HORIZONTAL') {
        // For horizontal layouts, set counter axis sizing
        frame.counterAxisSizingMode = 'FIXED';
      } else {
        frame.primaryAxisSizingMode = 'FIXED';
      }
      try {
        frame.resize(width, frame.height);
        hasExplicitSize = true;
      } catch (e) {
        console.log('  -> Could not set width:', e);
      }
    }
  }
  
  if (styles['height']) {
    var height = parseSize(styles['height']);
    if (height && height > 0 && height < 10000) {
      if (frame.layoutMode === 'VERTICAL') {
        frame.primaryAxisSizingMode = 'FIXED';
      } else {
        frame.counterAxisSizingMode = 'FIXED';
      }
      try {
        var currentWidth = frame.width;
        frame.resize(currentWidth, height);
        hasExplicitSize = true;
      } catch (e) {
        console.log('  -> Could not set height:', e);
      }
    }
  }
  
  // Gap
  if (styles['gap']) {
    var gap = parseSize(styles['gap']) || 0;
    frame.itemSpacing = gap;
  } else if (frame.layoutMode) {
    frame.itemSpacing = 0;
  }
  
  // Margin handling (using padding as approximation since Figma doesn't have margins)
  if (styles['margin']) {
    var margin = parseSize(styles['margin']) || 0;
    frame.paddingLeft += margin;
    frame.paddingRight += margin;
    frame.paddingTop += margin;
    frame.paddingBottom += margin;
  }
  
  var marginProps = ['margin-left', 'margin-right', 'margin-top', 'margin-bottom'];
  for (var i = 0; i < marginProps.length; i++) {
    var prop = marginProps[i];
    if (styles[prop]) {
      var margin = parseSize(styles[prop]) || 0;
      
      if (prop === 'margin-left') frame.paddingLeft += margin;
      if (prop === 'margin-right') frame.paddingRight += margin;
      if (prop === 'margin-top') frame.paddingTop += margin;
      if (prop === 'margin-bottom') frame.paddingBottom += margin;
    }
  }
  
  // Children sizing constraints
  frame.layoutGrow = 0; // Don't grow to fill parent by default
}

// Apply CSS styles to Figma text
function applyStylesToText(text, styles) {
  // Color
  if (styles['color']) {
    var color = parseColor(styles['color']);
    if (color) {
      text.fills = [{ type: 'SOLID', color: color }];
    }
  }
  
  // Font size
  if (styles['font-size']) {
    var fontSize = parseSize(styles['font-size']);
    if (fontSize) text.fontSize = fontSize;
  }
  
  // Font weight
  if (styles['font-weight']) {
    var weight = styles['font-weight'];
    var style = weight === 'bold' || parseInt(weight) >= 600 ? 'Bold' : 'Regular';
    figma.loadFontAsync({ family: "Inter", style: style }).then(function() {
      text.fontName = { family: "Inter", style: style };
    });
  }
  
  // Text align
  if (styles['text-align']) {
    var align = styles['text-align'].toUpperCase();
    if (align === 'LEFT' || align === 'CENTER' || align === 'RIGHT') {
      text.textAlignHorizontal = align;
    }
  }
  
  // Line height
  if (styles['line-height']) {
    var lineHeight = parseSize(styles['line-height']);
    if (lineHeight) {
      text.lineHeight = { unit: 'PIXELS', value: lineHeight };
    }
  }
  
  // Text decoration
  if (styles['text-decoration']) {
    var decoration = styles['text-decoration'];
    if (decoration === 'underline') {
      text.textDecoration = 'UNDERLINE';
    } else if (decoration === 'line-through') {
      text.textDecoration = 'STRIKETHROUGH';
    }
  }
}

// Parse color string to RGB
function parseColor(colorString) {
  if (!colorString) return null;
  
  // Clean the color string
  var cleanColor = colorString.trim().toLowerCase();
  
  // Hex color
  if (cleanColor.charAt(0) === '#') {
    var hex = cleanColor.slice(1);
    if (hex.length === 3) {
      var r = parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255;
      var g = parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255;
      var b = parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255;
      return { r: r, g: g, b: b };
    } else if (hex.length === 6) {
      var r = parseInt(hex.slice(0, 2), 16) / 255;
      var g = parseInt(hex.slice(2, 4), 16) / 255;
      var b = parseInt(hex.slice(4, 6), 16) / 255;
      return { r: r, g: g, b: b };
    }
  }
  
  // RGB/RGBA color
  if (cleanColor.indexOf('rgb') === 0) {
    var match = cleanColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return {
        r: parseInt(match[1]) / 255,
        g: parseInt(match[2]) / 255,
        b: parseInt(match[3]) / 255
      };
    }
  }
  
  // Extended named colors
  var namedColors = {
    'black': { r: 0, g: 0, b: 0 },
    'white': { r: 1, g: 1, b: 1 },
    'red': { r: 1, g: 0, b: 0 },
    'green': { r: 0, g: 1, b: 0 },
    'blue': { r: 0, g: 0, b: 1 },
    'gray': { r: 0.5, g: 0.5, b: 0.5 },
    'grey': { r: 0.5, g: 0.5, b: 0.5 },
    'transparent': null
  };
  
  return namedColors[cleanColor] || null;
}

// Parse size string to number (px)
function parseSize(sizeString) {
  if (!sizeString) return null;
  
  var match = sizeString.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
  if (match) {
    var value = parseFloat(match[1]);
    var unit = match[2] || 'px';
    
    // Convert to px
    if (unit === 'rem' || unit === 'em') {
      return value * 16; // Assuming 16px base
    }
    return value;
  }
  
  return null;
}

// Enhanced DOM parser implementation
function parseDOMFromString(html) {
  var body = createHTMLElement('body');
  parseChildren(html, body);
  return { body: body };
}

function parseChildren(html, parent) {
  // Enhanced regex to handle self-closing tags and nested structures better
  var tagRegex = /<(\w+)([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/\1>)/g;
  var lastIndex = 0;
  var match;
  
  while ((match = tagRegex.exec(html)) !== null) {
    // Add text before tag (only if it's actual content, not whitespace)
    var textBefore = html.slice(lastIndex, match.index);
    // Clean up whitespace but preserve meaningful text
    textBefore = textBefore.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    if (textBefore && textBefore.length > 0 && !isOnlyWhitespace(textBefore)) {
      parent.addTextContent(textBefore);
    }
    
    var tagName = match[1];
    var attributes = match[2];
    var innerHTML = match[3] || '';
    
    var element = createHTMLElement(tagName);
    parseAttributes(attributes, element);
    
    if (innerHTML && innerHTML.trim().length > 0) {
      // Recursively parse inner HTML
      parseChildren(innerHTML, element);
    }
    
    parent.appendChild(element);
    lastIndex = tagRegex.lastIndex;
  }
  
  // Add remaining text (only if meaningful)
  var textAfter = html.slice(lastIndex);
  textAfter = textAfter.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  if (textAfter && textAfter.length > 0 && !isOnlyWhitespace(textAfter)) {
    parent.addTextContent(textAfter);
  }
}

// Helper function to check if text is only whitespace
function isOnlyWhitespace(text) {
  return /^\s*$/.test(text);
}

function parseAttributes(attrString, element) {
  var attrRegex = /(\w+)=["']([^"']*)["']/g;
  var match;
  
  while ((match = attrRegex.exec(attrString)) !== null) {
    var name = match[1];
    var value = match[2];
    
    if (name === 'class') {
      element.className = value;
    } else if (name === 'id') {
      element.id = value;
    }
  }
}

function createHTMLElement(tagName) {
  return {
    tagName: tagName,
    children: [],
    textContent: '',
    className: '',
    id: '',
    appendChild: function(child) {
      this.children.push(child);
    },
    addTextContent: function(text) {
      this.textContent += text;
    }
  };
}

// Handle messages from UI
figma.ui.onmessage = function(msg) {
  if (msg.type === 'load-settings') {
    loadSettings();
  } else if (msg.type === 'start-polling') {
    startPolling(msg.pollInterval);
  } else if (msg.type === 'stop-polling') {
    stopPolling();
  } else if (msg.type === 'create-design-now') {
    // Create design immediately with provided HTML/CSS
    try {
      var designData = {
        id: 'manual-' + Date.now(),
        html: msg.html || '',
        css: msg.css || '',
        fileKey: figma.fileKey || '',
        projectId: '',
        status: 'NEW'
      };
      
      processDesignData(designData);
      
      figma.ui.postMessage({
        type: 'design-created',
        design: designData
      });
    } catch (error) {
      console.error('Error creating design:', error);
      figma.ui.postMessage({
        type: 'design-error',
        error: error.message || 'Unknown error'
      });
    }
  } else if (msg.type === 'add-design') {
    // Add new design to database
    var newDesign = {
      id: msg.design.id || 'design-' + Date.now(),
      html: msg.design.html,
      css: msg.design.css,
      fileKey: msg.design.fileKey || '',
      projectId: msg.design.projectId || '',
      status: 'NEW'
    };
    designsDatabase.push(newDesign);
    figma.ui.postMessage({
      type: 'design-added',
      design: newDesign
    });
  } else if (msg.type === 'get-database') {
    figma.ui.postMessage({
      type: 'database-list',
      designs: designsDatabase
    });
  }
};

// Load settings on startup
loadSettings();

// Note: Auto-start polling is disabled. Uncomment below to enable:
// startPolling(60);
