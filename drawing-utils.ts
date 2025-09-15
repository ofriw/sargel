/**
 * Drawing utilities for visual enhancements and highlighting.
 * Extracted from inspector.ts for better modularity and reusability.
 */

import type { Rect, BoxModel } from './types.js';
import { 
  VISUAL_CONFIG, 
  TEXT_COLORS, 
  FONT_CONFIG,
  BOX_MODEL_COLORS 
} from './constants.js';

// Re-export the drawTextOnJimpImage function signature for external modules
export type DrawTextFunction = (
  jimpImage: any,
  text: string,
  x: number,
  y: number,
  fontSize?: number,
  color?: string,
  backgroundColor?: string
) => Promise<void>;

/**
 * Draws a rectangle outline on a Jimp image with specified color and thickness.
 */
export function drawRectangleOutline(image: any, rect: Rect, color: number, thickness: number): void {
  const { x, y, width, height } = rect;
  
  // Early exit if rectangle is completely outside image bounds
  if (x >= image.bitmap.width || y >= image.bitmap.height || x + width <= 0 || y + height <= 0) {
    return;
  }
  
  // Draw top and bottom edges
  for (let px = Math.max(0, x); px < Math.min(image.bitmap.width, x + width); px++) {
    // Top edge
    for (let t = 0; t < thickness; t++) {
      if (y + t >= 0 && y + t < image.bitmap.height) {
        image.setPixelColor(color >>> 0, px, y + t);
      }
      if (y + height - 1 - t >= 0 && y + height - 1 - t < image.bitmap.height) {
        image.setPixelColor(color >>> 0, px, y + height - 1 - t);
      }
    }
  }
  
  // Draw left and right edges
  for (let py = Math.max(0, y); py < Math.min(image.bitmap.height, y + height); py++) {
    // Left edge
    for (let t = 0; t < thickness; t++) {
      if (x + t >= 0 && x + t < image.bitmap.width) {
        image.setPixelColor(color >>> 0, x + t, py);
      }
      if (x + width - 1 - t >= 0 && x + width - 1 - t < image.bitmap.width) {
        image.setPixelColor(color >>> 0, x + width - 1 - t, py);
      }
    }
  }
}

/**
 * Fills a rectangle on a Jimp image with specified color and transparency.
 * Uses configured alpha blending for optimal LLM visibility.
 */
export function drawRectangleFilled(image: any, rect: Rect, color: number): void {
  const { x, y, width, height } = rect;
  const imgWidth = image.bitmap.width;
  const imgHeight = image.bitmap.height;
  
  // For LLM optimization: use configured transparency for content visibility
  const alpha = VISUAL_CONFIG.FILL_ALPHA;
  const invAlpha = 1 - alpha;
  
  for (let px = Math.max(0, x); px < Math.min(imgWidth, x + width); px++) {
    for (let py = Math.max(0, y); py < Math.min(imgHeight, y + height); py++) {
      const existing = image.getPixelColor(px, py);
      const existingR = (existing >> 24) & 0xFF;
      const existingG = (existing >> 16) & 0xFF;
      const existingB = (existing >> 8) & 0xFF;
      
      const newR = (color >> 24) & 0xFF;
      const newG = (color >> 16) & 0xFF;
      const newB = (color >> 8) & 0xFF;
      
      const r = Math.floor(newR * alpha + existingR * invAlpha);
      const g = Math.floor(newG * alpha + existingG * invAlpha);
      const b = Math.floor(newB * alpha + existingB * invAlpha);
      
      const blended = ((r << 24) | (g << 16) | (b << 8) | 0xFF) >>> 0;
      image.setPixelColor(blended, px, py);
    }
  }
}

/**
 * Draws a structured label with background and border for LLM optimization.
 * Uses Set-of-Mark style formatting with high contrast.
 */
