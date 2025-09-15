import type { InspectElementArgs, MultiInspectionResult, ElementInspection, ElementRelationship, BoxModel, CascadeRule, GroupedStyles, Rect, ElementMetrics } from './types.js';
import { ensureChromeWithCDP, connectToTarget, CDPClient } from './cdp-client.js';
import { 
  DEFAULT_PROPERTY_GROUPS, 
  shouldIncludeProperty, 
  categorizeProperties, 
  type PropertyGroup 
} from './property-groups.js';
import { BrowserScripts } from './browser-scripts.js';
import { Jimp } from 'jimp';
import {
  FONT_CONFIG,
  VIEWPORT_CONFIG,
  VISUAL_CONFIG,
  BOX_MODEL_COLORS,
  BOX_MODEL_THICKNESS,
  TEXT_COLORS,
  RULER_CONFIG,
  CROSSHAIR_CONFIG,
  HIGHLIGHT_COLORS,
  FALLBACK_COLORS,
  ELEMENT_LIMITS
} from './constants.js';
import {
  drawRectangleOutline,
  drawRectangleFilled,
  drawStructuredLabel,
  drawSimpleLabel,
  drawCornerMarkers,
  drawBoxModelLabels,
  type DrawTextFunction
} from './drawing-utils.js';
import { renderTextOnImage } from './canvas-renderer.js';
import {
  viewportToScreenshot,
  transformBoxModel,
  calculateScalingFactors,
  scaleRect,
  adjustRectForClipping,
  type ClipRegion,
  type ScalingFactors
} from './coordinate-utils.js';
// CanvasKit initialization moved to canvas-renderer.ts module for better resource management

interface ViewportInfo {
  width: number;
  height: number;
}

// Reserved for future multi-element highlighting (currently CDP only supports single element)
// Note: HIGHLIGHT_COLORS now imported from constants.js

// Pixel tolerance for alignment detection
// Note: VISUAL_CONFIG.ALIGNMENT_TOLERANCE now imported from constants.js as VISUAL_CONFIG.ALIGNMENT_TOLERANCE

// Helper function to draw text on Jimp image using the canvas renderer module
async function drawTextOnJimpImage(
  jimpImage: any, 
  text: string, 
  x: number, 
  y: number, 
  fontSize: number = FONT_CONFIG.DEFAULT_SIZE, 
  color: string = '#000000',
  backgroundColor?: string
): Promise<void> {
  // Use the optimized canvas renderer instead of inline CanvasKit operations
  await renderTextOnImage(jimpImage, text, x, y, fontSize, color, backgroundColor);
}

// Viewport manipulation constants
// Note: Viewport constants now imported from constants.js as VIEWPORT_CONFIG

interface ViewportInfo {
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  scrollX: number;
  scrollY: number;
}

