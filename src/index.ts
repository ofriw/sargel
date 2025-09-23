#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { inspectElement } from './inspect-element.js';
import type { InspectElementArgs } from './config/types.js';

function formatInspectionResult(result: any): string {
  let markdown = '';

  // Check if elements array exists and has items
  const elements = result.elements || [];
  const elementCount = elements.length;

  // Always use multi-element format for consistency
  markdown += `# ${elementCount} element${elementCount === 1 ? '' : 's'}\n\n`;
  if (elements && Array.isArray(elements)) {
    for (const element of elements) {
      markdown += `## ${element.selector}\n`;
      // Always use compact format for consistency
      markdown += formatElementCompact(element);
      markdown += '\n';
    }
  }

  if (result.relationships && result.relationships.length > 0) {
    markdown += '## relations\n';
    for (const rel of result.relationships) {
      const alignments = [];
      if (rel.alignment.left) alignments.push('left');
      if (rel.alignment.right) alignments.push('right');
      if (rel.alignment.top) alignments.push('top');
      if (rel.alignment.bottom) alignments.push('bottom');
      if (rel.alignment.vertical_center) alignments.push('vcenter');
      if (rel.alignment.horizontal_center) alignments.push('hcenter');

      markdown += `${rel.from}→${rel.to}: ${rel.distance.horizontal},${rel.distance.vertical},${Math.round(rel.distance.center_to_center)}px`;
      if (alignments.length > 0) {
        markdown += ` ${alignments.join(',')}`;
      }
      markdown += '\n';
    }
    markdown += '\n';
  }

  if (result.viewport_adjustments) {
    markdown += `viewport: ${result.viewport_adjustments.original_viewport.width}x${result.viewport_adjustments.original_viewport.height} zoom:${result.viewport_adjustments.zoom_factor}x centered:${result.viewport_adjustments.centered}\n`;
    if (result.viewport_adjustments.original_positions && result.viewport_adjustments.original_positions.length > 0) {
      markdown += 'positions:\n';
      for (let i = 0; i < result.viewport_adjustments.original_positions.length; i++) {
        const pos = result.viewport_adjustments.original_positions[i];
        markdown += `${i}: ${pos.centerX},${pos.centerY},${pos.width}x${pos.height}\n`;
      }
    }
  }

  // Add stats if available
  if (result.stats) {
    markdown += `\nstats: ${result.stats.total_properties}→${result.stats.filtered_properties} properties, ${result.stats.total_rules}→${result.stats.filtered_rules} rules\n`;
  }

  return markdown;
}

function formatElementCompact(element: any): string {
  let markdown = '';

  if (!element.box_model) {
    markdown += 'box: undefined\n';
  } else {
    const bm = element.box_model;
    markdown += `box: ${bm.content.x},${bm.content.y},${bm.content.width}x${bm.content.height}\n`;
    markdown += `padding: ${bm.padding.x},${bm.padding.y},${bm.padding.width}x${bm.padding.height}\n`;
    markdown += `border: ${bm.border.x},${bm.border.y},${bm.border.width}x${bm.border.height}\n`;
    markdown += `margin: ${bm.margin.x},${bm.margin.y},${bm.margin.width}x${bm.margin.height}\n`;
  }

  // Computed styles - output ALL properties individually as expected by parser
  if (element.computed_styles && Object.keys(element.computed_styles).length > 0) {
    for (const [prop, value] of Object.entries(element.computed_styles)) {
      markdown += `${prop}: ${value}\n`;
    }
  }

  // Cascade rules
  if (element.cascade_rules && element.cascade_rules.length > 0) {
    markdown += '\ncascade:\n';
    for (const rule of element.cascade_rules) {
      const props = Object.entries(rule.properties).map(([k, v]) => `${k}:${v}`).join(' ');
      markdown += `${rule.selector}[${rule.specificity}] ${props}\n`;
    }
  }

  // Applied edits if any
  if (element.applied_edits && Object.keys(element.applied_edits).length > 0) {
    markdown += '\nedits:\n';
    for (const [prop, value] of Object.entries(element.applied_edits)) {
      markdown += `${prop}: ${value}\n`;
    }
    markdown += '\n';
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
    
    const elementText = result.elements.length > 1
      ? `Inspected ${result.elements.length} elements: ${inspectArgs.css_selector}`
      : `Inspected element: ${inspectArgs.css_selector}`;

    const markdownOutput = formatInspectionResult(result);
    
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
          text: markdownOutput
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