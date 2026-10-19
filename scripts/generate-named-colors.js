const fs = require('fs');
const names = require('color-name');

const entries = Object.entries(names)
  .map(([name, rgb]) => `  ${JSON.stringify(name)}: [${rgb.join(', ')}]`)
  .join(',\n');

const content = `/**
 * CSS named colors (CSS Color 4) plus "transparent".
 * Values are 8-bit sRGB tuples. Generated from the standard color-name table
 * and checked in to keep the extension dependency-free at runtime.
 */

export const NAMED_COLOR_RGB: Readonly<Record<string, readonly [number, number, number]>> = {
${entries}
};

export const TRANSPARENT_NAME = 'transparent';

export const NAMED_COLOR_NAMES: readonly string[] = [
  ...Object.keys(NAMED_COLOR_RGB),
  TRANSPARENT_NAME
];
`;

fs.writeFileSync('src/namedColors.ts', content, 'utf8');
console.log('wrote', Object.keys(names).length, 'named colors');