interface ElementPosition {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

async function getViewportInfo(cdp: CDPClient): Promise<ViewportInfo> {
  const metrics = await cdp.send('Page.getLayoutMetrics');
  return {
    width: metrics.cssVisualViewport?.clientWidth || VIEWPORT_CONFIG.DEFAULT_WIDTH,
    height: metrics.cssVisualViewport?.clientHeight || VIEWPORT_CONFIG.DEFAULT_HEIGHT,
    deviceScaleFactor: 1, // Use default - actual device scale is handled by Chrome automatically
    mobile: false,
    scrollX: metrics.cssVisualViewport?.pageLeft || 0,
    scrollY: metrics.cssVisualViewport?.pageTop || 0
  };
}

async function getElementMetrics(cdp: CDPClient, uniqueId: string): Promise<ElementMetrics | null> {
  const result = await cdp.send('Runtime.evaluate', {
    expression: BrowserScripts.getElementMetrics(uniqueId),
    returnByValue: true
  });

  if (result.exceptionDetails) {
    console.warn('Failed to get element metrics:', result.exceptionDetails);
    return null;
  }

  return result.result.value as ElementMetrics | null;
}

function convertElementMetricsToBoxModel(metrics: ElementMetrics): BoxModel {
  const { viewport, margin, padding, border } = metrics;
  
  // viewport from getBoundingClientRect() is ALWAYS the border box (content + padding + border)
  const borderBox = viewport;
  
  return {
    // Margin box (outermost) - expand border box by margins
    margin: {
      x: borderBox.x - margin.left,
      y: borderBox.y - margin.top,
      width: borderBox.width + margin.left + margin.right,
      height: borderBox.height + margin.top + margin.bottom
    },
    // Border box - exactly what getBoundingClientRect() returns
    border: {
      x: borderBox.x,
      y: borderBox.y,
      width: borderBox.width,
      height: borderBox.height
    },
    // Padding box - shrink border box by border widths
    padding: {
      x: borderBox.x + border.left,
      y: borderBox.y + border.top,
      width: borderBox.width - border.left - border.right,
      height: borderBox.height - border.top - border.bottom
    },
    // Content box - shrink padding box by padding
    content: {
      x: borderBox.x + border.left + padding.left,
      y: borderBox.y + border.top + padding.top,
      width: borderBox.width - border.left - border.right - padding.left - padding.right,
      height: borderBox.height - border.top - border.bottom - padding.top - padding.bottom
    }
  };
}


async function centerMultipleElements(cdp: CDPClient, uniqueIds: string[]): Promise<void> {
  await cdp.send('Runtime.evaluate', {
    expression: BrowserScripts.centerMultipleElements(uniqueIds)
  });
}


function calculateMultiElementZoom(elementPositions: ElementPosition[], viewport: ViewportInfo): number {
  // Calculate bounding box of all elements
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  elementPositions.forEach(pos => {
    const left = pos.centerX - pos.width / 2;
    const top = pos.centerY - pos.height / 2;
    const right = pos.centerX + pos.width / 2;
    const bottom = pos.centerY + pos.height / 2;
    
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  });
  
  const groupWidth = maxX - minX;
  const groupHeight = maxY - minY;
  const groupArea = groupWidth * groupHeight;
  const viewportArea = viewport.width * viewport.height;
  const coverage = groupArea / viewportArea;
  
  let zoomFactor = 1;
  
  if (coverage < VIEWPORT_CONFIG.MULTI_ZOOM_IN_THRESHOLD) {
    // Group too small, zoom in
    zoomFactor = Math.min(VIEWPORT_CONFIG.MAX_ZOOM_FACTOR, Math.sqrt(VIEWPORT_CONFIG.ZOOM_CALCULATION_RATIO / coverage));
  } else if (coverage > VIEWPORT_CONFIG.MULTI_ZOOM_OUT_THRESHOLD) {
    // Group too large, zoom out
    zoomFactor = Math.max(VIEWPORT_CONFIG.MIN_ZOOM_FACTOR, Math.sqrt(VIEWPORT_CONFIG.MULTI_ZOOM_OUT_RATIO / coverage));
  }
  
  return Math.round(zoomFactor * 100) / 100;
}


async function setViewportScale(cdp: CDPClient, viewport: ViewportInfo, zoomFactor: number): Promise<void> {
  await cdp.send('Emulation.setPageScaleFactor', {
    pageScaleFactor: zoomFactor
  });
}

async function resetViewportScale(cdp: CDPClient): Promise<void> {
  await cdp.send('Emulation.setPageScaleFactor', {
    pageScaleFactor: 1
  });
}

async function highlightElements(cdp: CDPClient, nodeIds: number[]): Promise<void> {
  // NOTE: This function is kept for compatibility but we no longer use CDP overlays
  // Highlighting is now done by drawing directly on screenshots in drawHighlightOnScreenshot()
  // Clear any existing overlay to ensure clean screenshots
  if (nodeIds.length > 0) {
    await cdp.send('Overlay.hideHighlight');
  }
}

/**
 * Draws highlight boxes directly on a screenshot image
 * This bypasses CDP overlay issues and works correctly with zoom
 */
async function drawHighlightOnScreenshot(
  screenshotBuffer: Buffer,
  boxModel: BoxModel,
  viewportInfo: ViewportInfo,
  clipRegion?: { x: number; y: number; width: number; height: number },
  zoomFactor: number = 1,
  elementMetrics?: ElementMetrics | null
): Promise<Buffer> {
  try {
    // Load screenshot into Jimp
    const image = await Jimp.read(screenshotBuffer);
    
    // Use canvas for text rendering since Jimp 1.x font loading is unreliable
    let font = 'available'; // We'll use canvas for all text rendering
    
    // Transform coordinates using the coordinate utilities
    const scalingFactors = calculateScalingFactors(
      viewportInfo,
      image.bitmap.width,
      image.bitmap.height,
      clipRegion
    );
    
    // Add comprehensive diagnostic logging
    console.error(`=== Screenshot Analysis ===`);
    console.error(`  Viewport: ${viewportInfo.width}x${viewportInfo.height}`);
    console.error(`  Clip region: ${clipRegion ? `${clipRegion.x},${clipRegion.y} ${clipRegion.width}x${clipRegion.height}` : 'none'}`);
    console.error(`  Actual screenshot: ${image.bitmap.width}x${image.bitmap.height}`);
    console.error(`  Scale factors: X=${scalingFactors.scaleX.toFixed(3)}, Y=${scalingFactors.scaleY.toFixed(3)}`);
    console.error(`  Box model margin before: ${boxModel.margin.x},${boxModel.margin.y} ${boxModel.margin.width}x${boxModel.margin.height}`);
    
    // Apply coordinate transformation using the utilities
    let adjustedBoxModel = transformBoxModel(boxModel, scalingFactors, clipRegion);
    console.error(`  Box model margin after transform: ${adjustedBoxModel.margin.x},${adjustedBoxModel.margin.y} ${adjustedBoxModel.margin.width}x${adjustedBoxModel.margin.height}`);
    
    // Draw LLM-optimized box model highlighting (high contrast, pure colors)
    // Using Set-of-Mark approach with distinct IDs and thick borders
    
    // Margin - ID:1, Pure Red
    drawRectangleOutline(image, adjustedBoxModel.margin, BOX_MODEL_COLORS.MARGIN, BOX_MODEL_THICKNESS.MARGIN);
    
    // Border - ID:2, Pure Green
    drawRectangleOutline(image, adjustedBoxModel.border, BOX_MODEL_COLORS.BORDER, BOX_MODEL_THICKNESS.BORDER);
    
    // Padding - ID:3, Pure Blue  
    drawRectangleOutline(image, adjustedBoxModel.padding, BOX_MODEL_COLORS.PADDING, BOX_MODEL_THICKNESS.PADDING);
    
    // Content - ID:4, Pure Yellow with solid fill
    drawRectangleFilled(image, adjustedBoxModel.content, BOX_MODEL_COLORS.CONTENT);
    drawRectangleOutline(image, adjustedBoxModel.content, BOX_MODEL_COLORS.CONTENT, BOX_MODEL_THICKNESS.CONTENT);
    
    // Add simple value labels on each highlighted area
    await drawBoxModelLabels(image, adjustedBoxModel, scalingFactors.scaleX, scalingFactors.scaleY, drawTextOnJimpImage);
    
    // Draw edge rulers with tick marks
    await drawEdgeRulers(image, font, viewportInfo, scalingFactors.scaleX, scalingFactors.scaleY, clipRegion);
    
    // Draw crosshair rulers extending from the element
    await drawRulers(image, font, adjustedBoxModel.border, image.bitmap.width, image.bitmap.height, scalingFactors.scaleX, scalingFactors.scaleY, clipRegion);
    
    // Return modified image as buffer
    return await image.getBuffer('image/png');
    
  } catch (error) {
    console.warn('Failed to draw highlight on screenshot:', error);
    // Return original screenshot if drawing fails
    return screenshotBuffer;
  }
}

// scaleRect and adjustRect functions moved to coordinate-utils.ts

// drawRectangleOutline function moved to drawing-utils.ts

// drawRectangleFilled function moved to drawing-utils.ts

// drawBoxModelLabels function moved to drawing-utils.ts

// drawStructuredLabel and drawCornerMarkers functions moved to drawing-utils.ts

// Legacy simple label function moved to drawing-utils.ts

async function drawEdgeRulers(
  image: any,
  font: any,
  viewportInfo: ViewportInfo,
  actualScaleX: number, 
  actualScaleY: number,
  clipRegion?: { x: number; y: number; width: number; height: number }
): Promise<void> {
  const imgWidth = image.bitmap.width;
  const imgHeight = image.bitmap.height;
  
  // Enhanced constants for better LLM visibility
  const RULER_THICKNESS = RULER_CONFIG.THICKNESS;
  const MAJOR_TICK_LENGTH = RULER_CONFIG.MAJOR_TICK_LENGTH;
  const MINOR_TICK_LENGTH = RULER_CONFIG.MINOR_TICK_LENGTH;
  const MAJOR_TICK_SPACING = RULER_CONFIG.MAJOR_TICK_SPACING; // Every 100px for main coordinates
  const MINOR_TICK_SPACING = RULER_CONFIG.MINOR_TICK_SPACING; // Every 50px for intermediate marks
  const rulerColor = TEXT_COLORS.BLACK; // Pure black for maximum contrast
  const tickColor = TEXT_COLORS.BLACK; // Pure black for ticks
  const minorTickColor = TEXT_COLORS.GRAY_DARK; // Dark gray for minor ticks
  const outlineColor = TEXT_COLORS.WHITE; // White outline for dark backgrounds
  
  // Calculate viewport coordinate range visible in screenshot
  const startViewportX = clipRegion ? clipRegion.x : 0;
  const startViewportY = clipRegion ? clipRegion.y : 0;
  const endViewportX = startViewportX + (imgWidth / actualScaleX);
  const endViewportY = startViewportY + (imgHeight / actualScaleY);
  
  // Draw top edge ruler with white outline (horizontal)
  for (let x = 0; x < imgWidth; x++) {
    for (let thickness = 0; thickness < RULER_THICKNESS + 2; thickness++) {
      if (thickness < imgHeight) {
        if (thickness === 0 || thickness === RULER_THICKNESS + 1) {
          // White outline
          image.setPixelColor(outlineColor >>> 0, x, thickness);
        } else {
          // Black ruler
          image.setPixelColor(rulerColor >>> 0, x, thickness);
        }
      }
    }
  }
  
  // Draw left edge ruler with white outline (vertical)
  for (let y = 0; y < imgHeight; y++) {
    for (let thickness = 0; thickness < RULER_THICKNESS + 2; thickness++) {
      if (thickness < imgWidth) {
        if (thickness === 0 || thickness === RULER_THICKNESS + 1) {
          // White outline
          image.setPixelColor(outlineColor >>> 0, thickness, y);
        } else {
          // Black ruler
          image.setPixelColor(rulerColor >>> 0, thickness, y);
        }
      }
    }
  }
  
  // Horizontal ticks on top ruler - enhanced visibility
  for (let viewportX = Math.ceil(startViewportX / MAJOR_TICK_SPACING) * MAJOR_TICK_SPACING; 
       viewportX <= endViewportX; 
       viewportX += MAJOR_TICK_SPACING) {
    const screenX = Math.floor((viewportX - startViewportX) * actualScaleX);
    if (screenX >= 2 && screenX < imgWidth - 2) {
      // Draw enhanced major tick with white outline
      for (let tickX = screenX - 2; tickX <= screenX + 2; tickX++) {
        if (tickX >= 0 && tickX < imgWidth) {
          for (let tickY = 0; tickY < MAJOR_TICK_LENGTH + 2; tickY++) {
            if (tickY < imgHeight) {
              if (tickY === 0 || tickY === MAJOR_TICK_LENGTH + 1 || 
                  tickX === screenX - 2 || tickX === screenX + 2) {
                // White outline
                image.setPixelColor(outlineColor >>> 0, tickX, tickY);
              } else if (Math.abs(tickX - screenX) <= 1) {
                // Black tick mark (3px wide)
                image.setPixelColor(tickColor >>> 0, tickX, tickY);
              }
            }
          }
        }
      }
      
      // Add coordinate label with white background for better readability
      if (font && screenX > 25 && screenX < imgWidth - 40) {
        const labelText = viewportX.toString();
        const labelX = screenX - 15;
        const labelY = MAJOR_TICK_LENGTH + 4;
        const labelWidth = labelText.length * 12; // Approximate character width
        const labelHeight = 16; // Approximate font height
        
        // Draw white background rectangle
        for (let x = labelX - 2; x < labelX + labelWidth + 2; x++) {
          for (let y = labelY - 2; y < labelY + labelHeight + 2; y++) {
            if (x >= 0 && x < imgWidth && y >= 0 && y < imgHeight) {
              image.setPixelColor(TEXT_COLORS.WHITE_SEMI >>> 0, x, y); // Semi-transparent white
            }
          }
        }
        
        // Print the coordinate value using canvas-based text rendering
        await drawTextOnJimpImage(image, labelText, labelX, labelY, 16, '#000000', 'rgba(255,255,255,0.9)');
      }
    }
  }
  
  // Vertical ticks on left ruler - enhanced visibility
  for (let viewportY = Math.ceil(startViewportY / MAJOR_TICK_SPACING) * MAJOR_TICK_SPACING;
       viewportY <= endViewportY;
       viewportY += MAJOR_TICK_SPACING) {
    const screenY = Math.floor((viewportY - startViewportY) * actualScaleY);
    if (screenY >= 2 && screenY < imgHeight - 2) {
      // Draw enhanced major tick with white outline
      for (let tickY = screenY - 2; tickY <= screenY + 2; tickY++) {
        if (tickY >= 0 && tickY < imgHeight) {
          for (let tickX = 0; tickX < MAJOR_TICK_LENGTH + 2; tickX++) {
            if (tickX < imgWidth) {
              if (tickX === 0 || tickX === MAJOR_TICK_LENGTH + 1 || 
                  tickY === screenY - 2 || tickY === screenY + 2) {
                // White outline
                image.setPixelColor(outlineColor >>> 0, tickX, tickY);
              } else if (Math.abs(tickY - screenY) <= 1) {
                // Black tick mark (3px wide)
                image.setPixelColor(tickColor >>> 0, tickX, tickY);
              }
            }
          }
        }
      }
      
      // Add coordinate label with white background for better readability
      if (font && screenY > 25 && screenY < imgHeight - 20) {
        const labelText = viewportY.toString();
        const labelX = MAJOR_TICK_LENGTH + 4;
        const labelY = screenY - 8;
        const labelWidth = labelText.length * 12; // Approximate character width
        const labelHeight = 16; // Approximate font height
        
        // Draw white background rectangle
        for (let x = labelX - 2; x < labelX + labelWidth + 2; x++) {
          for (let y = labelY - 2; y < labelY + labelHeight + 2; y++) {
            if (x >= 0 && x < imgWidth && y >= 0 && y < imgHeight) {
              image.setPixelColor(TEXT_COLORS.WHITE_SEMI >>> 0, x, y); // Semi-transparent white
            }
          }
        }
        
        // Print the coordinate value using canvas-based text rendering
        await drawTextOnJimpImage(image, labelText, labelX, labelY, 16, '#000000', 'rgba(255,255,255,0.9)');
      }
    }
  }
  
  // Add minor ticks for better granularity - horizontal
  for (let viewportX = Math.ceil(startViewportX / MINOR_TICK_SPACING) * MINOR_TICK_SPACING; 
       viewportX <= endViewportX; 
       viewportX += MINOR_TICK_SPACING) {
    // Skip if this is a major tick position
    if (viewportX % MAJOR_TICK_SPACING !== 0) {
      const screenX = Math.floor((viewportX - startViewportX) * actualScaleX);
      if (screenX >= 1 && screenX < imgWidth - 1) {
        // Draw smaller minor tick
        for (let tickX = screenX - 1; tickX <= screenX + 1; tickX++) {
          if (tickX >= 0 && tickX < imgWidth) {
            for (let tickY = 0; tickY < MINOR_TICK_LENGTH + 1; tickY++) {
              if (tickY < imgHeight) {
                if (tickY === 0 || tickY === MINOR_TICK_LENGTH || 
                    tickX === screenX - 1 || tickX === screenX + 1) {
                  // White outline
                  image.setPixelColor(outlineColor >>> 0, tickX, tickY);
                } else if (Math.abs(tickX - screenX) === 0) {
                  // Gray minor tick mark (1px wide)
                  image.setPixelColor(minorTickColor >>> 0, tickX, tickY);
                }
              }
            }
          }
        }
      }
    }
  }
  
  // Add minor ticks for better granularity - vertical
  for (let viewportY = Math.ceil(startViewportY / MINOR_TICK_SPACING) * MINOR_TICK_SPACING;
       viewportY <= endViewportY;
       viewportY += MINOR_TICK_SPACING) {
    // Skip if this is a major tick position
    if (viewportY % MAJOR_TICK_SPACING !== 0) {
      const screenY = Math.floor((viewportY - startViewportY) * actualScaleY);
      if (screenY >= 1 && screenY < imgHeight - 1) {
        // Draw smaller minor tick
        for (let tickY = screenY - 1; tickY <= screenY + 1; tickY++) {
          if (tickY >= 0 && tickY < imgHeight) {
            for (let tickX = 0; tickX < MINOR_TICK_LENGTH + 1; tickX++) {
              if (tickX < imgWidth) {
                if (tickX === 0 || tickX === MINOR_TICK_LENGTH || 
                    tickY === screenY - 1 || tickY === screenY + 1) {
                  // White outline
                  image.setPixelColor(outlineColor >>> 0, tickX, tickY);
                } else if (Math.abs(tickY - screenY) === 0) {
                  // Gray minor tick mark (1px wide)
                  image.setPixelColor(minorTickColor >>> 0, tickX, tickY);
                }
              }
            }
          }
        }
      }
    }
  }
}

async function drawRulers(
  image: any, 
  font: any,
  elementRect: Rect, 
  imgWidth: number, 
  imgHeight: number,
  actualScaleX: number, 
  actualScaleY: number,
  clipRegion?: { x: number; y: number; width: number; height: number }
): Promise<void> {
  // Enhanced crosshair constants for better LLM visibility
  const CROSSHAIR_THICKNESS = CROSSHAIR_CONFIG.THICKNESS;
  const DASH_LENGTH = CROSSHAIR_CONFIG.DASH_LENGTH;
  const GAP_LENGTH = CROSSHAIR_CONFIG.GAP_LENGTH;
  const rulerColor = CROSSHAIR_CONFIG.COLOR; // Enhanced magenta with better opacity
  const outlineColor = TEXT_COLORS.WHITE; // White outline for contrast
  
  // Calculate element center and dimensions in viewport coordinates
  const viewportCenterX = clipRegion ? 
    (elementRect.x + elementRect.width / 2) / actualScaleX + clipRegion.x :
    (elementRect.x + elementRect.width / 2) / actualScaleX;
  const viewportCenterY = clipRegion ?
    (elementRect.y + elementRect.height / 2) / actualScaleY + clipRegion.y :
    (elementRect.y + elementRect.height / 2) / actualScaleY;
  const viewportWidth = elementRect.width / actualScaleX;
  const viewportHeight = elementRect.height / actualScaleY;
  
  // Enhanced vertical crosshair at element's center with dashed pattern
  const centerX = Math.floor(elementRect.x + elementRect.width / 2);
  if (centerX >= 1 && centerX < imgWidth - 1) {
    for (let y = 0; y < imgHeight; y++) {
      const isDash = Math.floor(y / (DASH_LENGTH + GAP_LENGTH)) % 2 === 0 && 
                     (y % (DASH_LENGTH + GAP_LENGTH)) < DASH_LENGTH;
      if (isDash) {
        // Draw with outline for better visibility
        for (let thickness = -1; thickness <= 1; thickness++) {
          const drawX = centerX + thickness;
          if (drawX >= 0 && drawX < imgWidth) {
            if (Math.abs(thickness) === 1) {
              // White outline
              image.setPixelColor(outlineColor >>> 0, drawX, y);
            } else {
              // Magenta center line
              image.setPixelColor(rulerColor >>> 0, drawX, y);
            }
          }
        }
      }
    }
  }
  
  // Enhanced horizontal crosshair at element's center with dashed pattern
  const centerY = Math.floor(elementRect.y + elementRect.height / 2);
  if (centerY >= 1 && centerY < imgHeight - 1) {
    for (let x = 0; x < imgWidth; x++) {
      const isDash = Math.floor(x / (DASH_LENGTH + GAP_LENGTH)) % 2 === 0 && 
                     (x % (DASH_LENGTH + GAP_LENGTH)) < DASH_LENGTH;
      if (isDash) {
        // Draw with outline for better visibility
        for (let thickness = -1; thickness <= 1; thickness++) {
          const drawY = centerY + thickness;
          if (drawY >= 0 && drawY < imgHeight) {
            if (Math.abs(thickness) === 1) {
              // White outline
              image.setPixelColor(outlineColor >>> 0, x, drawY);
            } else {
              // Magenta center line
              image.setPixelColor(rulerColor >>> 0, x, drawY);
            }
          }
        }
      }
    }
  }
  
  // Add enhanced coordinate label at intersection with background
  if (font && centerX >= 30 && centerX < imgWidth - 80 && centerY >= 30 && centerY < imgHeight - 30) {
    const coordText = `(${Math.floor(viewportCenterX)},${Math.floor(viewportCenterY)})`;
    
    // Draw semi-transparent background for better readability
    const labelX = centerX + 8;
    const labelY = centerY + 8;
    const labelWidth = coordText.length * 7; // Approximate width
    const labelHeight = 14;
    
    // Background rectangle
    for (let x = labelX - 2; x < labelX + labelWidth + 2; x++) {
      for (let y = labelY - 2; y < labelY + labelHeight + 2; y++) {
        if (x >= 0 && x < imgWidth && y >= 0 && y < imgHeight) {
          image.setPixelColor(TEXT_COLORS.WHITE_FILL >>> 0, x, y); // Semi-transparent white
        }
      }
    }
    
    await drawTextOnJimpImage(image, coordText, labelX, labelY, 18, '#000000', 'rgba(255,255,255,0.9)');
  }
  
  // Add enhanced dimension label near the element with background
  if (font && centerX >= 30 && centerX < imgWidth - 100 && centerY >= 45) {
    const dimensionText = `${Math.floor(viewportWidth)}×${Math.floor(viewportHeight)}px`;
    
    // Draw semi-transparent background for better readability
    const labelX = centerX + 8;
    const labelY = centerY - 30;
    const labelWidth = dimensionText.length * 7; // Approximate width
    const labelHeight = 14;
    
    // Background rectangle
    for (let x = labelX - 2; x < labelX + labelWidth + 2; x++) {
      for (let y = labelY - 2; y < labelY + labelHeight + 2; y++) {
        if (x >= 0 && x < imgWidth && y >= 0 && y < imgHeight) {
          image.setPixelColor(TEXT_COLORS.WHITE_FILL >>> 0, x, y); // Semi-transparent white
        }
      }
    }
    
    await drawTextOnJimpImage(image, dimensionText, labelX, labelY, 18, '#000000', 'rgba(255,255,255,0.9)');
  }
}


/**
 * Inspects DOM elements on a webpage, automatically detecting single vs multiple elements.
 * Provides spatial relationship analysis for multiple elements - essential for AI agents
 * building pixel-perfect frontends. Uses temporary DOM attributes for element identification
 * to handle dynamic content and complex selectors.
 * 
 * @param args - Inspection parameters including selector, URL, property groups, and limits
 * @returns Single element result or multi-element result with spatial relationships
 */
export async function inspectElement(args: InspectElementArgs): Promise<MultiInspectionResult> {
  const { 
    css_selector, 
    url, 
    property_groups = DEFAULT_PROPERTY_GROUPS,
    css_edits,
    limit = 10
  } = args;
  
  // Get or launch Chrome instance
  const browser = await ensureChromeWithCDP();
  
  // Connect to target
  const ws = await connectToTarget(browser, url);
  const cdp = new CDPClient(ws);
  
  try {
    // These domains should already be enabled during navigation
    // But enable them again in case we're reusing a tab
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    await cdp.send('Page.enable');
    await cdp.send('Overlay.enable');
    
    // Get document with retry logic
    let doc;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        doc = await cdp.send('DOM.getDocument');
        if (doc && doc.root && doc.root.nodeId) {
          break;
        } else {
          throw new Error('Document root is empty or invalid');
        }
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error(`Failed to get document after ${maxAttempts} attempts: ${error}`);
        }
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 500 * attempts));
      }
    }

    // Find all matching elements using Runtime.evaluate
    // Note: We use temporary data-inspect-id attributes to handle complex selectors
    // and ensure we get the exact same elements when querying for node IDs
    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: BrowserScripts.markElementsWithIds(css_selector, limit),
      returnByValue: true
    });
    
    if (evalResult.exceptionDetails) {
      throw new Error(`Invalid CSS selector: ${css_selector}`);
    }
    
    const result = evalResult.result.value;
    if (result.error) {
      throw new Error(`Element not found: ${css_selector}`);
    }
    
    // Get node IDs for each marked element
    const nodeIds: number[] = [];
    for (const elementInfo of result) {
      const nodeResult = await cdp.send('DOM.querySelector', {
        nodeId: doc.root.nodeId,
        selector: `[data-inspect-id="${elementInfo.uniqueId}"]`
      });
      
      if (nodeResult.nodeId) {
        nodeIds.push(nodeResult.nodeId);
      }
    }
    
    if (nodeIds.length === 0) {
      throw new Error(`Element not found: ${css_selector}`);
    }
    
    // Always use multi-element inspection (single element is just array of 1)
    return await inspectMultipleElements(
      css_selector,
      nodeIds, 
      cdp, 
      property_groups as PropertyGroup[], 
      css_edits,
      args.autoCenter !== false, // Default to true unless explicitly disabled
      args.autoZoom !== false,   // Default to true unless explicitly disabled
      args.zoomFactor
    );
    
  } finally {
    // Clean up all data-inspect-id attributes before closing CDP
    try {
      await cdp.send('Runtime.evaluate', {
        expression: BrowserScripts.cleanupInspectIds()
      });
    } catch (cleanupError) {
      console.warn('Failed to clean up data-inspect-id attributes:', cleanupError);
    }
    cdp.close();
  }
}


