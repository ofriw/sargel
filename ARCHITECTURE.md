# SARGEL Architecture

## Overview

SARGEL (Style And Rendering Graphical Element Lens) is an MCP server that provides sophisticated DOM element inspection for AI agents building pixel-perfect frontends. The architecture automatically adapts between single and multi-element inspection modes, providing spatial relationship analysis when multiple elements are detected.

## Design Philosophy

### Why Multi-Element Spatial Analysis?

Research shows that AI agents building pixel-perfect frontends require sophisticated visual debugging tools:

- **AI Development Tools**: Modern tools like Cursor's Fusion extension enable visual editing with drag-and-drop interfaces that require exact spatial relationships
- **Visual Testing**: AI testing tools (Applitools, Functionize) need multi-element comparison for visual validation
- **Design-to-Code**: AI tools translating Figma designs need precise measurements to apply proper spacing patterns
- **Layout Understanding**: AI agents need to understand relative positioning between elements to build consistent layouts

The multi-element inspection with spatial relationships is **not over-engineering** - it's essential infrastructure for AI-driven frontend development.

## Architecture Principles

### 1. Adaptive Behavior
The system automatically detects whether a CSS selector matches one or multiple elements and adapts its behavior:
- **Single element**: Returns simple `InspectionResult` for backward compatibility
- **Multiple elements**: Returns `MultiInspectionResult` with spatial relationships

### 2. Performance Constraints
- **Element limit**: Default 10, maximum 20 elements
- **O(n²) relationship calculation**: Acceptable given element limits (max 190 relationships)
- **Browser reuse**: Maintains Chrome instances and tabs across inspections

### 3. Visual Differentiation
- **Color-coded highlighting**: Each element gets a different color overlay
- **Spatial measurements**: Edge-to-edge distances and center-to-center calculations
- **Alignment detection**: Boolean flags for top/bottom/left/right/center alignment

## Key Components

### Core Inspector (`inspector.ts`)

**Main Function**: `inspectElement()`
- Entry point that detects single vs multiple elements
- Uses `Runtime.evaluate` to find all matching elements
- Routes to specialized single or multi-element processing

**Multi-Element Processing**: `inspectMultipleElements()`
- Processes each element individually for styles/box model
- Calculates pairwise spatial relationships
- Provides color-coded visual highlighting

**Spatial Analysis**: `calculateElementRelationships()`
- **Why O(n²)**: AI agents need ALL pairwise relationships to understand layout patterns
- **Distance calculations**: Edge-to-edge gaps and center-to-center measurements
- **Alignment detection**: 1px tolerance for "close enough" alignment

### Temporary DOM Manipulation

**Why we use `data-inspect-id`**:
- Complex selectors (`:nth-child`, pseudo-classes) can be unreliable for repeated queries
- Temporary attributes ensure we get the exact same elements for node ID lookup
- Attributes are immediately cleaned up after use
- Enables robust handling of dynamic content

### Property Grouping System (`property-groups.ts`)

**Purpose**: Organizes CSS properties into logical categories for focused analysis
- **Token efficiency**: Reduces API response size by filtering relevant properties
- **Focused analysis**: AI agents can request specific groups (layout, colors, typography)
- **Essential properties**: Always included regardless of group selection

## Data Structures

### Single Element Result
```typescript
interface InspectionResult {
  screenshot: string;
  computed_styles: Record<string, string>;
  grouped_styles: GroupedStyles;
  cascade_rules: CascadeRule[];
  box_model: BoxModel;
  applied_edits?: Record<string, string>;
  stats: StatsData;
}
```

### Multi-Element Result
```typescript
interface MultiInspectionResult {
  elements: ElementInspection[];
  relationships: ElementRelationship[];
  screenshot: string;
  stats: StatsData;
}
```

### Spatial Relationship
```typescript
interface ElementRelationship {
  from: string;    // "selector[index]" format
  to: string;      // "selector[index]" format
  distance: {
    horizontal: number;        // edge-to-edge horizontal gap
    vertical: number;          // edge-to-edge vertical gap
    center_to_center: number;  // diagonal distance between centers
  };
  alignment: {
    top: boolean;              // top edges aligned (±1px)
    bottom: boolean;           // bottom edges aligned (±1px)
    left: boolean;             // left edges aligned (±1px)
    right: boolean;            // right edges aligned (±1px)
    vertical_center: boolean;  // vertical centers aligned (±1px)
    horizontal_center: boolean; // horizontal centers aligned (±1px)
  };
}
```

## Design Trade-offs

### Complexity vs Value
- **Added complexity**: ~200 lines for spatial analysis
- **Value delivered**: Critical infrastructure for AI frontend development
- **Performance**: O(n²) acceptable with element limits
- **Maintainability**: Well-contained in focused functions

### Browser Automation
- **Chrome dependency**: Required for consistent rendering across platforms
- **Resource management**: Comprehensive cleanup to prevent resource leaks
- **Process lifecycle**: Handles Chrome launch, connection, and cleanup

### Visual Output
- **Screenshot with overlays**: Essential for AI agents to see element positioning
- **Color coding**: Enables visual differentiation of multiple elements
- **Overlay information**: Shows rulers and boundaries for precise measurements

## Future Considerations

### Potential Optimizations
- **Relationship filtering**: Could limit to adjacent elements only
- **Caching**: Browser instances and computed styles for repeated inspections
- **Parallel processing**: Concurrent element inspection where possible

### Extension Points
- **Custom highlight colors**: User-configurable color schemes
- **Additional measurements**: Z-index relationships, viewport positioning
- **Export formats**: SVG overlays, measurement annotations

This architecture provides the sophisticated visual debugging infrastructure that AI agents need for pixel-perfect frontend development while maintaining clean separation of concerns and comprehensive error handling.