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
        description: `PIXEL-PERFECT CSS DEBUGGING WORKFLOW:

Step 1 - INSPECT: First, analyze the current state by inspecting elements to understand layout, styling, and visual issues.
Step 2 - IDENTIFY: Determine what needs to be changed (spacing, alignment, colors, etc.).
Step 3 - TEST & VERIFY: Use css_edits parameter to apply changes and instantly see results in returned screenshot.
Step 4 - ITERATE: If not perfect, refine css_edits in next call and see updated results immediately.
Step 5 - EXTRACT: Copy successful CSS values to your source files.

This tool enables the complete DevTools-like workflow: inspect → edit → verify → iterate → copy. Perfect for debugging layout issues, matching designs exactly, and achieving pixel-perfect UIs through systematic testing.

WHEN TO USE:
- "This button is misaligned" → Inspect current position → Test alignment fixes → Perfect spacing
- "Colors don't match design" → Inspect current colors → Test design values → Verify exact match  
- "Layout breaks on mobile" → Inspect responsive behavior → Test CSS fixes → Validate across sizes`,
        inputSchema: {
          type: 'object',
          properties: {
            css_selector: {
              type: 'string',
              description: `CSS selector to target element(s) for inspection and editing. 

SELECTOR STRATEGY:
- Start SPECIFIC for single elements: "#submit-button", ".main-header"
- Use GENERAL for pattern analysis: "button", ".nav-item", ".card"
- COMPOUND selectors for precision: ".modal .close-button", "form input[type='submit']"

COMMON PATTERNS:
- Single element fix: ".hero-title" → Perfect one element's styling
- Multi-element alignment: "button" → Analyze spacing between all buttons  
- Component analysis: ".card" → Check consistency across all cards
- Responsive issues: ".sidebar" → Debug layout at different screen sizes
- Form debugging: "input, textarea" → Inspect all form inputs together

SELECTION TIPS:
- Use browser DevTools to test selectors first
- Multiple matches = automatic relationship analysis 
- Be specific enough to avoid unintended matches
- Consider ":nth-child()", ":first-of-type" for precision

The selector determines the scope of your CSS debugging session.`,
            },
            url: {
              type: 'string',
              description: 'Complete webpage URL to inspect. Must include protocol. Examples: \'https://example.com\', \'http://localhost:3000\'.',
            },
            property_groups: {
              type: 'array',
              items: { type: 'string' },
              description: `Focus on specific CSS aspects to reduce noise and speed up debugging:

PROPERTY GROUPS:
• "layout" - display, flex, grid properties (for structural issues)
• "box" - margin, padding, border, width, height (for spacing/sizing)  
• "typography" - font, text properties, line-height (for text styling)
• "colors" - color, background-color, border-color (for visual styling)
• "visual" - opacity, visibility, transform, filter (for effects)
• "positioning" - position, top/left/right/bottom, z-index (for placement)

DEBUGGING STRATEGIES:
- Alignment issues → ["layout", "box"] → Focus on flex/grid + spacing
- Text problems → ["typography"] → Just font styling, ignore layout noise  
- Color mismatches → ["colors"] → Only color-related properties
- Spacing problems → ["box"] → Margins, padding, borders only
- Layer conflicts → ["positioning"] → Z-index, position values
- All styling → [] (empty) → Default comprehensive view

Fewer groups = faster analysis, more focused debugging. Default: ["layout", "box", "typography", "colors"]`,
            },
            css_edits: {
              type: 'object',
              description: `ITERATIVE CSS TESTING - Apply and see results instantly in one call!

WORKFLOW: Each call with css_edits returns updated screenshot + computed styles, enabling rapid iteration:

ITERATION PATTERN:
1st call: Inspect without css_edits to see current state
2nd call: Apply initial fix → {"margin-left": "16px"} → See if spacing improves  
3rd call: Refine based on result → {"margin-left": "24px", "margin-top": "8px"} → Perfect alignment
Final: Copy working values to source code

COMMON FIXES:
- Alignment: {"align-self": "center", "justify-self": "start"}
- Spacing: {"margin": "16px", "padding": "12px 24px"} 
- Colors: {"color": "#333", "background-color": "#f5f5f5"}
- Layout: {"display": "flex", "flex-direction": "column", "gap": "8px"}
- Debug: {"border": "2px solid red", "background": "rgba(255,0,0,0.1)"}

PROGRESSIVE REFINEMENT:
Start small → {"margin-top": "8px"} → If not enough, increase → {"margin-top": "16px"} → Perfect!

Each call shows immediate visual feedback - no need for separate inspection calls when testing changes.`,
              additionalProperties: {
                type: 'string'
              }
            },
            limit: {
              type: 'number',
              description: `Control scope when multiple elements match selector.

MULTI-ELEMENT DEBUGGING STRATEGY:
• Start with limit: 3-5 for focused analysis of key elements
• Use limit: 10+ for comprehensive pattern analysis across components
• Reduce limit if screenshot/response becomes too large

ITERATION SIGNALS - When to stop refining css_edits:
✅ Visual spacing matches design specifications exactly
✅ Elements align properly with grid/layout system  
✅ Colors match design tokens/brand guidelines
✅ Text is readable and properly sized
✅ Interactive states (hover, focus) work correctly

MULTI-STEP FIX WORKFLOW:
1. Broad inspection (limit: 10) → Identify patterns
2. Focused testing (limit: 3) → Test fixes on key elements  
3. Verify consistency (limit: 10) → Ensure fix works across all instances
4. Extract CSS → Copy working styles to source code

Success = When visual result matches intended design and all elements behave consistently.`,
              minimum: 1,
              maximum: 20
            },
            autoCenter: {
              type: 'boolean',
              description: `AUTOMATIC ELEMENT CENTERING - Optimizes visual inspection for AI analysis.

CENTERING BENEFITS:
• Places elements in viewport center where LLMs focus attention naturally
• Ensures small elements are prominently displayed for better analysis  
• Reduces need to scroll through screenshots to find inspected elements
• Improves accuracy of visual debugging by positioning elements optimally

DEFAULT BEHAVIOR: 
• true (recommended) - Automatically centers elements before screenshot
• false - Elements remain in original position

WHEN TO DISABLE:
- Analyzing layout context where element position relative to siblings matters
- Debugging scroll-dependent behaviors or sticky/fixed positioning
- When element position itself is the issue being investigated

Modern LLMs exhibit center-bias in visual attention - centering elements significantly improves inspection accuracy.`,
              default: true
            },
            autoZoom: {
              type: 'boolean', 
              description: `INTELLIGENT ZOOM OPTIMIZATION - Automatically adjusts viewport scale for optimal element visibility.

ZOOM BENEFITS:
• Small elements (buttons, icons) are enlarged for detailed inspection
• Large elements are scaled down to fit viewport while maintaining detail
• Ensures consistent element visibility regardless of original size
• Optimizes pixel density for clear CSS measurement analysis

ZOOM LOGIC:
• Elements <10% of viewport → Zoom in (up to 3x) for better visibility
• Elements >80% of viewport → Zoom out (down to 0.5x) to show full element
• Elements 10-80% → No zoom adjustment needed

DEFAULT BEHAVIOR:
• true (recommended) - Automatic intelligent scaling
• false - Elements shown at original browser zoom level

OVERRIDE: Use zoomFactor parameter to manually control zoom level.

Perfect for debugging tiny UI elements or ensuring large components fit in screenshot view.`,
              default: true
            },
            zoomFactor: {
              type: 'number',
              description: `MANUAL ZOOM OVERRIDE - Explicitly set viewport scale factor.

ZOOM LEVELS:
• 0.5 - 50% zoom (fit large elements, see more context)
• 1.0 - 100% normal browser zoom  
• 1.5 - 150% zoom (enlarge medium elements)
• 2.0 - 200% zoom (detailed view of small elements)  
• 3.0 - 300% maximum zoom (pixel-perfect inspection)

WHEN TO USE:
- Override autoZoom when you need specific magnification level
- Debugging pixel-perfect alignment at high zoom levels
- Consistent zoom across multiple inspection calls for comparison
- Custom zoom for specific design requirements

PRECEDENCE: When provided, overrides autoZoom calculations completely.

Range: 0.5 to 3.0 (enforced for screenshot quality and performance)`,
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