async function inspectMultipleElements(
  selector: string,
  nodeIds: number[],
  cdp: CDPClient,
  property_groups: PropertyGroup[],
  css_edits?: Record<string, string>,
  autoCenter: boolean = true,
  autoZoom: boolean = true,
  zoomFactor?: number
): Promise<MultiInspectionResult> {
  const elements: ElementInspection[] = [];
  const nodeData: Array<{ selector: string, nodeId: number, uniqueId: string, boxModel: BoxModel, elementMetrics: ElementMetrics | null }> = [];
  const elementPositions: ElementPosition[] = [];
  
  let totalProperties = 0;
  let filteredProperties = 0;
  let totalRules = 0;
  let filteredRules = 0;
  
  // Get viewport info for centering and zoom calculations
  const viewportInfo = await getViewportInfo(cdp);
  const originalViewport = { ...viewportInfo };
  let appliedZoomFactor = 1;
  
  // Declare uniqueIds outside try block so it's available in cleanup
  const uniqueIds: string[] = [];
  
  try {
    // First pass: collect initial metrics and positions for all elements using JavaScript
    
    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i];
      
      // Apply CSS edits if provided
      if (css_edits && Object.keys(css_edits).length > 0) {
        await cdp.setInlineStyles(nodeId, css_edits);
      }
      
      // Create unique ID for element tracking
      const uniqueId = `_inspect_temp_${Date.now()}_${i}`;
      
      // CRITICAL FIX: Set unique ID directly on the element using CDP DOM.setAttributeValue
      try {
        await cdp.send('DOM.setAttributeValue', {
          nodeId: nodeId,
          name: 'data-inspect-id',
          value: uniqueId
        });
        console.error(`Set unique ID ${uniqueId} on nodeId ${nodeId} (element ${i + 1})`);
      } catch (error) {
        console.error(`Failed to set attribute on nodeId ${nodeId}:`, error);
        // Fallback to JavaScript approach
        await cdp.send('Runtime.evaluate', {
          expression: `
            (function() {
              const elements = document.querySelectorAll('${selector.replace(/'/g, "\\'")}');
              if (elements[${i}]) {
                elements[${i}].setAttribute('data-inspect-id', '${uniqueId}');
                console.log('Fallback: Set unique ID ${uniqueId} on element at index ${i}:', elements[${i}].tagName, elements[${i}].className, elements[${i}].id);
                return true;
              }
              console.error('Failed to set unique ID ${uniqueId} - no matching element found');
              return false;
            })()
          `
        });
      }
      uniqueIds.push(uniqueId);
      
      // Add small delay to ensure attribute is set
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Get element metrics using JavaScript for reliable coordinates (from working single-element approach)
      const elementMetrics = await getElementMetrics(cdp, uniqueId);
      if (!elementMetrics) {
        console.error(`Failed to get metrics for uniqueId: ${uniqueId}, nodeId: ${nodeId}, selector: ${selector}[${i}]`);
        throw new Error(`Unable to get element metrics for element ${i + 1} of ${nodeIds.length}: ${selector}. Element may not be visible.`);
      }
      
      console.error(`Element ${i}: Got metrics for ${uniqueId} - position: ${elementMetrics.viewport.x},${elementMetrics.viewport.y} size: ${elementMetrics.viewport.width}x${elementMetrics.viewport.height}`);
      
      const boxModel = convertElementMetricsToBoxModel(elementMetrics);
      
      // Store element position for centering and zoom calculations using reliable JavaScript coordinates
      const elementPosition: ElementPosition = {
        centerX: elementMetrics.viewport.x + elementMetrics.viewport.width / 2,
        centerY: elementMetrics.viewport.y + elementMetrics.viewport.height / 2,
        width: elementMetrics.viewport.width,
        height: elementMetrics.viewport.height
      };
      elementPositions.push(elementPosition);
      
      // Store for distance calculations and drawing
      nodeData.push({ 
        selector: `${selector}[${i}]`, 
        nodeId, 
        uniqueId,
        boxModel, 
        elementMetrics 
      });
    }
    
    // Apply centering based on bounding box (works for 1 or many elements)
    if (autoCenter && uniqueIds.length > 0) {
      await centerMultipleElements(cdp, uniqueIds);
      // Small delay to allow scroll to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Calculate and apply zoom if enabled
    if (autoZoom || zoomFactor) {
      if (zoomFactor) {
        // Clamp manual zoom factor to valid range
        appliedZoomFactor = Math.min(VIEWPORT_CONFIG.MAX_ZOOM_FACTOR, Math.max(VIEWPORT_CONFIG.MIN_ZOOM_FACTOR, zoomFactor));
      } else {
        appliedZoomFactor = calculateMultiElementZoom(elementPositions, viewportInfo);
      }
      
      if (appliedZoomFactor !== 1) {
        await setViewportScale(cdp, viewportInfo, appliedZoomFactor);
        // Small delay to allow zoom to apply
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // Second pass: process each element for styles and updated positions
    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i];
      
      // Get updated element metrics after centering and zooming using JavaScript
      const updatedMetrics = await getElementMetrics(cdp, nodeData[i].uniqueId);
      const boxModel = updatedMetrics ? 
        convertElementMetricsToBoxModel(updatedMetrics) : 
        nodeData[i].boxModel; // fallback to original
      
      // Update nodeData with new metrics and box model
      nodeData[i].boxModel = boxModel;
      nodeData[i].elementMetrics = updatedMetrics;
      
      // Get computed styles
      const computedStylesResult = await cdp.send('CSS.getComputedStyleForNode', { nodeId });
      const allComputedStyles = convertComputedStyles(computedStylesResult.computedStyle);
      const filteredComputedStyles = filterComputedStyles(allComputedStyles, property_groups, false);
      
      // Get matching CSS rules (cascade)
      const matchedStylesResult = await cdp.send('CSS.getMatchedStylesForNode', { nodeId });
      const allCascadeRules = convertCascadeRules(matchedStylesResult);
      const filteredCascadeRules = filterCascadeRules(allCascadeRules, property_groups, false);
      
      // Create grouped styles
      const groupedStyles = categorizeProperties(filteredComputedStyles);
      
      // Add to elements array
      elements.push({
        selector: `${selector}[${i}]`, // Add index for clarity
        computed_styles: filteredComputedStyles,
        grouped_styles: groupedStyles,
        cascade_rules: filteredCascadeRules,
        box_model: boxModel,
        applied_edits: css_edits && Object.keys(css_edits).length > 0 ? css_edits : undefined
      });
      
      // Accumulate stats
      totalProperties += Object.keys(allComputedStyles).length;
      filteredProperties += Object.keys(filteredComputedStyles).length;
      totalRules += allCascadeRules.length;
      filteredRules += filteredCascadeRules.length;
    }
  
    // Highlight the first element AFTER zoom to ensure correct coordinates
    await highlightElements(cdp, nodeIds);
    
    // Wait for highlight overlay to render
    await new Promise(resolve => setTimeout(resolve, 200));

    // CRITICAL FIX: Update all element metrics with post-zoom coordinates using JavaScript
    for (let i = 0; i < nodeIds.length; i++) {
      const updatedMetrics = await getElementMetrics(cdp, nodeData[i].uniqueId);
      if (updatedMetrics) {
        nodeData[i].elementMetrics = updatedMetrics;
        nodeData[i].boxModel = convertElementMetricsToBoxModel(updatedMetrics);
        // Update elements array with final box model
        elements[i].box_model = nodeData[i].boxModel;
      }
    }
  
  // Capture screenshot with all overlays (clip if zoomed)
  let screenshotOptions: any = { format: 'png' };
  
  if (appliedZoomFactor > 1 && nodeData.length > 0) {
    // Calculate bounding box for all elements using FINAL coordinates
    // After zoom, DOM.getBoxModel coordinates are already in viewport space
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const data of nodeData) {
      const box = data.boxModel.margin;
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    }
    
    // Add padding around the group (increased to include overlays)
    const padding = 100;
    const x = Math.max(0, Math.floor(minX - padding));
    const y = Math.max(0, Math.floor(minY - padding));
    const width = Math.max(1, Math.min(viewportInfo.width - x, 
                                     Math.ceil(maxX - minX + 2 * padding)));
    const height = Math.max(1, Math.min(viewportInfo.height - y,
                                      Math.ceil(maxY - minY + 2 * padding)));
    
    // Only apply clip if values are valid
    if (x >= 0 && y >= 0 && width > 0 && height > 0 && 
        x + width <= viewportInfo.width && y + height <= viewportInfo.height) {
      screenshotOptions.clip = { x, y, width, height, scale: 1 };
    }
  }
  
  const screenshotResult = await cdp.send('Page.captureScreenshot', screenshotOptions);
  
  if (!screenshotResult.data) {
    throw new Error('Failed to capture screenshot. The page may not be loaded or visible.');
  }
  
  // Draw custom highlights on the screenshot for all elements
  let screenshotBuffer: Buffer = Buffer.from(screenshotResult.data, 'base64');
  for (let i = 0; i < nodeData.length; i++) {
    screenshotBuffer = await drawHighlightOnScreenshot(
      screenshotBuffer,
      nodeData[i].boxModel,
      viewportInfo,
      screenshotOptions.clip,
      appliedZoomFactor,
      nodeData[i].elementMetrics  // Pass element metrics for accurate rendering
    );
  }
  const enhancedScreenshot = screenshotBuffer.toString('base64');
  
  // Clear all overlays
  await cdp.send('Overlay.hideHighlight');
  
  // Calculate relationships between elements
  const relationships = calculateElementRelationships(nodeData);
  
    const result: MultiInspectionResult = {
      elements,
      relationships,
      screenshot: `data:image/png;base64,${enhancedScreenshot}`,
      viewport_adjustments: {
        original_positions: elementPositions,
        centered: autoCenter,
        zoom_factor: appliedZoomFactor,
        original_viewport: originalViewport
      },
      stats: {
        total_properties: totalProperties,
        filtered_properties: filteredProperties,
        total_rules: totalRules,
        filtered_rules: filteredRules
      }
    };
    
    return result;
    
  } finally {
    // Clean up: restore viewport and remove temporary attributes
    try {
      if (appliedZoomFactor !== 1) {
        await resetViewportScale(cdp);
      }
      
      // Clean up all temporary data-inspect-id attributes
      for (const uniqueId of uniqueIds) {
        if (uniqueId.startsWith('_inspect_temp_')) {
          await cdp.send('Runtime.evaluate', {
            expression: BrowserScripts.cleanupTempId(uniqueId)
          });
        }
      }
    } catch (cleanupError) {
      // Don't throw cleanup errors, just log them
      console.warn('Multi-element cleanup failed:', cleanupError);
    }
  }
}

