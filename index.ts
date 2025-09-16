#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { inspectElement } from './inspector.js';
import type { InspectElementArgs } from './types.js';

const server = new Server(
  {
    name: 'sargel',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'inspect_element',
        description: `Inspects elements on web pages and returns visual analysis with computed styles. Supports testing CSS changes before applying to source code. Returns screenshot with highlighted elements and detailed style information.`,
        inputSchema: {
          type: 'object',
          properties: {
            css_selector: {
              type: 'string',
              description: `CSS selector for target elements. Supports standard CSS syntax including IDs, classes, and complex selectors.`,
            },
            url: {
              type: 'string',
              description: 'Full webpage URL including protocol (https://, http://).',
            },
            property_groups: {
              type: 'array',
              items: { type: 'string' },
              description: `Filter results to specific CSS categories: "layout", "box", "typography", "colors", "visual", "positioning". Default: ["layout", "box", "typography", "colors"].`,
            },
            css_edits: {
              type: 'object',
              description: `CSS properties to test. Returns screenshot with changes applied. Use object format: {"property": "value"}.`,
              additionalProperties: {
                type: 'string'
              }
            },
            limit: {
              type: 'number',
              description: `Maximum elements to inspect when selector matches multiple (1-20). Default: 10.`,
              minimum: 1,
              maximum: 20
            },
            autoCenter: {
              type: 'boolean',
              description: `Centers elements in viewport for better visibility. Default: true.`,
              default: true
            },
            autoZoom: {
              type: 'boolean', 
              description: `Auto-adjusts zoom for optimal element size. Default: true.`,
              default: true
            },
            zoomFactor: {
              type: 'number',
              description: `Manual zoom level override (0.5-3.0). Overrides autoZoom when specified.`,
              minimum: 0.5,
              maximum: 3.0
            }
          },
          required: ['css_selector', 'url'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name !== 'inspect_element') {
    throw new Error(`Unknown tool: ${name}`);
  }
  
  try {
    const typedArgs = args as Record<string, unknown>;
    
    // Validate and convert arguments
    const inspectArgs: InspectElementArgs = {
      css_selector: typedArgs.css_selector as string,
      url: typedArgs.url as string,
      property_groups: typedArgs.property_groups as string[] | undefined,
      css_edits: typedArgs.css_edits as Record<string, string> | undefined,
      limit: typedArgs.limit as number | undefined,
      autoCenter: typedArgs.autoCenter as boolean | undefined,
      autoZoom: typedArgs.autoZoom as boolean | undefined,
      zoomFactor: typedArgs.zoomFactor as number | undefined
    };
    
    // Validate required arguments
    if (!inspectArgs.css_selector) {
      throw new Error('css_selector is required');
    }
    if (!inspectArgs.url) {
      throw new Error('url is required');
    }
    
    const result = await inspectElement(inspectArgs);
    
    // Extract base64 data from data URL for image block
    const base64Data = result.screenshot.replace(/^data:image\/png;base64,/, '');
    
    // Check if this is a single element (length 1) or multi-element result
    const isMultiElement = result.elements.length > 1;
    
    // Create diagnostic data based on whether it's single or multi element
    let diagnosticData: any;
    if (isMultiElement) {
      // Multi-element: keep full structure
      diagnosticData = { ...result };
    } else {
      // Single element: flatten to match old InspectionResult format for backward compatibility
      const singleElement = result.elements[0];
      diagnosticData = {
        computed_styles: singleElement.computed_styles,
        grouped_styles: singleElement.grouped_styles,
        cascade_rules: singleElement.cascade_rules,
        box_model: singleElement.box_model,
        applied_edits: singleElement.applied_edits,
        viewport_adjustments: {
          original_position: result.viewport_adjustments?.original_positions[0] || { centerX: 0, centerY: 0 },
          centered: result.viewport_adjustments?.centered || false,
          zoom_factor: result.viewport_adjustments?.zoom_factor || 1,
          original_viewport: result.viewport_adjustments?.original_viewport
        },
        stats: result.stats
      };
    }
    delete diagnosticData.screenshot; // Don't duplicate in diagnostic
    
    const elementText = isMultiElement 
      ? `Inspected ${result.elements.length} elements: ${inspectArgs.css_selector}`
      : `Inspected element: ${inspectArgs.css_selector}`;
    
    return {
      content: [
        {
          type: 'text',
          text: elementText
        },
        {
          type: 'image',
          data: base64Data,
          mimeType: 'image/png'
        },
        {
          type: 'text',
          text: JSON.stringify(diagnosticData, null, 2)
        }
      ]
    };
    
  } catch (error) {
    console.error('Inspection error:', error);
    
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  
  // Handle cleanup on exit
  process.on('SIGINT', () => {
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    process.exit(0);
  });
  
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});