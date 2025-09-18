/**
 * Browser-side scripts that are injected into the page via Runtime.evaluate
 * These scripts run in the browser context and return data to the CDP client
 */

export const BrowserScripts = {
  /**
   * Gets comprehensive element metrics including box model dimensions
   */
  getElementMetrics: (uniqueId: string) => `
    (function() {
      const element = document.querySelector('[data-inspect-id="${uniqueId}"]');
      if (!element) return null;
      
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      
      // Get box-sizing to understand how dimensions work
      const boxSizing = styles.boxSizing || 'content-box';
      
      // getBoundingClientRect always returns border box
      const borderBox = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      };
      
      // Calculate margins, padding, border
      const margin = {
        top: parseFloat(styles.marginTop) || 0,
        right: parseFloat(styles.marginRight) || 0,
        bottom: parseFloat(styles.marginBottom) || 0,
        left: parseFloat(styles.marginLeft) || 0
      };
      
      const padding = {
        top: parseFloat(styles.paddingTop) || 0,
        right: parseFloat(styles.paddingRight) || 0,
        bottom: parseFloat(styles.paddingBottom) || 0,
        left: parseFloat(styles.paddingLeft) || 0
      };
      
      const border = {
        top: parseFloat(styles.borderTopWidth) || 0,
        right: parseFloat(styles.borderRightWidth) || 0,
        bottom: parseFloat(styles.borderBottomWidth) || 0,
        left: parseFloat(styles.borderLeftWidth) || 0
      };
      
      return {
        viewport: borderBox,
        boxSizing,
        page: {
          x: borderBox.x + (window.scrollX || window.pageXOffset || 0),
          y: borderBox.y + (window.scrollY || window.pageYOffset || 0),
          width: borderBox.width,
          height: borderBox.height
        },
        bodyOffset: {
          x: document.body.getBoundingClientRect().left,
          y: document.body.getBoundingClientRect().top
        },
        scroll: {
          x: window.scrollX || window.pageXOffset || 0,
          y: window.scrollY || window.pageYOffset || 0
        },
        viewportSize: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        margin,
        padding,
        border
      };
    })()
  `,


  /**
   * Centers multiple elements by finding their bounding box
   */
  centerMultipleElements: (uniqueIds: string[]) => `
    (function() {
      const elements = [${uniqueIds.map(id => `document.querySelector('[data-inspect-id="${id}"]')`).join(', ')}];
      const validElements = elements.filter(el => el !== null);
      
      if (validElements.length === 0) return;
      
      // Calculate bounding box of all elements
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;
      
      validElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        minX = Math.min(minX, rect.left);
        minY = Math.min(minY, rect.top);
        maxX = Math.max(maxX, rect.right);
        maxY = Math.max(maxY, rect.bottom);
      });
      
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const viewportCenterX = window.innerWidth / 2;
      const viewportCenterY = window.innerHeight / 2;
      
      window.scrollBy({
        left: centerX - viewportCenterX,
        top: centerY - viewportCenterY,
        behavior: 'instant'
      });
    })();
  `,

  /**
   * Finds or creates unique IDs for elements
   */
  findOrCreateUniqueId: (selector: string) => `
    (function() {
      const elements = document.querySelectorAll('${selector.replace(/'/g, "\\'")}');
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        if (element.getAttribute('data-inspect-id')) {
          return element.getAttribute('data-inspect-id');
        }
      }
      // If no data-inspect-id found, create a temporary one
      const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (element) {
        const uniqueId = '_inspect_temp_' + Date.now();
        element.setAttribute('data-inspect-id', uniqueId);
        return uniqueId;
      }
      return null;
    })();
  `,

  /**
   * Marks multiple elements with unique IDs for tracking
   */
  markElementsWithIds: (selector: string, limit: number) => `
    (function() {
      try {
        const elements = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
        if (elements.length === 0) return { error: 'No elements found' };
        
        return elements.slice(0, ${limit}).map((el, i) => {
          const uniqueId = '_inspect_' + Date.now() + '_' + i;
          el.setAttribute('data-inspect-id', uniqueId);
          return {
            index: i,
            uniqueId: uniqueId,
            tagName: el.tagName,
            id: el.id || null,
            className: el.className || null
          };
        });
      } catch (e) {
        return { error: e.message };
      }
    })()
  `,

  /**
   * Gets unique IDs for multiple elements (already marked)
   */
  getMultipleUniqueIds: (selector: string) => `
    (function() {
      const elements = Array.from(document.querySelectorAll('${selector.replace(/'/g, "\\'")}'));
      return elements.map((el, i) => {
        let uniqueId = el.getAttribute('data-inspect-id');
        if (!uniqueId) {
          uniqueId = '_inspect_temp_' + Date.now() + '_' + i;
          el.setAttribute('data-inspect-id', uniqueId);
        }
        return uniqueId;
      });
    })();
  `,

  /**
   * Cleans up all data-inspect-id attributes
   */
  cleanupInspectIds: () => `
    document.querySelectorAll('[data-inspect-id]').forEach(el => {
      el.removeAttribute('data-inspect-id');
    });
  `,

  /**
   * Removes a specific inspect ID if it's temporary
   */
  cleanupTempId: (uniqueId: string) => `
    const el = document.querySelector('[data-inspect-id="${uniqueId}"]');
    if (el) el.removeAttribute('data-inspect-id');
  `
};