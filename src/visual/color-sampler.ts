/**
 * Color sampling utilities for extracting background colors from element screenshots.
 * Samples from padding box (where background-color renders) with inset to avoid borders.
 */

import { Jimp } from 'jimp';
import type { BoxModel, ColorSample } from '../config/types.js';
import { COLOR_SAMPLING } from '../config/constants.js';
import { viewportToScreenshot, type ScalingFactors } from './coordinate-utils.js';

/**
 * Samples background color from element padding box corners.
 *
 * Strategy:
 * - Samples 4 corners of padding box with inset to avoid text and borders
 * - Uses padding box because that's where background-color renders (not content or border box)
 * - Corner sampling avoids centered text (buttons/headers) where center point would hit text
 * - Averages corner samples for robust color extraction
 *
 * Coordinate transformation:
 * - boxModel is in viewport coordinates (from browser)
 * - Screenshot is scaled by device pixel ratio (e.g., 2x on retina)
 * - Must transform: viewport → clip-relative → screenshot pixels
 *
 * @param screenshotImage - Jimp image instance of the screenshot
 * @param boxModel - Element box model with coordinates in viewport space
 * @param scalingFactors - Device pixel ratio scaling from viewport to screenshot
 * @param clipRegion - Optional clip region if screenshot was cropped
 * @returns RGBA background color with failure reason, or null if sampling fails
 */
export async function sampleElementColor(
  screenshotImage: Awaited<ReturnType<typeof Jimp.read>>,
  boxModel: BoxModel,
  scalingFactors: ScalingFactors,
  clipRegion?: { x: number; y: number; width: number; height: number }
): Promise<{ color: ColorSample | null; failureReason?: string }> {
  try {
    // Validate element is large enough for reliable sampling
    if (boxModel.padding.width < COLOR_SAMPLING.MIN_ELEMENT_SIZE ||
        boxModel.padding.height < COLOR_SAMPLING.MIN_ELEMENT_SIZE) {
      return {
        color: null,
        failureReason: `element too small (${boxModel.padding.width}×${boxModel.padding.height}px, minimum ${COLOR_SAMPLING.MIN_ELEMENT_SIZE}px)`
      };
    }

    // Validate padding box has valid coordinates
    if (boxModel.padding.x < 0 || boxModel.padding.y < 0) {
      return {
        color: null,
        failureReason: `invalid coordinates (${boxModel.padding.x},${boxModel.padding.y})`
      };
    }

    // Sample 4 corners with percentage-based inset to avoid borders and text
    const insetX = Math.min(
      COLOR_SAMPLING.MAX_INSET_PX,
      Math.max(COLOR_SAMPLING.MIN_INSET_PX, boxModel.padding.width * COLOR_SAMPLING.INSET_PERCENTAGE)
    );
    const insetY = Math.min(
      COLOR_SAMPLING.MAX_INSET_PX,
      Math.max(COLOR_SAMPLING.MIN_INSET_PX, boxModel.padding.height * COLOR_SAMPLING.INSET_PERCENTAGE)
    );

    const cornerPoints = [
      { x: boxModel.padding.x + insetX, y: boxModel.padding.y + insetY }, // Top-left
      { x: boxModel.padding.x + boxModel.padding.width - insetX, y: boxModel.padding.y + insetY }, // Top-right
      { x: boxModel.padding.x + insetX, y: boxModel.padding.y + boxModel.padding.height - insetY }, // Bottom-left
      { x: boxModel.padding.x + boxModel.padding.width - insetX, y: boxModel.padding.y + boxModel.padding.height - insetY }, // Bottom-right
    ];

    const samples: ColorSample[] = [];

    for (const point of cornerPoints) {
      // Transform viewport coordinates to screenshot pixels
      const samplePoint = { x: point.x, y: point.y, width: 1, height: 1 };
      const transformed = viewportToScreenshot(samplePoint, scalingFactors, clipRegion);
      const screenshotX = Math.floor(transformed.x);
      const screenshotY = Math.floor(transformed.y);

      // Validate bounds
      if (screenshotX < 0 || screenshotX >= screenshotImage.bitmap.width ||
          screenshotY < 0 || screenshotY >= screenshotImage.bitmap.height) {
        continue; // Skip out-of-bounds corners
      }

      try {
        // Sample pixel (Jimp returns 32-bit RGBA integer)
        const hex = screenshotImage.getPixelColor(screenshotX, screenshotY);

        // Decode RGBA components
        const r = (hex >> 24) & 0xFF;
        const g = (hex >> 16) & 0xFF;
        const b = (hex >> 8) & 0xFF;
        const a = (hex & 0xFF) / 255;

        // Skip nearly transparent samples (0.001 threshold filters rounding errors while keeping intentional transparency)
        if (a >= 0.001) {
          samples.push({ r, g, b, a });
        }
      } catch {
        continue; // Skip corners that fail to sample
      }
    }

    // Need at least 2 valid samples for reliability
    // (Single sample could be an outlier from anti-aliasing or subpixel rendering)
    if (samples.length < 2) {
      return {
        color: null,
        failureReason: samples.length === 0 ? 'all corners transparent or out of bounds' : 'insufficient valid samples'
      };
    }

    // Average the samples for final color
    const avgR = Math.round(samples.reduce((sum, s) => sum + s.r, 0) / samples.length);
    const avgG = Math.round(samples.reduce((sum, s) => sum + s.g, 0) / samples.length);
    const avgB = Math.round(samples.reduce((sum, s) => sum + s.b, 0) / samples.length);
    const avgA = samples.reduce((sum, s) => sum + s.a, 0) / samples.length;

    return { color: { r: avgR, g: avgG, b: avgB, a: avgA } };

  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'Error';
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { color: null, failureReason: `${errorName}: ${errorMessage}` };
  }
}

/**
 * Format a color sample as an rgba() CSS string.
 *
 * @param sample - RGBA color sample
 * @returns CSS rgba() string with 2 decimal places for alpha
 */
export function formatColorSample(sample: ColorSample): string {
  return `rgba(${sample.r},${sample.g},${sample.b},${sample.a.toFixed(2)})`;
}
