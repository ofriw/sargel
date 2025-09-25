/**
 * CSS selector parsing utilities
 */

export interface ParsedSelector {
  selector: string;
  index: number;
}

/**
 * Parses CSS selector to extract base selector and index
 *
 * Examples:
 * - "button[0]" -> { selector: "button", index: 0 }
 * - "button" -> { selector: "button", index: 0 }
 * - ".test-button[5]" -> { selector: ".test-button", index: 5 }
 *
 * @param css_selector - CSS selector with optional index notation
 * @returns Object with base selector and index
 */
export function parseSelector(css_selector: string): ParsedSelector {
  const indexMatch = css_selector.match(/^(.+)\[(\d+)\]$/);

  if (indexMatch) {
    return {
      selector: indexMatch[1],
      index: parseInt(indexMatch[2], 10)
    };
  }

  return {
    selector: css_selector,
    index: 0
  };
}