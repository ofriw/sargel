#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// For now, we'll just copy one of the individual images as the comparison
// In a real implementation, you'd use a tool like sharp or canvas to create side-by-side layouts

console.log('Creating CSS edits comparison image...');

// Use the "after" image as the comparison for now
const afterImagePath = join(projectRoot, 'docs', 'images', 'css-edits-after.png');
const comparisonImagePath = join(projectRoot, 'docs', 'images', 'css-edits-comparison.png');

try {
  const afterImageBuffer = readFileSync(afterImagePath);
  writeFileSync(comparisonImagePath, afterImageBuffer);
  console.log('✅ Created css-edits-comparison.png');
} catch (error) {
  console.error('❌ Failed to create comparison image:', error.message);
}

console.log('Note: For a true side-by-side comparison, use image editing tools to combine css-edits-before.png and css-edits-after.png');