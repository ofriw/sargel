import { CDPClient } from './cdp-client.js';
import { BrowserScripts } from './browser-scripts.js';

export interface ScrollResult {
  scrollDelta: { x: number; y: number };
  finalScroll: { x: number; y: number };
  targetBounds: { x: number; y: number; width: number; height: number };
  viewportSize: { width: number; height: number };
}

/**
 * Scrolls to one or more elements by centering their bounding box in viewport
 * Uses the same scroll behavior across all tools (inspect, click, scroll)
 */
export async function scrollToElements(
  cdp: CDPClient,
  uniqueIds: string[]
): Promise<ScrollResult> {
  const result = await cdp.send('Runtime.evaluate', {
    expression: BrowserScripts.scrollToElements(uniqueIds),
    returnByValue: true
  });

  if (result.exceptionDetails) {
    throw new Error('Failed to scroll to elements');
  }

  const scrollResult = result.result.value;
  if (scrollResult.error) {
    throw new Error(`Scroll failed: ${scrollResult.error}`);
  }

  return scrollResult;
}

/**
 * Centers elements in viewport (alias for scrollToElements)
 */
export async function centerElements(cdp: CDPClient, uniqueIds: string[]): Promise<void> {
  await scrollToElements(cdp, uniqueIds);
}