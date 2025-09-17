# SARGEL

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="wordmark-light-full.svg">
    <source media="(prefers-color-scheme: light)" srcset="wordmark-dark-full.svg">
    <img src="wordmark-dark-full.svg" alt="SARGEL" height="200">
  </picture>
</div>

<div align="center">
  <a href="https://www.npmjs.com/package/sargel">
    <img src="https://img.shields.io/npm/v/sargel.svg" alt="npm version">
  </a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/Node.js-24%2B-green.svg" alt="Node.js">
  </a>
  <img src="https://img.shields.io/badge/100%25%20AI-Generated-ff69b4.svg" alt="100% AI Generated">
</div>

**Visual debugging for pixel-perfect web development.**

Whether you're implementing designs or debugging CSS issues, this tool gives AI agents the ability to see and fix UI problems visually - just like using browser DevTools. Inspect elements, test CSS changes instantly, and iterate until perfect.

<img src="docs/images/hero-screenshot.png" width="800" alt="AI agent using SARGEL to visually inspect and debug a web element with highlighted overlays and detailed CSS analysis">

---

## The Problem

Getting CSS exactly right is hard. Designs don't match implementation, layouts break across browsers, spacing is off by a few pixels. The usual fix: back-and-forth screenshots, trial and error, and "close enough" compromises.

**The solution:** AI agents that can see your UI, understand what's wrong visually, test fixes instantly, and iterate until pixel-perfect.

---

## How It Works

<img src="docs/images/css-workflow.gif" width="700" alt="Visual demonstration of the inspect-edit-verify-iterate workflow">

1. **Inspect** - AI sees current state: styles, layout, visual issues
2. **Test** - Apply CSS edits and see results immediately
3. **Verify** - Get screenshot with changes applied
4. **Iterate** - Refine until perfect
5. **Apply** - Copy working CSS to your code

**The key:** Test changes visually before touching your source code.

---

## Example: Fixing Button Spacing

**Problem:** "The submit button is too close to the form fields"

```javascript
// Step 1: Inspect current state
{
  "tool": "inspect_element",
  "arguments": {
    "css_selector": ".submit-btn",
    "url": "https://myapp.com/form"
  }
}
// Returns: Screenshot + computed styles showing margin-top: 4px

// Step 2: Test a fix
{
  "tool": "inspect_element",
  "arguments": {
    "css_selector": ".submit-btn",
    "url": "https://myapp.com/form",
    "css_edits": {
      "margin-top": "16px"
    }
  }
}
// Returns: Updated screenshot showing improved spacing

// Step 3: Perfect it
{
  "css_edits": {
    "margin-top": "20px"
  }
}
// Returns: Perfect spacing

// Result: Add margin-top: 20px to your CSS
```

<img src="docs/images/css-edits-before.png" width="400" alt="Before: Button too close to form fields">
<img src="docs/images/css-edits-after.png" width="400" alt="After: Perfect button spacing">

*Before and after: Visual iteration until pixel-perfect*

---

## API Reference

### `inspect_element`

| Parameter | Type | Description |
|-----------|------|-------------|
| `css_selector` | string | CSS selector for target element(s) |
| `url` | string | Webpage URL to inspect |
| `css_edits` | object | **Test CSS changes** before applying to source |
| `property_groups` | array | Focus on: "layout", "colors", "typography", "positioning" |
| `limit` | number | Max elements when selector matches multiple (default: 10) |

### Response Format
```typescript
{
  screenshot: string;          // Base64 PNG with visual highlights
  computed_styles: object;     // Actual CSS property values
  cascade_rules: array;        // CSS rules in cascade order
  box_model: object;          // Margin, padding, border, content dimensions
  applied_edits?: object;     // CSS edits that were tested (if any)
}
```

---

## Technical Details

**Architecture:** MCP (Model Context Protocol) server using Chrome DevTools Protocol for DOM inspection and screenshot capture.

**Requirements:**
- Node.js 18+
- Chrome/Chromium browser
- AI agent with MCP support (Claude Desktop, Continue, etc.)

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Made for anyone who believes getting CSS right shouldn't be guesswork**