/**
 * Calculates spatial relationships between multiple DOM elements.
 * Essential for AI agents to understand layout patterns and apply consistent spacing.
 * Uses O(n²) pairwise comparison - acceptable given element limits (max 20, default 10).
 * 
 * @param nodeData - Array of elements with selectors, node IDs, and box models
 * @returns Array of pairwise relationships with distances and alignment data
 */
function calculateElementRelationships(
  nodeData: Array<{ selector: string, nodeId: number, boxModel: BoxModel }>
): ElementRelationship[] {
  const relationships: ElementRelationship[] = [];
  
  // Calculate relationships between each pair of elements
  for (let i = 0; i < nodeData.length; i++) {
    for (let j = i + 1; j < nodeData.length; j++) {
      const element1 = nodeData[i];
      const element2 = nodeData[j];
      
      const relationship = calculatePairwiseRelationship(element1, element2);
      relationships.push(relationship);
    }
  }
  
  return relationships;
}

function calculatePairwiseRelationship(
  element1: { selector: string, nodeId: number, boxModel: BoxModel },
  element2: { selector: string, nodeId: number, boxModel: BoxModel }
): ElementRelationship {
  const box1 = element1.boxModel.border; // Use border box for measurements
  const box2 = element2.boxModel.border;
  
  // Calculate element centers
  const center1 = {
    x: box1.x + box1.width / 2,
    y: box1.y + box1.height / 2
  };
  const center2 = {
    x: box2.x + box2.width / 2,
    y: box2.y + box2.height / 2
  };
  
  // Calculate distances
  const centerToCenterDistance = Math.sqrt(
    Math.pow(center2.x - center1.x, 2) + Math.pow(center2.y - center1.y, 2)
  );
  
  // Calculate edge-to-edge distances (most useful for spacing)
  let horizontalDistance = 0;
  let verticalDistance = 0;
  
  // Horizontal distance (gaps between left/right edges)
  if (box1.x + box1.width < box2.x) {
    // Element 1 is to the left of element 2
    horizontalDistance = box2.x - (box1.x + box1.width);
  } else if (box2.x + box2.width < box1.x) {
    // Element 2 is to the left of element 1
    horizontalDistance = box1.x - (box2.x + box2.width);
  } else {
    // Elements overlap horizontally
    horizontalDistance = 0;
  }
  
  // Vertical distance (gaps between top/bottom edges)
  if (box1.y + box1.height < box2.y) {
    // Element 1 is above element 2
    verticalDistance = box2.y - (box1.y + box1.height);
  } else if (box2.y + box2.height < box1.y) {
    // Element 2 is above element 1
    verticalDistance = box1.y - (box2.y + box2.height);
  } else {
    // Elements overlap vertically
    verticalDistance = 0;
  }
  
  // Calculate alignment (with tolerance for "close enough")
  const tolerance = VISUAL_CONFIG.ALIGNMENT_TOLERANCE;
  const alignment = {
    top: Math.abs(box1.y - box2.y) <= tolerance,
    bottom: Math.abs((box1.y + box1.height) - (box2.y + box2.height)) <= tolerance,
    left: Math.abs(box1.x - box2.x) <= tolerance,
    right: Math.abs((box1.x + box1.width) - (box2.x + box2.width)) <= tolerance,
    vertical_center: Math.abs(center1.y - center2.y) <= tolerance,
    horizontal_center: Math.abs(center1.x - center2.x) <= tolerance
  };
  
  return {
    from: element1.selector,
    to: element2.selector,
    distance: {
      horizontal: Math.round(horizontalDistance),
      vertical: Math.round(verticalDistance),
      center_to_center: Math.round(centerToCenterDistance)
    },
    alignment
  };
}


