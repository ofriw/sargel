# Sargel - Visual DOM Inspector for AI Agents

## Purpose
MCP server for visual web debugging - inspects DOM elements, tests CSS changes, and analyzes spatial relationships without modifying source code.

## Architecture Overview
- **Entry**: src/index.ts - MCP server with inspect_element tool
- **Core**: src/inspect-element.ts - Main inspection logic (645-1320)
- **Browser**: src/browser/cdp-client.ts - Chrome automation via CDP
- **Visual**: src/visual/drawing-utils.ts, src/visual/canvas-renderer.ts - Screenshot enhancement
- **Config**: src/config/constants.ts - All configuration parameters

## Key Concepts
- Uses Chrome DevTools Protocol for reliable cross-browser rendering
- Set-of-Mark highlighting optimized for LLM visual comprehension
- Handles single and multi-element inspection with spatial analysis
- Temporary DOM marking for element identification

## Common Tasks
- Inspect element: Call via MCP with CSS selector and URL
- Test CSS changes: Use css_edits parameter
- Analyze relationships: Multi-element inspection returns spatial data

## Testing
npm test - Run all tests
npm run test:unit - Unit tests only
npm run test:e2e - End-to-end tests

## Important Files
- src/inspect-element.ts:645-749 - Main inspect entry point
- src/browser/cdp-client.ts:150-209 - Browser management
- src/visual/coordinate-utils.ts - Complex coordinate transforms
- src/css/property-groups.ts - CSS categorization