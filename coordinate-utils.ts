/**
 * Coordinate transformation utilities for viewport-to-screenshot mapping.
 * Provides clean, testable functions for complex coordinate transformations.
 */

import type { Rect, BoxModel, ViewportInfo } from './types.js';

/**
 * Interface for clip region information
 */
export interface ClipRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Interface for scaling factors
 */
export interface ScalingFactors {
  scaleX: number;
  scaleY: number;
}

/**
 * Represents an element's position for viewport calculations
 */
export interface ElementPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Scale a rectangle by given factors
 */
export function scaleRect(rect: Rect, scaleX: number, scaleY: number): Rect {
  return {
    x: rect.x * scaleX,
    y: rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY
  };
}

/**
 * Adjust rectangle coordinates for clipping regions
 */
export function adjustRectForClipping(rect: Rect, clip: ClipRegion): Rect {
  return {
    x: rect.x - clip.x,
    y: rect.y - clip.y,
    width: rect.width,
    height: rect.height
  };
}

/**
 * Transform viewport coordinates to screenshot coordinates
 * This is the main coordinate transformation pipeline
 */
export function viewportToScreenshot(
  rect: Rect,
  scalingFactors: ScalingFactors,
  clipRegion?: ClipRegion
): Rect {
  let transformedRect = rect;

  // Step 1: Adjust for clipping first (translate from viewport to clip-relative coordinates)
  if (clipRegion) {
    transformedRect = adjustRectForClipping(transformedRect, clipRegion);
  }

  // Step 2: Then scale the clip-relative coordinates to screenshot space
  transformedRect = scaleRect(transformedRect, scalingFactors.scaleX, scalingFactors.scaleY);

  return transformedRect;
}

/**
 * Transform a complete box model from viewport to screenshot coordinates
 */
export function transformBoxModel(
  boxModel: BoxModel,
  scalingFactors: ScalingFactors,
  clipRegion?: ClipRegion
): BoxModel {
  return {
    content: viewportToScreenshot(boxModel.content, scalingFactors, clipRegion),
    padding: viewportToScreenshot(boxModel.padding, scalingFactors, clipRegion),
    border: viewportToScreenshot(boxModel.border, scalingFactors, clipRegion),
    margin: viewportToScreenshot(boxModel.margin, scalingFactors, clipRegion)
  };
}

/**
 * Calculate scaling factors based on viewport and screenshot information
 */
export function calculateScalingFactors(
  viewportInfo: ViewportInfo,
  screenshotWidth: number,
  screenshotHeight: number,
  clipRegion?: ClipRegion
): ScalingFactors {
  let effectiveViewportWidth = viewportInfo.width;
  let effectiveViewportHeight = viewportInfo.height;
  
  // If clipping is applied, the screenshot represents only a portion of the viewport
  if (clipRegion) {
    effectiveViewportWidth = clipRegion.width;
    effectiveViewportHeight = clipRegion.height;
  }
  
  return {
    scaleX: screenshotWidth / effectiveViewportWidth,
    scaleY: screenshotHeight / effectiveViewportHeight
  };
}

/**
 * Check if a rectangle is within bounds of another rectangle
 */
export function isRectWithinBounds(rect: Rect, bounds: Rect): boolean {
  return (
    rect.x >= bounds.x &&
    rect.y >= bounds.y &&
    rect.x + rect.width <= bounds.x + bounds.width &&
    rect.y + rect.height <= bounds.y + bounds.height
  );
}

/**
 * Clamp rectangle to fit within specified bounds
 */
export function clampRectToBounds(rect: Rect, bounds: Rect): Rect {
  const clampedX = Math.max(bounds.x, Math.min(rect.x, bounds.x + bounds.width - rect.width));
  const clampedY = Math.max(bounds.y, Math.min(rect.y, bounds.y + bounds.height - rect.height));
  const clampedWidth = Math.min(rect.width, bounds.x + bounds.width - clampedX);
  const clampedHeight = Math.min(rect.height, bounds.y + bounds.height - clampedY);
  
  return {
    x: clampedX,
    y: clampedY,
    width: Math.max(0, clampedWidth),
    height: Math.max(0, clampedHeight)
  };
}

/**
 * Calculate the intersection of two rectangles
 */
export function intersectRects(rect1: Rect, rect2: Rect): Rect | null {
  const x = Math.max(rect1.x, rect2.x);
  const y = Math.max(rect1.y, rect2.y);
  const right = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
  const bottom = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);
  
  const width = right - x;
  const height = bottom - y;
  
  if (width <= 0 || height <= 0) {
    return null; // No intersection
  }
  
  return { x, y, width, height };
}

/**
 * Calculate the union (bounding box) of multiple rectangles
 */
export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) {
    return null;
  }
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Convert element position to rectangle
 */
export function elementPositionToRect(position: ElementPosition): Rect {
  return {
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height
  };
}

/**
 * Calculate the center point of a rectangle
 */
export function getRectCenter(rect: Rect): { x: number; y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

/**
 * Calculate the area of a rectangle
 */
export function getRectArea(rect: Rect): number {
  return rect.width * rect.height;
}

/**
 * Check if two rectangles are equal within a tolerance
 */
export function areRectsEqual(rect1: Rect, rect2: Rect, tolerance: number = 0): boolean {
  return (
    Math.abs(rect1.x - rect2.x) <= tolerance &&
    Math.abs(rect1.y - rect2.y) <= tolerance &&
    Math.abs(rect1.width - rect2.width) <= tolerance &&
    Math.abs(rect1.height - rect2.height) <= tolerance
  );
}

/**
 * Create a rectangle from center point and dimensions
 */
export function createRectFromCenter(centerX: number, centerY: number, width: number, height: number): Rect {
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
  };
}

/**
 * Expand a rectangle by a given margin in all directions
 */
export function expandRect(rect: Rect, margin: number): Rect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + 2 * margin,
    height: rect.height + 2 * margin
  };
}

/**
 * Contract a rectangle by a given margin in all directions
 */
export function contractRect(rect: Rect, margin: number): Rect {
  const newWidth = Math.max(0, rect.width - 2 * margin);
  const newHeight = Math.max(0, rect.height - 2 * margin);
  
  return {
    x: rect.x + margin,
    y: rect.y + margin,
    width: newWidth,
    height: newHeight
  };
}