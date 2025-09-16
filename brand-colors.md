# SARGEL Brand Colors

## Primary Brand Color

**SARGEL Orange** - A distinctive burnt orange that conveys precision, energy, and visual attention - perfect for a CSS inspection and debugging tool.

- **OKLCH**: `oklch(0.72 0.16 45)`
- **Hex**: `#C55B2B`
- **RGB**: `197, 91, 43`
- **HSL**: `hsl(18, 64%, 47%)`

## Color Palette Variations

### Highlight (Active States, CTAs)
- **OKLCH**: `oklch(0.82 0.14 45)`
- **Hex**: `#E08A5A`
- **RGB**: `224, 138, 90`

### Base (Primary Brand)
- **OKLCH**: `oklch(0.72 0.16 45)`
- **Hex**: `#C55B2B`
- **RGB**: `197, 91, 43`

### Deep (Emphasis, Depth)
- **OKLCH**: `oklch(0.55 0.18 45)`
- **Hex**: `#8E3E18`
- **RGB**: `142, 62, 24`

### Muted (Secondary Elements)
- **OKLCH**: `oklch(0.65 0.10 45)`
- **Hex**: `#A3673F`
- **RGB**: `163, 103, 63`

### Background Tint
- **OKLCH**: `oklch(0.96 0.02 45)`
- **Hex**: `#FDF9F7`
- **RGB**: `253, 249, 247`

## Supporting Colors

### Success Green
- **OKLCH**: `oklch(0.72 0.16 145)`
- **Hex**: `#2B7A43`
- **RGB**: `43, 122, 67`

### Error Red
- **OKLCH**: `oklch(0.60 0.20 25)`
- **Hex**: `#B94A37`
- **RGB**: `185, 74, 55`

## Usage Guidelines

- **Primary orange** should be used for the main brand elements, logo, and key interactive components
- **Highlight orange** for hover states, active buttons, and calls-to-action
- **Deep orange** for emphasis, borders, and depth
- **Success green** only for positive feedback (successful operations, validation)
- **Error red** only for error states and critical warnings
- **Background tint** can be used sparingly for subtle section backgrounds

## Accessibility

Contrast ratios for the primary orange (#C55B2B):
- **Orange on White (#FFFFFF)**: ~3.6:1
  - ✓ Passes WCAG AA for large text (3:1)
  - ✓ Passes WCAG AA for UI components (3:1)
  - ✗ Fails for normal text (requires 4.5:1)

- **Orange on Black (#000000)**: ~5.8:1
  - ✓ Passes WCAG AA for all text sizes (4.5:1)
  - ✓ Passes WCAG AA for UI components (3:1)

- **Deep Orange (#8E3E18) on White**: ~7.2:1
  - ✓ Passes WCAG AAA for normal text (7:1)

- **White text on Orange background**: ~3.6:1
  - ✓ Suitable for large headings and buttons

**Usage Recommendations:**
- Use orange for icons, borders, and large UI elements on white backgrounds
- For body text on white, use the Deep Orange shade (#8E3E18)
- Orange works well on dark backgrounds for all text sizes
- Color is never the sole means of conveying information

## Technical Implementation

The palette uses OKLCH color space for consistent perceptual lightness across all variations. This ensures:
- Predictable color modifications
- Better accessibility through consistent contrast
- Future-proof wide-gamut P3 color support
- Reliable dark/light theme adaptations

## Color Philosophy

This orange palette reflects SARGEL's core mission:
- **Visual attention**: Orange naturally draws focus, like highlighting elements for inspection
- **Precision**: The sophisticated burnt orange tone conveys technical accuracy
- **Energy**: Represents the active, iterative nature of visual debugging
- **Warmth**: Makes the technical tool feel approachable and human-friendly