function quadToRect(quad: number[]) {
  // Convert quad [x1, y1, x2, y2, x3, y3, x4, y4] to rect
  const x = Math.min(quad[0], quad[2], quad[4], quad[6]);
  const y = Math.min(quad[1], quad[3], quad[5], quad[7]);
  const maxX = Math.max(quad[0], quad[2], quad[4], quad[6]);
  const maxY = Math.max(quad[1], quad[3], quad[5], quad[7]);
  
  return {
    x,
    y,
    width: maxX - x,
    height: maxY - y
  };
}

function convertComputedStyles(cdpComputedStyle: any[]): Record<string, string> {
  const styles: Record<string, string> = {};
  
  for (const style of cdpComputedStyle) {
    styles[style.name] = style.value;
  }
  
  return styles;
}

function convertCascadeRules(cdpMatchedStyles: any): CascadeRule[] {
  const rules: CascadeRule[] = [];
  
  // Process matched CSS rules
  if (cdpMatchedStyles.matchedCSSRules) {
    for (const rule of cdpMatchedStyles.matchedCSSRules) {
      if (rule.rule && rule.rule.style) {
        const properties: Record<string, string> = {};
        
        for (const property of rule.rule.style.cssProperties) {
          if (property.name && property.value) {
            properties[property.name] = property.value;
          }
        }
        
        rules.push({
          selector: rule.rule.selectorList?.selectors?.map((s: any) => s.text).join(', ') || 'unknown',
          source: rule.rule.origin === 'user-agent' ? 'user-agent' : 
                  rule.rule.styleSheetId ? `stylesheet:${rule.rule.styleSheetId}` : 'inline',
          specificity: calculateSpecificity(rule.rule.selectorList?.selectors?.[0]?.text || ''),
          properties
        });
      }
    }
  }
  
  // Process inherited styles if present
  if (cdpMatchedStyles.inherited) {
    for (const inherited of cdpMatchedStyles.inherited) {
      if (inherited.matchedCSSRules) {
        for (const rule of inherited.matchedCSSRules) {
          if (rule.rule && rule.rule.style) {
            const properties: Record<string, string> = {};
            
            for (const property of rule.rule.style.cssProperties) {
              if (property.name && property.value) {
                properties[property.name] = property.value;
              }
            }
            
            rules.push({
              selector: rule.rule.selectorList?.selectors?.map((s: any) => s.text).join(', ') || 'inherited',
              source: rule.rule.origin === 'user-agent' ? 'user-agent' : 
                      rule.rule.styleSheetId ? `stylesheet:${rule.rule.styleSheetId}` : 'inherited',
              specificity: calculateSpecificity(rule.rule.selectorList?.selectors?.[0]?.text || ''),
              properties
            });
          }
        }
      }
    }
  }
  
  return rules;
}

