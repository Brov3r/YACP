import { ParsedColor } from './types';

function isInsideFunction(text: string, offset: number): boolean {
  let depth = 0;
  const lowerBound = Math.max(0, offset - 2000);
  for (let index = offset - 1; index >= lowerBound; index -= 1) {
    const char = text[index];
    if (char === ')') {
      depth += 1;
    } else if (char === '(') {
      if (depth === 0) {
        return true;
      }
      depth -= 1;
    } else if (char === '{' || char === '}' || char === ';') {
      break;
    }
  }
  return false;
}

function nextNonWhitespace(text: string, offset: number): string {
  for (let index = offset; index < text.length; index += 1) {
    const char = text[index];
    if (!/\s/.test(char)) {
      return char;
    }
  }
  return '';
}

function linePrefix(text: string, offset: number): string {
  const lineStart = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  return text.slice(lineStart, offset);
}

function previousLine(text: string, offset: number): string {
  const lineStart = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  if (lineStart === 0) {
    return '';
  }
  const previousEnd = lineStart - 1;
  const previousStart = text.lastIndexOf('\n', Math.max(0, previousEnd - 1)) + 1;
  return text.slice(previousStart, previousEnd).trim();
}

/**
 * In CSS-like files, a hash token followed by selector punctuation is an ID
 * selector, not a color value. Colors inside functions (gradients, shadows)
 * and declarations remain untouched.
 */
export function filterCssSelectors(
  text: string,
  colors: readonly ParsedColor[]
): ParsedColor[] {
  return colors.filter((color) => {
    if (color.syntax !== 'hex') {
      return true;
    }
    const next = nextNonWhitespace(text, color.end);
    if (!next) {
      return true;
    }
    if (/^[{[.:>+~#]$/.test(next)) {
      return false;
    }
    if (next === ',') {
      if (isInsideFunction(text, color.start)) {
        return true;
      }
      const prefix = linePrefix(text, color.start);
      const lastColon = prefix.lastIndexOf(':');
      const lastBoundary = Math.max(
        prefix.lastIndexOf('{'),
        prefix.lastIndexOf(';')
      );
      if (lastColon <= lastBoundary) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Named words are extremely common in prose and code. In "auto" mode they are
 * accepted only in CSS-like language modes and only when they appear to be a
 * value (after a property colon, inside a function, or in a multi-line value).
 */
export function filterNamedColorContext(
  text: string,
  colors: readonly ParsedColor[]
): ParsedColor[] {
  return colors.filter((color) => {
    if (color.syntax !== 'named') {
      return true;
    }

    const prefix = linePrefix(text, color.start);
    if (prefix.includes(':')) {
      return true;
    }
    const trimmed = prefix.trimEnd();
    if (trimmed.endsWith('(') || trimmed.endsWith(',')) {
      return true;
    }
    if (isInsideFunction(text, color.start)) {
      return true;
    }

    const previous = previousLine(text, color.start);
    return previous.endsWith(':') || previous.endsWith('(');
  });
}

/** Apply all document-context filters after parsing. */
export function applyContextFilters(
  text: string,
  colors: readonly ParsedColor[],
  options: { cssLike: boolean; namedContext: boolean }
): ParsedColor[] {
  let result: readonly ParsedColor[] = colors;
  if (options.namedContext) {
    result = filterNamedColorContext(text, result);
  }
  if (options.cssLike) {
    result = filterCssSelectors(text, result);
  }
  return [...result];
}
