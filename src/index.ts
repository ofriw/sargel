#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { inspectElement } from './inspect-element.js';
import type { InspectElementArgs } from './config/types.js';

function formatDataAsMarkdown(data: any): string {
  let markdown = '';

  // Handle multi-element response
  if (data.elements) {
    for (const element of data.elements) {
      markdown += `## Element: ${element.selector}\n\n`;
      markdown += formatSingleElementAsMarkdown(element);
      markdown += '\n';
    }

    if (data.relationships && data.relationships.length > 0) {
      markdown += '## Relationships\n\n';
      for (const rel of data.relationships) {
        markdown += `- ${rel.from} → ${rel.to}: ${rel.distance.center_to_center}px apart\n`;
      }
      markdown += '\n';
    }

    if (data.viewport_adjustments) {
      markdown += `## Viewport\n- Centered: ${data.viewport_adjustments.centered}\n- Zoom: ${data.viewport_adjustments.zoom_factor}x\n\n`;
    }
  } else {
    // Handle single element response (backward compatibility)
    markdown += formatSingleElementAsMarkdown(data);
  }

  return markdown;
}

function formatSingleElementAsMarkdown(element: any): string {
  let markdown = '';

  // Box Model (compact format)
  if (element.box_model) {
    const bm = element.box_model;
    markdown += '### Box Model\n';
    markdown += `- content: ${bm.content.x},${bm.content.y} (${bm.content.width}x${bm.content.height})\n`;
    if (bm.padding.width > 0 || bm.padding.height > 0) {
      markdown += `- padding: ${bm.padding.x},${bm.padding.y} (${bm.padding.width}x${bm.padding.height})\n`;
    }
    if (bm.border.width > 0 || bm.border.height > 0) {
      markdown += `- border: ${bm.border.x},${bm.border.y} (${bm.border.width}x${bm.border.height})\n`;
    }
    if (bm.margin.width > 0 || bm.margin.height > 0) {
      markdown += `- margin: ${bm.margin.x},${bm.margin.y} (${bm.margin.width}x${bm.margin.height})\n`;
    }
    markdown += '\n';
  }

  // Computed Styles (grouped by type)
  if (element.computed_styles) {
    markdown += '### Computed Styles\n';
    const styles = element.computed_styles;

    // Layout properties
    const layoutProps = ['display', 'position', 'float', 'clear', 'flex-direction', 'flex-wrap', 'grid-template-columns'];
    const layout = layoutProps.filter(prop => styles[prop]).map(prop => `- ${prop}: ${styles[prop]}`);
    if (layout.length > 0) {
      markdown += '**Layout:**\n' + layout.join('\n') + '\n\n';
    }

    // Box properties
    const boxProps = ['width', 'height', 'margin', 'padding', 'border', 'box-sizing'];
    const box = Object.keys(styles).filter(prop =>
      boxProps.some(bp => prop.startsWith(bp))
    ).map(prop => `- ${prop}: ${styles[prop]}`);
    if (box.length > 0) {
      markdown += '**Box:**\n' + box.join('\n') + '\n\n';
    }

    // Typography
    const typoProps = ['font', 'text', 'line-height', 'letter-spacing', 'word-spacing'];
    const typo = Object.keys(styles).filter(prop =>
      typoProps.some(tp => prop.startsWith(tp))
    ).map(prop => `- ${prop}: ${styles[prop]}`);
    if (typo.length > 0) {
      markdown += '**Typography:**\n' + typo.join('\n') + '\n\n';
    }

    // Colors
    const colorProps = ['color', 'background', 'border-color', 'outline-color'];
    const colors = Object.keys(styles).filter(prop =>
      colorProps.some(cp => prop.includes('color') || prop.startsWith('background'))
    ).map(prop => `- ${prop}: ${styles[prop]}`);
    if (colors.length > 0) {
      markdown += '**Colors:**\n' + colors.join('\n') + '\n\n';
    }
  }

  // Cascade Rules (top 3 most specific)
  if (element.cascade_rules && element.cascade_rules.length > 0) {
    markdown += '### Cascade Rules\n';
    element.cascade_rules.slice(0, 3).forEach((rule: any) => {
      markdown += `**${rule.selector}** (${rule.specificity})\n`;
      const props = Object.entries(rule.properties).slice(0, 5); // Top 5 properties
      props.forEach(([prop, value]) => {
        markdown += `- ${prop}: ${value}\n`;
      });
      markdown += '\n';
    });
  }

  return markdown;
}

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