export async function drawStructuredLabel(
  image: any,
  text: string,
  x: number,
  y: number,
  backgroundColor: number,
  textColor: number,
  drawText: DrawTextFunction
): Promise<void> {
  const labelWidth = Math.max(text.length * 7 + 8, VISUAL_CONFIG.LABEL_MIN_WIDTH); // Min width for readability
  const labelHeight = VISUAL_CONFIG.LABEL_HEIGHT; // Taller for better visibility
  
  // Ensure label stays within image bounds
  const adjustedX = Math.max(2, Math.min(x, image.bitmap.width - labelWidth - 4));
  const adjustedY = Math.max(2, Math.min(y, image.bitmap.height - labelHeight - 4));
  
  // Draw solid background rectangle (no transparency)
  for (let px = adjustedX - 1; px < adjustedX + labelWidth + 1; px++) {
    for (let py = adjustedY - 1; py < adjustedY + labelHeight + 1; py++) {
      if (px >= 0 && px < image.bitmap.width && py >= 0 && py < image.bitmap.height) {
        // Border
        if (px === adjustedX - 1 || px === adjustedX + labelWidth || 
            py === adjustedY - 1 || py === adjustedY + labelHeight) {
          image.setPixelColor(TEXT_COLORS.BLACK >>> 0, px, py); // Black border
        } else {
          image.setPixelColor(backgroundColor >>> 0, px, py); // Solid background
        }
      }
    }
  }
  
  // Draw text using the provided text rendering function
  const textX = adjustedX + VISUAL_CONFIG.LABEL_PADDING;
  const textY = adjustedY + 2;
  const textColorHex = textColor === TEXT_COLORS.WHITE ? '#FFFFFF' : '#000000';
  await drawText(image, text, textX, textY, FONT_CONFIG.LABEL_SIZE, textColorHex);
}

/**
 * Legacy simple label function for compatibility.
 * Wraps drawStructuredLabel with default text color.
 */
export async function drawSimpleLabel(
  image: any,
  text: string,
  x: number,
  y: number,
  backgroundColor: number,
  drawText: DrawTextFunction
): Promise<void> {
  await drawStructuredLabel(image, text, x, y, backgroundColor, TEXT_COLORS.BLACK, drawText);
}

/**
 * Draws corner markers for precise coordinate reference.
 * Places crosshair markers at all four corners of the margin box.
 */
export async function drawCornerMarkers(
  image: any,
  adjustedBoxModel: BoxModel,
  actualScaleX: number,
  actualScaleY: number,
  drawText: DrawTextFunction
): Promise<void> {
  const MARKER_SIZE = VISUAL_CONFIG.MARKER_SIZE;
  const MARKER_COLOR = TEXT_COLORS.BLACK; // Pure black
  const COORD_COLOR = TEXT_COLORS.WHITE; // White background
  
  // Draw markers at all four corners of the margin box (outermost)
  const corners = [
    { x: adjustedBoxModel.margin.x, y: adjustedBoxModel.margin.y, label: 'TL' },
    { x: adjustedBoxModel.margin.x + adjustedBoxModel.margin.width, y: adjustedBoxModel.margin.y, label: 'TR' },
    { x: adjustedBoxModel.margin.x, y: adjustedBoxModel.margin.y + adjustedBoxModel.margin.height, label: 'BL' },
    { x: adjustedBoxModel.margin.x + adjustedBoxModel.margin.width, y: adjustedBoxModel.margin.y + adjustedBoxModel.margin.height, label: 'BR' }
  ];
  
  for (const corner of corners) {
    const centerX = Math.floor(corner.x);
    const centerY = Math.floor(corner.y);
    
    // Draw crosshair marker
    for (let i = -MARKER_SIZE; i <= MARKER_SIZE; i++) {
      // Horizontal line
      if (centerX + i >= 0 && centerX + i < image.bitmap.width && 
          centerY >= 0 && centerY < image.bitmap.height) {
        image.setPixelColor(MARKER_COLOR >>> 0, centerX + i, centerY);
      }
      // Vertical line
      if (centerX >= 0 && centerX < image.bitmap.width && 
          centerY + i >= 0 && centerY + i < image.bitmap.height) {
        image.setPixelColor(MARKER_COLOR >>> 0, centerX, centerY + i);
      }
    }
    
    // Add coordinate label
    const viewportX = Math.round(corner.x / actualScaleX);
    const viewportY = Math.round(corner.y / actualScaleY);
    const coordText = `${viewportX},${viewportY}`;
    
    // Position label to avoid overlap
    const labelX = centerX + (corner.label.includes('L') ? -50 : 10);
    const labelY = centerY + (corner.label.includes('T') ? -20 : 10);
    
    await drawStructuredLabel(image, coordText, labelX, labelY, COORD_COLOR, TEXT_COLORS.BLACK, drawText);
  }
}

/**
 * Draws LLM-optimized box model labels with structured IDs and coordinates.
 * Uses Set-of-Mark approach with distinct IDs and high contrast colors.
 */
