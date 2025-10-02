import { delay } from './browser/element-operations.js';
import { executeElementInteraction } from './browser/element-interaction.js';
import { scrollToElements } from './browser/scroll-operations.js';
import { INTERACTION_TIMING } from './config/constants.js';
import type { ScrollElementArgs, ScrollElementResult } from './config/types.js';

/**
 * Scrolls to a specific element and returns a screenshot
 *
 * Architecture Notes:
 * - Uses shared element interaction wrapper for setup/teardown
 * - Uses shared scroll utilities from scroll-operations.ts
 * - Leaves page scrolled at target position for subsequent navigation
 */
export async function scrollElement(args: ScrollElementArgs): Promise<ScrollElementResult> {
  return executeElementInteraction(args, async (context) => {
    const { cdp, uniqueId, index, css_selector, matchedElements } = context;

    // Scroll to element using shared centering logic (same as click and inspect)
    const scrollResult = await scrollToElements(cdp, [uniqueId]);

    // Wait for scroll to settle
    await delay(INTERACTION_TIMING.SCROLL_SETTLE_DELAY);

    // Capture screenshot
    const screenshotResult = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      quality: 90
    });

    if (!screenshotResult.data) {
      throw new Error('Screenshot data is empty after scroll');
    }

    // Get description for the scrolled element
    const scrolledElementDescription = matchedElements?.elements?.[index]?.text || '';

    return {
      scrolled_element: {
        selector: css_selector,
        index,
        scroll_delta: scrollResult.scrollDelta,
        final_position: scrollResult.targetBounds,
        description: scrolledElementDescription
      },
      viewport_info: {
        scroll_position: scrollResult.finalScroll,
        size: scrollResult.viewportSize
      },
      matched_elements: matchedElements,
      screenshot: `data:image/png;base64,${screenshotResult.data}`
    };
  });
}