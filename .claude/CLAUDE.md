# Sargel Development Context

## Current Focus Areas
- Simplifying coordinate transformations
- Optimizing multi-element inspection performance
- Improving error messages for debugging

## Known Issues
- CanvasKit WASM dependency is heavy
- inspectMultipleElements() function too long (281 lines)
- Complex coordinate system transformations

## Conventions
- Use async/await consistently
- Clean up Chrome processes on error
- Limit elements to prevent memory issues
- Use Set-of-Mark with pure colors for AI visibility

## Code Patterns
- Strategy pattern for single vs multi-element inspection
- Adapter pattern for CDP response formatting
- Template method for browser script injection
- Observer pattern for CDP event handling

## Performance Notes
- Browser instances should be reused when possible
- Large screenshots consume significant memory
- Coordinate calculations can be expensive for many elements
- CDP operations have inherent network latency