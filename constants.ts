/**
 * Configuration constants for the SARGEL system.
 * Centralized constants for better maintainability and configuration.
 */

// Font and Typography Configuration
export const FONT_CONFIG = {
  /** Default font family name */
  FAMILY_NAME: 'JetBrains Mono',
  /** Default font size for labels and text */
  DEFAULT_SIZE: 24,
  /** Character width multiplier for text width estimation */
  CHAR_WIDTH_RATIO: 0.6,
  /** Default text padding in pixels */
  TEXT_PADDING: 4,
  /** Minimum text box width */
  MIN_TEXT_WIDTH: 20,
  /** Label font size for coordinates and measurements */
  LABEL_SIZE: 12,
  /** Fallback text character width when font loading fails */
  FALLBACK_CHAR_WIDTH: 8,
  /** Fallback text height when font loading fails */
  FALLBACK_TEXT_HEIGHT: 12,
} as const;

// Viewport and Zoom Configuration
export const VIEWPORT_CONFIG = {
  /** Minimum allowed zoom factor */
  MIN_ZOOM_FACTOR: 0.5,
  /** Maximum allowed zoom factor */
  MAX_ZOOM_FACTOR: 3.0,
  /** Target viewport coverage for element (40%) */
  TARGET_ELEMENT_COVERAGE: 0.4,
  /** Center element if more than 30% away from viewport center */
  CENTER_THRESHOLD: 0.3,
  /** Zoom in threshold - below 10% coverage */
  ZOOM_IN_THRESHOLD: 0.1,
  /** Zoom out threshold - above 80% coverage */
  ZOOM_OUT_THRESHOLD: 0.8,
  /** Default viewport width fallback */
  DEFAULT_WIDTH: 1280,
  /** Default viewport height fallback */
  DEFAULT_HEIGHT: 1024,
  /** Zoom factor calculation for oversized elements */
  ZOOM_CALCULATION_RATIO: 0.6,
  /** Multi-element group zoom in threshold - below 20% coverage */
  MULTI_ZOOM_IN_THRESHOLD: 0.2,
  /** Multi-element group zoom out threshold - above 90% coverage */
  MULTI_ZOOM_OUT_THRESHOLD: 0.9,
  /** Multi-element zoom out ratio */
  MULTI_ZOOM_OUT_RATIO: 0.7,
} as const;

// Visual Styling Configuration
export const VISUAL_CONFIG = {
  /** Pixel tolerance for alignment detection */
  ALIGNMENT_TOLERANCE: 1,
  /** Transparency value for filled rectangles (30%) */
  FILL_ALPHA: 0.3,
  /** Corner marker size in pixels */
  MARKER_SIZE: 8,
  /** Label minimum width for readability */
  LABEL_MIN_WIDTH: 80,
  /** Label height for better visibility */
  LABEL_HEIGHT: 20,
  /** Structured label padding */
  LABEL_PADDING: 4,
} as const;

// Box Model Colors (LLM-optimized Set-of-Mark colors)
export const BOX_MODEL_COLORS = {
  /** Margin - ID:1, Pure Red */
  MARGIN: 0xFF0000FF,
  /** Border - ID:2, Pure Green */
  BORDER: 0x00FF00FF,
  /** Padding - ID:3, Pure Blue */
  PADDING: 0x0000FFFF,
  /** Content - ID:4, Pure Yellow */
  CONTENT: 0xFFFF00FF,
} as const;

// Box Model Border Thickness
export const BOX_MODEL_THICKNESS = {
  /** Margin border thickness */
  MARGIN: 3,
  /** Border thickness */
  BORDER: 3,
  /** Padding border thickness */
  PADDING: 3,
  /** Content border thickness */
  CONTENT: 4,
} as const;

// Text and Label Colors
export const TEXT_COLORS = {
  /** Pure black for text and outlines */
  BLACK: 0x000000FF,
  /** Pure white for backgrounds and outlines */
  WHITE: 0xFFFFFFFF,
  /** Semi-transparent white for label backgrounds */
  WHITE_SEMI: 0xFFFFFFEE,
  /** Dark gray for minor elements */
  GRAY_DARK: 0x666666FF,
  /** Semi-transparent white fill */
  WHITE_FILL: 0xFFFFFFCC,
} as const;

// Ruler and Grid Configuration
export const RULER_CONFIG = {
  /** Main ruler thickness */
  THICKNESS: 4,
  /** Major tick mark length */
  MAJOR_TICK_LENGTH: 16,
  /** Minor tick mark length */
  MINOR_TICK_LENGTH: 8,
  /** Major tick spacing in pixels (every 100px) */
  MAJOR_TICK_SPACING: 100,
  /** Minor tick spacing in pixels (every 50px) */
  MINOR_TICK_SPACING: 50,
} as const;

// Crosshair Configuration
export const CROSSHAIR_CONFIG = {
  /** Crosshair line thickness */
  THICKNESS: 3,
  /** Dashed line dash length */
  DASH_LENGTH: 5,
  /** Dashed line gap length */
  GAP_LENGTH: 3,
  /** Enhanced magenta color with opacity */
  COLOR: 0xFF00FFCC,
} as const;

// Legacy Multi-Element Highlight Colors (for future use)
export const HIGHLIGHT_COLORS = [
  { r: 0, g: 0, b: 255, a: 0.8 }, // Bright Blue
  { r: 0, g: 255, b: 0, a: 0.8 }, // Bright Green  
  { r: 255, g: 255, b: 0, a: 0.8 }, // Bright Yellow
  { r: 255, g: 128, b: 0, a: 0.8 }, // Orange
  { r: 255, g: 0, b: 255, a: 0.8 }, // Magenta
] as const;

// Fallback Colors
export const FALLBACK_COLORS = {
  /** Black outline for fallback text */
  OUTLINE: 0x000000FF,
  /** Semi-transparent white fill for fallback text */
  FILL: 0xFFFFFFCC,
} as const;

// Element Limits and Safety
export const ELEMENT_LIMITS = {
  /** Maximum property value length for display */
  MAX_PROPERTY_LENGTH: 100,
} as const;