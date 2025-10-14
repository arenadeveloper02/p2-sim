/**
 * Test script for Figma Design Poller Plugin
 * 
 * This script simulates the plugin behavior and tests the core functionality
 */

// Mock Figma API for testing
const mockFigma = {
  showUI: (html, options) => {
    console.log('Mock: showUI called with options:', options);
  },
  hideUI: () => {
    console.log('Mock: hideUI called');
  },
  closePlugin: (message) => {
    console.log('Mock: closePlugin called with message:', message);
  },
  on: (event, callback) => {
    console.log('Mock: on called with event:', event);
  },
  postMessage: (message) => {
    console.log('Mock: postMessage called with:', message);
  },
  ui: {
    postMessage: (message) => {
      console.log('Mock: ui.postMessage called with:', message);
    },
    onmessage: null
  },
  clientStorage: {
    getAsync: async (key) => {
      console.log('Mock: getAsync called with key:', key);
      return null;
    },
    setAsync: async (key, value) => {
      console.log('Mock: setAsync called with key:', key, 'value:', value);
    }
  },
  createFrame: () => ({
    name: '',
    resize: (w, h) => console.log(`Mock: resize called with ${w}x${h}`),
    x: 0,
    y: 0,
    fills: [],
    cornerRadius: 0,
    appendChild: (child) => console.log('Mock: appendChild called'),
    remove: () => console.log('Mock: remove called')
  }),
  createRectangle: () => ({
    name: '',
    resize: (w, h) => console.log(`Mock: resize called with ${w}x${h}`),
    x: 0,
    y: 0,
    fills: [],
    cornerRadius: 0,
    appendChild: (child) => console.log('Mock: appendChild called'),
    remove: () => console.log('Mock: remove called')
  }),
  createEllipse: () => ({
    name: '',
    resize: (w, h) => console.log(`Mock: resize called with ${w}x${h}`),
    x: 0,
    y: 0,
    fills: [],
    cornerRadius: 0,
    appendChild: (child) => console.log('Mock: appendChild called'),
    remove: () => console.log('Mock: remove called')
  }),
  createText: () => ({
    characters: '',
    fontSize: 14,
    fills: [],
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    appendChild: (child) => console.log('Mock: appendChild called'),
    remove: () => console.log('Mock: remove called')
  }),
  createComponent: () => ({
    name: '',
    resize: (w, h) => console.log(`Mock: resize called with ${w}x${h}`),
    x: 0,
    y: 0,
    fills: [],
    cornerRadius: 0,
    appendChild: (child) => console.log('Mock: appendChild called'),
    remove: () => console.log('Mock: remove called')
  }),
  createInstance: () => ({
    name: '',
    resize: (w, h) => console.log(`Mock: resize called with ${w}x${h}`),
    x: 0,
    y: 0,
    fills: [],
    cornerRadius: 0,
    appendChild: (child) => console.log('Mock: appendChild called'),
    remove: () => console.log('Mock: remove called')
  }),
  createPaintStyle: () => ({
    name: '',
    description: '',
    paints: []
  }),
  createTextStyle: () => ({
    name: '',
    description: '',
    fontSize: 14,
    fontWeight: 400,
    lineHeight: { value: 1.2, unit: 'PIXELS' },
    letterSpacing: { value: 0, unit: 'PIXELS' }
  }),
  createEffectStyle: () => ({
    name: '',
    description: '',
    effects: []
  }),
  currentPage: {
    children: [],
    appendChild: (node) => {
      console.log('Mock: currentPage.appendChild called');
      mockFigma.currentPage.children.push(node);
    }
  }
};

// Set global figma for testing
global.figma = mockFigma;
global.document = {
  getElementById: (id) => {
    console.log(`Mock: getElementById called with id: ${id}`);
    return {
      addEventListener: (event, callback) => {
        console.log(`Mock: addEventListener called with event: ${event}`);
      }
    };
  }
};

// Mock fetch for testing
global.fetch = async (url, options) => {
  console.log(`Mock: fetch called with url: ${url}, options:`, options);
  
  // Simulate API response
  if (url.includes('/api/sqs/poll')) {
    return {
      ok: true,
      json: async () => ({
        success: true,
        messages: [
          {
            messageId: 'test-message-1',
            receiptHandle: 'test-receipt-1',
            body: JSON.stringify({
              id: 'test-design-1',
              type: 'button',
              title: 'Test Button',
              properties: {
                width: 200,
                height: 50,
                backgroundColor: '#FF6B6B',
                textColor: '#ffffff',
                borderRadius: 8
              },
              content: {
                text: 'Test Button'
              },
              position: {
                x: 100,
                y: 100
              }
            })
          }
        ]
      })
    };
  } else if (url.includes('/api/sqs/delete')) {
    return {
      ok: true,
      json: async () => ({
        success: true
      })
    };
  }
  
  return {
    ok: false,
    status: 404,
    json: async () => ({ error: 'Not found' })
  };
};

// Mock setTimeout and setInterval
global.setTimeout = (callback, delay) => {
  console.log(`Mock: setTimeout called with delay: ${delay}`);
  return 1;
};

global.setInterval = (callback, delay) => {
  console.log(`Mock: setInterval called with delay: ${delay}`);
  return 1;
};

global.clearInterval = (id) => {
  console.log(`Mock: clearInterval called with id: ${id}`);
};

// Mock Date
global.Date = class MockDate extends Date {
  constructor(...args) {
    if (args.length === 0) {
      super('2024-01-01T12:00:00.000Z');
    } else {
      super(...args);
    }
  }
  
  toLocaleTimeString() {
    return '12:00:00 PM';
  }
};

// Mock Math.random
const originalRandom = Math.random;
Math.random = () => 0.5; // Always return 0.5 for consistent testing

// Mock console methods
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
  originalLog('[TEST]', ...args);
};

console.error = (...args) => {
  originalError('[TEST ERROR]', ...args);
};

console.warn = (...args) => {
  originalWarn('[TEST WARN]', ...args);
};

// Test the plugin
async function testPlugin() {
  console.log('Starting Figma Design Poller Plugin tests...\n');

  try {
    // Import the plugin (this would normally be done by Figma)
    const { FigmaPollingPlugin } = require('./figma-polling-plugin.ts');
    
    console.log('✓ Plugin class loaded successfully');
    
    // Test plugin initialization
    const plugin = new FigmaPollingPlugin();
    console.log('✓ Plugin initialized successfully');
    
    // Test polling functionality
    console.log('\n--- Testing Polling Functionality ---');
    await plugin.pollForData();
    console.log('✓ Polling test completed');
    
    // Test design creation
    console.log('\n--- Testing Design Creation ---');
    await plugin.createSampleDesign();
    console.log('✓ Sample design creation test completed');
    
    // Test UI message handling
    console.log('\n--- Testing UI Message Handling ---');
    plugin.handleMessage({ type: 'START_POLLING' });
    plugin.handleMessage({ type: 'STOP_POLLING' });
    plugin.handleMessage({ type: 'CLEAR_DESIGNS' });
    plugin.handleMessage({ type: 'GET_STATUS' });
    console.log('✓ UI message handling test completed');
    
    // Test utility functions
    console.log('\n--- Testing Utility Functions ---');
    const color = plugin.parseColor('#FF6B6B');
    console.log('✓ Color parsing test completed:', color);
    
    const randomColor = plugin.getRandomColor();
    console.log('✓ Random color generation test completed:', randomColor);
    
    console.log('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testPlugin().catch(console.error);

// Restore original functions
Math.random = originalRandom;
console.log = originalLog;
console.error = originalError;
console.warn = originalWarn;
