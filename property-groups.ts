import type { GroupedStyles } from './types.js';

export const CSS_PROPERTY_GROUPS = {
  layout: [
    'display', 'visibility', 'float', 'clear', 'position', 'z-index',
    'overflow', 'overflow-x', 'overflow-y', 'overflow-wrap', 'word-wrap',
    'clip', 'clip-path'
  ] as string[],
  
  box: [
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border', 'border-width', 'border-style', 'border-color',
    'border-top', 'border-right', 'border-bottom', 'border-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-radius', 'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-left-radius', 'border-bottom-right-radius',
    'box-sizing', 'outline', 'outline-width', 'outline-style', 'outline-color', 'outline-offset'
  ] as string[],
  
  flexbox: [
    'flex', 'flex-direction', 'flex-wrap', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-basis',
    'justify-content', 'align-items', 'align-self', 'align-content', 'order'
  ] as string[],
  
  grid: [
    'grid', 'grid-template', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
    'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow', 'grid-area',
    'grid-column', 'grid-column-start', 'grid-column-end',
    'grid-row', 'grid-row-start', 'grid-row-end',
    'gap', 'grid-gap', 'column-gap', 'grid-column-gap', 'row-gap', 'grid-row-gap',
    'justify-items', 'justify-self', 'align-items', 'align-self', 'place-items', 'place-self'
  ] as string[],
  
  typography: [
    'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
    'font-stretch', 'font-size-adjust', 'line-height', 'letter-spacing', 'word-spacing',
    'text-align', 'text-decoration', 'text-transform', 'text-indent', 'text-shadow',
    'white-space', 'word-break', 'hyphens', 'writing-mode', 'text-orientation',
    'text-rendering', 'font-kerning', 'font-feature-settings', 'font-variant-caps',
    'font-variant-numeric', 'font-variant-ligatures'
  ] as string[],
  
  colors: [
    'color', 'background', 'background-color', 'background-image', 'background-repeat',
    'background-attachment', 'background-position', 'background-size', 'background-origin',
    'background-clip', 'opacity'
  ] as string[],
  
  visual: [
    'box-shadow', 'text-shadow', 'filter', 'backdrop-filter', 'transform', 'transform-origin',
    'transform-style', 'perspective', 'perspective-origin', 'backface-visibility',
    'transition', 'transition-property', 'transition-duration', 'transition-timing-function',
    'transition-delay', 'animation', 'animation-name', 'animation-duration',
    'animation-timing-function', 'animation-delay', 'animation-iteration-count',
    'animation-direction', 'animation-fill-mode', 'animation-play-state'
  ] as string[],
  
  positioning: [
    'top', 'right', 'bottom', 'left', 'inset', 'inset-block', 'inset-inline',
    'inset-block-start', 'inset-block-end', 'inset-inline-start', 'inset-inline-end'
  ] as string[],
  
  custom: [] as string[] // CSS custom properties (--*) are handled dynamically
};

export type PropertyGroup = keyof typeof CSS_PROPERTY_GROUPS;

export const DEFAULT_PROPERTY_GROUPS: PropertyGroup[] = ['layout', 'box', 'typography', 'colors'];

export const ESSENTIAL_PROPERTIES = [
  'display', 'position', 'width', 'height', 'margin', 'padding', 'border',
  'font-family', 'font-size', 'color', 'background-color'
];

export function getPropertiesForGroups(groups: PropertyGroup[]): string[] {
  const properties = new Set<string>();
  
  for (const group of groups) {
    if (group === 'custom') {
      continue; // Custom properties handled separately
    }
    
    const groupProperties = CSS_PROPERTY_GROUPS[group];
    if (groupProperties) {
      groupProperties.forEach(prop => properties.add(prop));
    }
  }
  
  return Array.from(properties);
}

export function isCustomProperty(propertyName: string): boolean {
  return propertyName.startsWith('--');
}

export function shouldIncludeProperty(
  propertyName: string, 
  requestedGroups: PropertyGroup[],
  includeAll: boolean = false
): boolean {
  if (includeAll) {
    return true;
  }
  
  // Always include essential properties regardless of groups
  if (ESSENTIAL_PROPERTIES.includes(propertyName)) {
    return true;
  }
  
  // Handle custom properties
  if (isCustomProperty(propertyName)) {
    return requestedGroups.includes('custom');
  }
  
  // Check if property belongs to any requested group
  const allowedProperties = getPropertiesForGroups(requestedGroups);
  return allowedProperties.includes(propertyName);
}

export function categorizeProperties(properties: Record<string, string>): GroupedStyles {
  const categorized: GroupedStyles = {
    layout: {},
    box: {},
    flexbox: {},
    grid: {},
    typography: {},
    colors: {},
    visual: {},
    positioning: {},
    custom: {}
  };
  
  for (const [property, value] of Object.entries(properties)) {
    if (isCustomProperty(property)) {
      categorized.custom[property] = value;
      continue;
    }
    
    let foundGroup = false;
    for (const [groupName, groupProperties] of Object.entries(CSS_PROPERTY_GROUPS)) {
      const typedGroupName = groupName as PropertyGroup;
      if (groupProperties.includes(property)) {
        categorized[typedGroupName][property] = value;
        foundGroup = true;
        break;
      }
    }
    
    // If not found in any group, add to layout as fallback
    if (!foundGroup) {
      categorized.layout[property] = value;
    }
  }
  
  return categorized;
}