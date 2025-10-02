import { BrowserScripts } from './browser/browser-scripts.js';
import { delay } from './browser/element-operations.js';
import { executeElementInteraction } from './browser/element-interaction.js';
import { centerElements } from './browser/scroll-operations.js';
import { INTERACTION_TIMING } from './config/constants.js';
import type { ClickElementArgs, ClickResult } from './config/types.js';

/**
 * Clicks on a specific element and returns a screenshot
 *
 * Architecture Notes:
 * - Uses shared element interaction wrapper for setup/teardown
 * - Browser instance reuse is handled by cdp-client.ts singleton pattern
 * - Connection pooling between operations is a future enhancement opportunity
 */
export async function clickElement(args: ClickElementArgs): Promise<ClickResult> {
  return executeElementInteraction(args, async (context) => {
    const { cdp, uniqueId, index, css_selector, matchedElements } = context;

    // Center the element in viewport to ensure it's clickable
    await centerElements(cdp, [uniqueId]);

    // Wait for scrolling to settle
    await delay(INTERACTION_TIMING.SCROLL_SETTLE_DELAY);

    // Get click coordinates for the target element
    const coordsResult = await cdp.send('Runtime.evaluate', {
      expression: BrowserScripts.getClickCoordinates(uniqueId),
      returnByValue: true
    });

    if (coordsResult.exceptionDetails) {
      throw new Error('Failed to get element coordinates');
    }

    const coords = coordsResult.result.value;
    if (coords.error) {
      throw new Error(`Cannot click element: ${coords.error}`);
    }

    // Perform the click using CDP
    const timestamp = Date.now() / 1000;

    // Mouse pressed event
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: coords.x,
      y: coords.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
      timestamp
    });

    // Mouse released event (with slight delay to simulate realistic click)
    await delay(INTERACTION_TIMING.MOUSE_PRESS_DELAY);
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: coords.x,
      y: coords.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
      timestamp: Date.now() / 1000
    });

    // Wait for any click effects to take place
    await delay(INTERACTION_TIMING.CLICK_EFFECT_WAIT);

    // Capture screenshot
    const screenshotResult = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      quality: 90
    });

    if (!screenshotResult.data) {
      throw new Error('Failed to capture screenshot after click');
    }

    // Get description for the clicked element
    const clickedElementDescription = matchedElements?.elements?.[index]?.text || '';

    return {
      clicked_element: {
        selector: css_selector,
        index,
        coordinates: {
          x: coords.x,
          y: coords.y
        },
        description: clickedElementDescription
      },
      matched_elements: matchedElements,
      screenshot: `data:image/png;base64,${screenshotResult.data}`
    };
  });
}

