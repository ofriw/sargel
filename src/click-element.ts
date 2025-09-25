import { ensureChromeWithCDP, connectToTarget, CDPClient } from './browser/cdp-client.js';
import { BrowserScripts } from './browser/browser-scripts.js';
import { parseSelector } from './browser/selector-utils.js';
import { getDocumentWithRetry, findAndMarkElements, cleanupInspectIds, formatElementNotFoundError, getElementDescriptions } from './browser/element-operations.js';
import { CLICK_CONFIG, ELEMENT_LIMITS } from './config/constants.js';
import type { ClickElementArgs, ClickResult } from './config/types.js';

/**
 * Clicks on a specific element and returns a screenshot
 *
 * Architecture Notes:
 * - Browser instance reuse is handled by cdp-client.ts singleton pattern
 * - Connection pooling between operations is a future enhancement opportunity
 * - Uses the same element marking strategy as inspect-element for consistency
 */
export async function clickElement(args: ClickElementArgs): Promise<ClickResult> {
  const { css_selector, url } = args;

  // Parse selector to handle index notation like "button[0]"
  const { selector, index } = parseSelector(css_selector);

  // Get or launch Chrome instance
  const browser = await ensureChromeWithCDP();

  // Connect to target
  const ws = await connectToTarget(browser, url);
  const cdp = new CDPClient(ws);

  try {
    // Enable required domains
    await cdp.send('DOM.enable');
    await cdp.send('Page.enable');

    // Get document with retry logic
    const doc = await getDocumentWithRetry(cdp);

    // Find all matching elements and mark them with IDs
    const result = await findAndMarkElements(cdp, selector, ELEMENT_LIMITS.DEFAULT);

    // Get element descriptions for error reporting
    const matchedElements = await getElementDescriptions(cdp, selector, 3);

    // Check if requested index exists
    if (index >= result.length) {
      throw new Error(formatElementNotFoundError(selector, index, result.length, matchedElements));
    }

    const targetElement = result[index];
    const uniqueId = targetElement.uniqueId;

    // Center the element in viewport to ensure it's clickable
    await cdp.send('Runtime.evaluate', {
      expression: BrowserScripts.centerMultipleElements([uniqueId])
    });

    // Wait for scrolling to settle
    await new Promise(resolve => setTimeout(resolve, CLICK_CONFIG.SCROLL_SETTLE_DELAY));

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
    await new Promise(resolve => setTimeout(resolve, CLICK_CONFIG.MOUSE_PRESS_DELAY));
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
    await new Promise(resolve => setTimeout(resolve, CLICK_CONFIG.CLICK_EFFECT_WAIT));

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

  } finally {
    // Clean up all data-inspect-id attributes
    await cleanupInspectIds(cdp);
    cdp.close();
  }
}

