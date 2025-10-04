export function parseMarkdownDiagnostic(markdown) {
  const result = {};

  // Check if it's multi-element format
  const multiElementMatch = markdown.match(/^#\s+(\d+)\s+elements?/m);
  if (multiElementMatch) {
    result.elements = [];
    const elementCount = parseInt(multiElementMatch[1]);

    // Parse each element section
    const elementSections = markdown.split(/^## /m).slice(1);
    for (let i = 0; i < Math.min(elementCount, elementSections.length); i++) {
      const section = elementSections[i];
      const element = parseElementSection(section);
      result.elements.push(element);
    }

    // Parse relationships if present
    const relationsMatch = markdown.match(/## relations\n([\s\S]*?)(?=\n##|$)/);
    if (relationsMatch) {
      result.relationships = parseRelationships(relationsMatch[1]);
    }

    // Parse viewport info
    const viewportMatch = markdown.match(/viewport:\s*(\d+)x(\d+)\s+zoom:([\d.]+)x\s+centered:(true|false)/);
    if (viewportMatch) {
      result.viewport_adjustments = {
        original_viewport: {
          width: parseInt(viewportMatch[1]),
          height: parseInt(viewportMatch[2])
        },
        zoom_factor: parseFloat(viewportMatch[3]),
        centered: viewportMatch[4] === 'true'
      };

      // Parse positions for multi-element
      const positionsMatch = markdown.match(/positions:\n([\s\S]*?)(?=\n[a-z]|$)/);
      if (positionsMatch) {
        result.viewport_adjustments.original_positions = [];
        const positionLines = positionsMatch[1].trim().split('\n');
        for (const line of positionLines) {
          const posMatch = line.match(/(\d+):\s*([\d.]+),([\d.]+),([\d.]+)x([\d.]+)/);
          if (posMatch) {
            result.viewport_adjustments.original_positions.push({
              centerX: parseFloat(posMatch[2]),
              centerY: parseFloat(posMatch[3]),
              width: parseFloat(posMatch[4]),
              height: parseFloat(posMatch[5])
            });
          }
        }
      }
    }
  } else {
    // Error: No multi-element header found - this shouldn't happen with new format
    throw new Error('Invalid markdown format: expected "# N element(s)" header');
  }

  // Parse stats if present
  const statsMatch = markdown.match(/stats:\s*(\d+)→(\d+)\s+properties,\s*(\d+)→(\d+)\s+rules/);
  if (statsMatch) {
    result.stats = {
      total_properties: parseInt(statsMatch[1]),
      filtered_properties: parseInt(statsMatch[2]),
      total_rules: parseInt(statsMatch[3]),
      filtered_rules: parseInt(statsMatch[4])
    };
  }

  return result;
}

function parseElementSection(section) {
  const element = {
    computed_styles: {},
    cascade_rules: []
  };

  // Extract selector from header
  const selectorMatch = section.match(/^([^#\n]+)/);
  if (selectorMatch) {
    element.selector = selectorMatch[1].trim();
  }

  // Parse box model (handle both integers and decimals)
  const boxMatch = section.match(/box:\s*([\d.]+),([\d.]+),([\d.]+)x([\d.]+)/);
  if (boxMatch) {
    element.box_model = {
      content: {
        x: parseFloat(boxMatch[1]),
        y: parseFloat(boxMatch[2]),
        width: parseFloat(boxMatch[3]),
        height: parseFloat(boxMatch[4])
      }
    };
  }

  // Parse padding
  const paddingMatch = section.match(/padding:\s*([\d.]+),([\d.]+),([\d.]+)x([\d.]+)/);
  if (paddingMatch && element.box_model) {
    element.box_model.padding = {
      x: parseFloat(paddingMatch[1]),
      y: parseFloat(paddingMatch[2]),
      width: parseFloat(paddingMatch[3]),
      height: parseFloat(paddingMatch[4])
    };
  }

  // Parse border
  const borderMatch = section.match(/border:\s*([\d.]+),([\d.]+),([\d.]+)x([\d.]+)/);
  if (borderMatch && element.box_model) {
    element.box_model.border = {
      x: parseFloat(borderMatch[1]),
      y: parseFloat(borderMatch[2]),
      width: parseFloat(borderMatch[3]),
      height: parseFloat(borderMatch[4])
    };
  }

  // Parse margin
  const marginMatch = section.match(/margin:\s*([\d.]+),([\d.]+),([\d.]+)x([\d.]+)/);
  if (marginMatch && element.box_model) {
    element.box_model.margin = {
      x: parseFloat(marginMatch[1]),
      y: parseFloat(marginMatch[2]),
      width: parseFloat(marginMatch[3]),
      height: parseFloat(marginMatch[4])
    };
  }

  // Parse computed styles from key:value lines
  const styleLines = section.match(/^[a-z-]+:[^:\n].*$/gm);
  if (styleLines) {
    for (const line of styleLines) {
      // Use regex to match property:value pairs, handling complex values like rgb(r,g,b)
      const matches = line.matchAll(/([a-z-]+):\s*(.+?)(?=\s+[a-z-]+:|$)/g);
      for (const match of matches) {
        const key = match[1];
        const value = match[2];
        if (key && value) {
          element.computed_styles[key] = value;
        }
      }
    }
  }

  // Parse cascade rules
  const cascadeMatch = section.match(/cascade:\n([\s\S]*?)(?=\n[a-z]|$)/);
  if (cascadeMatch) {
    const cascadeLines = cascadeMatch[1].trim().split('\n');
    for (const line of cascadeLines) {
      const ruleMatch = line.match(/^([^[]+)\[([^\]]+)\]\s+(.*)$/);
      if (ruleMatch) {
        const rule = {
          selector: ruleMatch[1].trim(),
          specificity: ruleMatch[2],
          properties: {}
        };

        const props = ruleMatch[3].split(/\s+/);
        for (const prop of props) {
          const [key, value] = prop.split(':');
          if (key && value) {
            rule.properties[key] = value;
          }
        }
        element.cascade_rules.push(rule);
      }
    }
  }

  // Parse applied edits
  const editsMatch = section.match(/edits:\n([\s\S]*?)(?=\n(?:sampled_background|colors):|$)/);
  if (editsMatch) {
    element.applied_edits = {};
    const editLines = editsMatch[1].trim().split('\n');
    for (const line of editLines) {
      const [key, value] = line.split(':');
      if (key && value) {
        element.applied_edits[key.trim()] = value.trim();
      }
    }
  }

  // Parse sampled background color
  const sampledBgMatch = section.match(/sampled_background:\n([\s\S]*?)(?:\n\n|$)/);
  if (sampledBgMatch) {
    element.sampled_background_color = {
      background: null
    };
    const colorLines = sampledBgMatch[1].trim().split('\n').filter(line => line.trim());
    for (const line of colorLines) {
      const colorMatch = line.match(/^color:\s*(.+?)(?:\s*#.*)?$/);
      if (colorMatch) {
        const colorValue = colorMatch[1].trim();
        if (colorValue.startsWith('unavailable')) {
          // Parse failure reason if present: "unavailable (reason)"
          const reasonMatch = colorValue.match(/unavailable\s*\(([^)]+)\)/);
          element.sampled_background_color.background = null;
          if (reasonMatch) {
            element.sampled_background_color.failureReason = reasonMatch[1].trim();
          }
        } else {
          // Parse rgba values
          const rgbaMatch = colorValue.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
          if (rgbaMatch) {
            element.sampled_background_color.background = {
              r: parseInt(rgbaMatch[1]),
              g: parseInt(rgbaMatch[2]),
              b: parseInt(rgbaMatch[3]),
              a: parseFloat(rgbaMatch[4])
            };
          }
        }
      }
    }
  }

  // Create grouped_styles for compatibility
  element.grouped_styles = createGroupedStyles(element.computed_styles);

  return element;
}

function createGroupedStyles(computed_styles) {
  const groups = {
    layout: {},
    box: {},
    flexbox: {},
    grid: {},
    typography: {},
    colors: {},
    positioning: {},
    visual: {},
    custom: {}
  };

  const groupMappings = {
    layout: ['display', 'visibility', 'float', 'clear', 'position', 'z-index', 'overflow', 'overflow-x', 'overflow-y', 'overflow-wrap', 'word-wrap', 'clip', 'clip-path'],
    box: ['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border', 'border-width', 'border-style', 'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius', 'box-sizing', 'outline', 'outline-width', 'outline-style', 'outline-color', 'outline-offset'],
    flexbox: ['flex', 'flex-direction', 'flex-wrap', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-basis', 'justify-content', 'align-items', 'align-self', 'align-content', 'order'],
    grid: ['grid', 'grid-template', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow', 'grid-area', 'grid-column', 'grid-column-start', 'grid-column-end', 'grid-row', 'grid-row-start', 'grid-row-end', 'gap', 'grid-gap', 'column-gap', 'grid-column-gap', 'row-gap', 'grid-row-gap', 'justify-items', 'justify-self', 'place-items', 'place-self'],
    typography: ['font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-stretch', 'font-size-adjust', 'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-decoration', 'text-transform', 'text-indent', 'text-shadow', 'white-space', 'word-break', 'hyphens', 'writing-mode', 'text-orientation', 'text-rendering', 'font-kerning', 'font-feature-settings', 'font-variant-caps', 'font-variant-numeric', 'font-variant-ligatures'],
    colors: ['color', 'background', 'background-color', 'background-image', 'background-repeat', 'background-attachment', 'background-position', 'background-size', 'background-origin', 'background-clip', 'opacity'],
    positioning: ['top', 'right', 'bottom', 'left', 'inset', 'inset-block', 'inset-inline', 'inset-block-start', 'inset-block-end', 'inset-inline-start', 'inset-inline-end'],
    visual: ['box-shadow', 'text-shadow', 'filter', 'backdrop-filter', 'transform', 'transform-origin', 'transform-style', 'perspective', 'perspective-origin', 'backface-visibility', 'transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay', 'animation', 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode', 'animation-play-state']
  };

  for (const [prop, value] of Object.entries(computed_styles)) {
    // Handle custom properties (CSS variables)
    if (prop.startsWith('--')) {
      groups.custom[prop] = value;
      continue;
    }

    let grouped = false;
    for (const [groupName, groupProps] of Object.entries(groupMappings)) {
      if (groupProps.some(gp => prop.startsWith(gp))) {
        groups[groupName][prop] = value;
        grouped = true;
        break;
      }
    }
    // If not grouped, put in visual
    if (!grouped) {
      groups.visual[prop] = value;
    }
  }

  // Remove empty groups
  for (const [groupName, groupStyles] of Object.entries(groups)) {
    if (Object.keys(groupStyles).length === 0) {
      delete groups[groupName];
    }
  }

  return groups;
}

function parseRelationships(relationsText) {
  const relationships = [];
  const lines = relationsText.trim().split('\n');

  for (const line of lines) {
    const match = line.match(/^([^→]+)→([^:]+):\s*(\d+),(\d+),(\d+)px(?:\s+(.*))?$/);
    if (match) {
      const rel = {
        from: match[1].trim(),
        to: match[2].trim(),
        distance: {
          horizontal: parseInt(match[3]),
          vertical: parseInt(match[4]),
          center_to_center: parseInt(match[5])
        },
        alignment: {
          top: false,
          bottom: false,
          left: false,
          right: false,
          vertical_center: false,
          horizontal_center: false
        }
      };

      if (match[6]) {
        const alignments = match[6].split(',');
        for (const align of alignments) {
          const trimmed = align.trim();
          if (rel.alignment.hasOwnProperty(trimmed)) {
            rel.alignment[trimmed] = true;
          } else if (trimmed === 'vcenter') {
            rel.alignment.vertical_center = true;
          } else if (trimmed === 'hcenter') {
            rel.alignment.horizontal_center = true;
          }
        }
      }

      relationships.push(rel);
    }
  }

  return relationships;
}