/**
 * Canvas rendering module with optimized CanvasKit resource management.
 * Provides singleton CanvasKit initialization and text rendering services.
 */

import { FONT_CONFIG, FALLBACK_COLORS } from './constants.js';

// Global CanvasKit instance and resources
let CanvasKit: any = null;
let fontMgr: any = null;
let fontFamilyName: string = FONT_CONFIG.FAMILY_NAME;
let isInitialized: boolean = false;

/**
 * Singleton CanvasKit manager for efficient resource management
 */
export class CanvasRenderer {
  private static instance: CanvasRenderer | null = null;

  private constructor() {}

  /**
   * Get the singleton instance of CanvasRenderer
   */
  static getInstance(): CanvasRenderer {
    if (!CanvasRenderer.instance) {
      CanvasRenderer.instance = new CanvasRenderer();
    }
    return CanvasRenderer.instance;
  }

  /**
   * Initialize CanvasKit and load fonts (called once)
   */
  async initialize(): Promise<void> {
    if (isInitialized) {
      return; // Already initialized
    }

    try {
      // Initialize CanvasKit
      if (!CanvasKit) {
        // @ts-ignore
        const CanvasKitInit = await import('canvaskit-wasm');
        // @ts-ignore
        CanvasKit = await CanvasKitInit.default();
      }

      // Load JetBrains Mono Bold font for text rendering
      await this.loadFont();
      isInitialized = true;

    } catch (error) {
      console.error('Failed to initialize CanvasKit:', error);
      // Set fallback state - allow fallback rendering to proceed
      CanvasKit = null;
      fontMgr = null;
      isInitialized = false;
      // Don't throw the error - this allows fallback text rendering
    }
  }