export async function drawBoxModelLabels(
  image: any,
  adjustedBoxModel: BoxModel,
  actualScaleX: number,
  actualScaleY: number,
  drawText: DrawTextFunction
): Promise<void> {
  // Calculate viewport coordinates (reverse the scaling)
  const viewportCoords = {
    margin: {
      x: Math.round(adjustedBoxModel.margin.x / actualScaleX),
      y: Math.round(adjustedBoxModel.margin.y / actualScaleY),
      width: Math.round(adjustedBoxModel.margin.width / actualScaleX),
      height: Math.round(adjustedBoxModel.margin.height / actualScaleY)
    },
    border: {
      x: Math.round(adjustedBoxModel.border.x / actualScaleX),
      y: Math.round(adjustedBoxModel.border.y / actualScaleY), 
      width: Math.round(adjustedBoxModel.border.width / actualScaleX),
      height: Math.round(adjustedBoxModel.border.height / actualScaleY)
    },
    padding: {
      x: Math.round(adjustedBoxModel.padding.x / actualScaleX),
      y: Math.round(adjustedBoxModel.padding.y / actualScaleY),
      width: Math.round(adjustedBoxModel.padding.width / actualScaleX),
      height: Math.round(adjustedBoxModel.padding.height / actualScaleY)
    },
    content: {
      x: Math.round(adjustedBoxModel.content.x / actualScaleX),
      y: Math.round(adjustedBoxModel.content.y / actualScaleY),
      width: Math.round(adjustedBoxModel.content.width / actualScaleX),
      height: Math.round(adjustedBoxModel.content.height / actualScaleY)
    }
  };
  
  // Draw ID labels at top-left corner of each box (Set-of-Mark style)
  // ID:1 - Margin (Red)
  const margin1X = Math.floor(adjustedBoxModel.margin.x + VISUAL_CONFIG.LABEL_PADDING);
  const margin1Y = Math.floor(adjustedBoxModel.margin.y + VISUAL_CONFIG.LABEL_PADDING);
  await drawStructuredLabel(image, `[1] ${viewportCoords.margin.x},${viewportCoords.margin.y} ${viewportCoords.margin.width}×${viewportCoords.margin.height}`, 
                           margin1X, margin1Y, BOX_MODEL_COLORS.MARGIN, TEXT_COLORS.WHITE, drawText);
  
  // ID:2 - Border (Green) - only if different from margin
  if (adjustedBoxModel.border.width !== adjustedBoxModel.margin.width || 
      adjustedBoxModel.border.height !== adjustedBoxModel.margin.height) {
    const border2X = Math.floor(adjustedBoxModel.border.x + VISUAL_CONFIG.LABEL_PADDING);
    const border2Y = Math.floor(adjustedBoxModel.border.y + VISUAL_CONFIG.LABEL_PADDING);
    await drawStructuredLabel(image, `[2] ${viewportCoords.border.x},${viewportCoords.border.y} ${viewportCoords.border.width}×${viewportCoords.border.height}`,
                             border2X, border2Y, BOX_MODEL_COLORS.BORDER, TEXT_COLORS.WHITE, drawText);
  }
  
  // ID:3 - Padding (Blue) - only if different from border
  if (adjustedBoxModel.padding.width !== adjustedBoxModel.border.width || 
      adjustedBoxModel.padding.height !== adjustedBoxModel.border.height) {
    const padding3X = Math.floor(adjustedBoxModel.padding.x + VISUAL_CONFIG.LABEL_PADDING);
    const padding3Y = Math.floor(adjustedBoxModel.padding.y + VISUAL_CONFIG.LABEL_PADDING);
    await drawStructuredLabel(image, `[3] ${viewportCoords.padding.x},${viewportCoords.padding.y} ${viewportCoords.padding.width}×${viewportCoords.padding.height}`,
                             padding3X, padding3Y, BOX_MODEL_COLORS.PADDING, TEXT_COLORS.WHITE, drawText);
  }
  
  // ID:4 - Content (Yellow)
  const content4X = Math.floor(adjustedBoxModel.content.x + VISUAL_CONFIG.LABEL_PADDING);
  const content4Y = Math.floor(adjustedBoxModel.content.y + VISUAL_CONFIG.LABEL_PADDING);
  await drawStructuredLabel(image, `[4] ${viewportCoords.content.x},${viewportCoords.content.y} ${viewportCoords.content.width}×${viewportCoords.content.height}`,
                           content4X, content4Y, BOX_MODEL_COLORS.CONTENT, TEXT_COLORS.BLACK, drawText);
  
  // Draw corner markers for precise coordinates
  await drawCornerMarkers(image, adjustedBoxModel, actualScaleX, actualScaleY, drawText);
}