function calculateSpecificity(selector: string): string {
  // CSS specificity calculation
  // Format: inline,id,class,element
  let inline = 0;
  let ids = 0;
  let classes = 0;
  let elements = 0;
  
  if (!selector) return '0,0,0,0';
  
  // Count IDs (#id)
  ids = (selector.match(/#[\w-]+/g) || []).length;
  
  // Count classes (.class), attributes ([attr]), pseudo-classes (:hover)
  classes = (selector.match(/\.[\w-]+|\[[\w\-="':]+\]|:[\w-]+(?:\([^)]*\))?/g) || []).length;
  
  // Count elements (div, p, etc.) and pseudo-elements (::before)
  const elementMatches = selector.match(/\b[a-zA-Z][\w-]*\b|::[\w-]+/g) || [];
  elements = elementMatches.filter(match => 
    !match.startsWith('::') ? true : (elements++, false) // Count pseudo-elements separately but add to elements
  ).length;
  
  return `${inline},${ids},${classes},${elements}`;
}

function filterComputedStyles(
  styles: Record<string, string>, 
  requestedGroups: PropertyGroup[], 
  includeAll: boolean
): Record<string, string> {
  if (includeAll) {
    return styles;
  }
  
  const filtered: Record<string, string> = {};
  
  for (const [property, value] of Object.entries(styles)) {
    if (shouldIncludeProperty(property, requestedGroups, includeAll)) {
      // Truncate very long values for token efficiency
      const truncatedValue = truncateValue(property, value);
      filtered[property] = truncatedValue;
    }
  }
  
  return filtered;
}

function filterCascadeRules(
  rules: CascadeRule[], 
  requestedGroups: PropertyGroup[], 
  includeAll: boolean
): CascadeRule[] {
  if (includeAll) {
    return rules;
  }
  
  const filtered: CascadeRule[] = [];
  
  for (const rule of rules) {
    // Skip user-agent rules unless explicitly needed
    if (rule.source === 'user-agent' && !includeAll) {
      continue;
    }
    
    // Filter properties within the rule
    const filteredProperties: Record<string, string> = {};
    let hasRelevantProperties = false;
    
    for (const [property, value] of Object.entries(rule.properties)) {
      if (shouldIncludeProperty(property, requestedGroups, includeAll)) {
        filteredProperties[property] = truncateValue(property, value);
        hasRelevantProperties = true;
      }
    }
    
    // Only include rule if it has relevant properties
    if (hasRelevantProperties) {
      filtered.push({
        ...rule,
        properties: filteredProperties
      });
    }
  }
  
  return filtered;
}

function truncateValue(property: string, value: string): string {
  // Truncate very long values to reduce token usage
  if (value.length <= ELEMENT_LIMITS.MAX_PROPERTY_LENGTH) {
    return value;
  }
  
  // Special handling for font-family - keep first 3 fonts
  if (property === 'font-family') {
    const fonts = value.split(',').map(f => f.trim());
    if (fonts.length > 3) {
      return fonts.slice(0, 3).join(', ') + ', ...';
    }
  }
  
  // For other long values, truncate with ellipsis
  return value.substring(0, 97) + '...';
}