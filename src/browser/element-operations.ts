/**
 * Shared element operations for CDP clients
 * Common functionality used by both inspect-element and click-element
 */

import { CDPClient } from './cdp-client.js';
import { BrowserScripts } from './browser-scripts.js';

/**
 * Gets document with retry logic for cases where DOM is not ready
 */
export async function getDocumentWithRetry(cdp: CDPClient): Promise<any> {
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
      await new Promise(resolve => setTimeout(resolve, 500 * attempts));
    }
  }

  return doc;
}

/**
 * Finds and marks elements with temporary IDs for identification
 */
export async function findAndMarkElements(cdp: CDPClient, selector: string, limit: number = 20): Promise<any> {
  const evalResult = await cdp.send('Runtime.evaluate', {
    expression: BrowserScripts.markElementsWithIds(selector, limit),
    returnByValue: true
  });

  if (evalResult.exceptionDetails) {
    throw new Error(`Invalid CSS selector: ${selector}`);
  }

  const result = evalResult.result.value;
  if (result.error) {
    throw new Error(`Element not found: "${selector}"

Suggestions:
- Check if the page has fully loaded
- Try a more specific selector (add class or ID)
- Use inspect_element first to explore available elements
- For dynamic content, the element may not exist yet`);
  }

  return result;
}

/**
 * Gets element selectors and descriptions for error reporting
 */
export async function getElementDescriptions(cdp: CDPClient, selector: string, limit: number = 3): Promise<any> {
  const selectorsResult = await cdp.send('Runtime.evaluate', {
    expression: BrowserScripts.getElementSelectorsAndDescriptions(selector, limit),
    returnByValue: true
  });

  if (selectorsResult && !selectorsResult.exceptionDetails) {
    const selectorsData = selectorsResult.result.value;
    if (selectorsData && selectorsData.total > 0) {
      return {
        total: selectorsData.total,
        elements: selectorsData.elements
      };
    }
  }

  return undefined;
}

/**
 * Formats element not found error with available options
 */
export function formatElementNotFoundError(selector: string, index: number, resultLength: number, matchedElements?: any): string {
  let errorMessage = `Cannot click element at index ${index}.
Found ${resultLength} elements matching "${selector}":`;

  if (matchedElements?.elements?.length > 0) {
    matchedElements.elements.forEach((element: { selector: string; text: string }) => {
      const text = element.text ? `: "${element.text}"` : '';
      errorMessage += `\n- ${element.selector}${text}`;
    });

    if (matchedElements.total > matchedElements.elements.length) {
      const remaining = matchedElements.total - matchedElements.elements.length;
      errorMessage += `\n- ... and ${remaining} more element${remaining > 1 ? 's' : ''}`;
    }
  }

  errorMessage += `\n\nTry using one of the unique selectors above, or use index [0] to [${resultLength - 1}]`;
  return errorMessage;
}

/**
 * Cleans up temporary data-inspect-id attributes from elements
 */
export async function cleanupInspectIds(cdp: CDPClient): Promise<void> {
  try {
    await cdp.send('Runtime.evaluate', {
      expression: BrowserScripts.cleanupInspectIds()
    });
  } catch (cleanupError) {
    console.warn('Failed to clean up data-inspect-id attributes:', cleanupError);
  }
}