  /**
   * Load the font file and initialize font manager
   */
  private async loadFont(): Promise<void> {
    try {
      // Load the font file using Node.js fs
      const fs = await import('fs/promises');
      const path = await import('path');
      const url = await import('url');
      
      // Get the current directory and construct font path
      const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
      const fontPath = path.join(__dirname, '..', 'assets', 'JetBrainsMono-Bold.ttf');
      
      // Read font file as Buffer and convert to ArrayBuffer
      const fontBuffer = await fs.readFile(fontPath);
      const fontData = fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength);
      
      // Create FontManager with the loaded font
      fontMgr = CanvasKit.FontMgr.FromData([fontData]);
      
      // Get the actual font family name from the loaded font
      const familyCount = fontMgr.countFamilies();
      if (familyCount > 0) {
        fontFamilyName = fontMgr.getFamilyName(0);
      } else {
        throw new Error('No fonts available in FontManager');
      }
    } catch (error) {
      console.error('Failed to load JetBrains Mono font:', error);
      // Fallback to empty font manager - don't throw error to allow fallback rendering
      try {
        fontMgr = CanvasKit.FontMgr.FromData([]);
      } catch (fallbackError) {
        console.error('Failed to create fallback font manager:', fallbackError);
        fontMgr = null;
      }
      // Don't throw the error - allow fallback rendering to proceed
    }
  }

  /**
   * Check if CanvasKit is properly initialized
   */
  isCanvasKitAvailable(): boolean {
    return isInitialized && CanvasKit !== null && fontMgr !== null;
  }

  /**
   * Render text on a Jimp image using CanvasKit with proper resource cleanup
   */
  async renderText(
    jimpImage: any,
    text: string,
    x: number,
    y: number,
    fontSize: number = FONT_CONFIG.DEFAULT_SIZE,
    color: string = '#000000',
    backgroundColor?: string
  ): Promise<void> {
    // Ensure initialization
    if (!this.isCanvasKitAvailable()) {
      await this.initialize();
    }

    // If CanvasKit is still unavailable, fall back to simple rectangle
    if (!this.isCanvasKitAvailable()) {
      this.drawFallbackText(jimpImage, text, x, y);
      return;
    }

    let surface: any = null;
    let builder: any = null;
    let paragraph: any = null;
    let img: any = null;
    
    try {
      // Estimate text dimensions for canvas size - minimal padding
      const textWidth = Math.max(
        text.length * fontSize * FONT_CONFIG.CHAR_WIDTH_RATIO + FONT_CONFIG.TEXT_PADDING, 
        FONT_CONFIG.MIN_TEXT_WIDTH
      );
      const textHeight = fontSize + FONT_CONFIG.TEXT_PADDING;
      
      // Create CanvasKit surface
      surface = CanvasKit.MakeSurface(Math.ceil(textWidth), Math.ceil(textHeight));
      if (!surface) {
        throw new Error('Failed to create CanvasKit surface');
      }
      
      const canvas = surface.getCanvas();
      
      // Clear canvas with background color if specified
      if (backgroundColor) {
        const bgColor = CanvasKit.parseColorString(backgroundColor);
        canvas.clear(bgColor);
      } else {
        canvas.clear(CanvasKit.TRANSPARENT);
      }
      
      // Create paragraph style with proper text styling
      const paraStyle = new CanvasKit.ParagraphStyle({
        textStyle: {
          color: CanvasKit.parseColorString(color),
          fontFamilies: [fontFamilyName],
          fontSize: fontSize,
        },
        textAlign: CanvasKit.TextAlign.Left,
        maxLines: 1, // Single line text
      });
      
      // Create paragraph builder
      builder = CanvasKit.ParagraphBuilder.Make(paraStyle, fontMgr);
      builder.addText(text);
      paragraph = builder.build();
      
      // Layout paragraph within the canvas width
      paragraph.layout(textWidth);
      
      // Draw paragraph - center within canvas
      canvas.drawParagraph(paragraph, FONT_CONFIG.TEXT_PADDING / 2, FONT_CONFIG.TEXT_PADDING / 2);
      
      // Get image data
      img = surface.makeImageSnapshot();
      const pngBytes = img.encodeToBytes();
      
      if (!pngBytes || pngBytes.length === 0) {
        throw new Error('Failed to encode text image to PNG bytes');
      }
      
      // Convert to Jimp image and composite
      const { Jimp } = await import('jimp');
      const textImage = await Jimp.read(Buffer.from(pngBytes));
      jimpImage.composite(textImage, x, y);
      
    } catch (error) {
      console.error('CanvasKit text rendering failed:', error);
      // Fall back to simple rectangle
      this.drawFallbackText(jimpImage, text, x, y);
      
    } finally {
      // Ensure proper cleanup of CanvasKit resources
      this.cleanupResources(paragraph, builder, img, surface);
    }
  }

  /**
   * Draw fallback text representation when CanvasKit fails
   */
  private drawFallbackText(jimpImage: any, text: string, x: number, y: number): void {
    // Improved fallback: Draw text outline instead of solid rectangle
    const outlineColor = FALLBACK_COLORS.OUTLINE;
    const fillColor = FALLBACK_COLORS.FILL;
    
    // Estimate text dimensions for fallback
    const fallbackWidth = Math.max(FONT_CONFIG.MIN_TEXT_WIDTH, text.length * FONT_CONFIG.FALLBACK_CHAR_WIDTH);
    const fallbackHeight = FONT_CONFIG.FALLBACK_TEXT_HEIGHT;
    
    // Draw white filled rectangle with black border as text placeholder
    for (let dx = 0; dx < fallbackWidth && x + dx < jimpImage.bitmap.width; dx++) {
      for (let dy = 0; dy < fallbackHeight && y + dy < jimpImage.bitmap.height; dy++) {
        if (dx === 0 || dx === fallbackWidth - 1 || dy === 0 || dy === fallbackHeight - 1) {
          // Border
          jimpImage.setPixelColor(outlineColor, x + dx, y + dy);
        } else {
          // Fill
          jimpImage.setPixelColor(fillColor, x + dx, y + dy);
        }
      }
    }
  }

  /**
   * Clean up CanvasKit resources to prevent memory leaks
   */
  private cleanupResources(paragraph: any, builder: any, img: any, surface: any): void {
    try {
      if (paragraph) paragraph.delete();
      if (builder) builder.delete();
      if (img) img.delete();
      if (surface) surface.delete();
    } catch (cleanupError) {
      console.warn('Error during CanvasKit resource cleanup:', cleanupError);
    }
  }

  /**
   * Get font information for external use
   */
  getFontInfo(): { familyName: string; isAvailable: boolean } {
    return {
      familyName: fontFamilyName,
      isAvailable: this.isCanvasKitAvailable()
    };
  }

  /**
   * Force reinitialization of CanvasKit (useful for testing)
   */
  async forceReinitialize(): Promise<void> {
    isInitialized = false;
    CanvasKit = null;
    fontMgr = null;
    await this.initialize();
  }
}

/**
 * Convenience function to get the singleton renderer instance
 */
export function getRenderer(): CanvasRenderer {
  return CanvasRenderer.getInstance();
}

/**
 * Convenience function for text rendering with automatic initialization
 */
export async function renderTextOnImage(
  jimpImage: any,
  text: string,
  x: number,
  y: number,
  fontSize?: number,
  color?: string,
  backgroundColor?: string
): Promise<void> {
  const renderer = getRenderer();
  await renderer.renderText(jimpImage, text, x, y, fontSize, color, backgroundColor);
}