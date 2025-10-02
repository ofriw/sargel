/**
 * Shared element interaction wrapper
 * Handles common setup/teardown for click, scroll, and other element interaction tools
 * Implements Strategy pattern - tools provide action callback, this handles infrastructure
 */

import { ensureChromeWithCDP, connectToTarget, CDPClient } from './cdp-client.js';
import { parseSelector } from './selector-utils.js';
import {
  getDocumentWithRetry,
  findAndMarkElements,
  cleanupInspectIds,
  formatElementNotFoundError,
  getElementDescriptions,
  delay
} from './element-operations.js';
import { INTERACTION_TIMING, ELEMENT_LIMITS } from '../config/constants.js';

/**
 * Context provided to element interaction action callbacks
 */
export interface ElementInteractionContext {
  cdp: CDPClient;
  uniqueId: string;
  index: number;
  selector: string;
  css_selector: string;
  matchedElements: any;
}

/**
 * Execute an element interaction with shared setup/teardown
 *
 * @param args - Selector and URL
 * @param action - Tool-specific action to perform on the element
 * @returns Result from the action callback
 */
export async function executeElementInteraction<TResult>(
  args: { css_selector: string; url: string },
  action: (context: ElementInteractionContext) => Promise<TResult>
): Promise<TResult> {
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

    // Wait for page to be ready (allows dynamic content to render)
    await delay(INTERACTION_TIMING.PAGE_READY_WAIT);

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

    // Execute tool-specific action
    const context: ElementInteractionContext = {
      cdp,
      uniqueId,
      index,
      selector,
      css_selector,
      matchedElements
    };

    return await action(context);

  } finally {
    // Clean up all data-inspect-id attributes
    await cleanupInspectIds(cdp);
    cdp.close();
  }
}
