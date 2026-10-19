import {
  clamp01,
  colorSpaceToRgb,
  hslToRgb,
  hwbToRgb,
  labToRgb,
  lchToRgb,
  normalizeColor,
  oklabToRgb,
  oklchToRgb
} from './colorConverter';
import { NAMED_COLOR_NAMES, namedColorToRgba } from './namedColors';
import {
  CancellationLike,
  ColorSpace,
  ColorStyle,
  ColorSyntax,
  ParseOptions,
  ParsedColor,
  RgbaColor
} from './types';

/**
 * Language-independent color scanner.
 *
 * The scanner is deliberately independent of VS Code and of any grammar.
 * It walks the text once, finding candidate starts (# and function calls) and
 * validating them with bounded, sticky regular expressions. Every match is
 * consumed as a whole, so prefixes of longer invalid tokens are not reported.
 */

const NUM = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)`;

const RGB_COMMA_RE = new RegExp(
  String.raw`rgba?\(\s*(${NUM})(%?)\s*,\s*(${NUM})(%?)\s*,\s*(${NUM})(%?)(?:\s*,\s*(${NUM})(%?))?\s*\)`,
  'iy'
);

const RGB_SPACE_RE = new RegExp(
  String.raw`rgba?\(\s*(${NUM})(%?)\s+(${NUM})(%?)\s+(${NUM})(%?)(?:\s*\/\s*(${NUM})(%?))?\s*\)`,
  'iy'
);

const HSL_COMMA_RE = new RegExp(
  String.raw`hsla?\(\s*(${NUM})(deg|grad|rad|turn)?\s*,\s*(${NUM})\s*%\s*,\s*(${NUM})\s*%\s*(?:,\s*(${NUM})\s*(%)?)?\s*\)`,
  'iy'
);

const HSL_SPACE_RE = new RegExp(
  String.raw`hsla?\(\s*(${NUM})(deg|grad|rad|turn)?\s+(${NUM})\s*%\s+(${NUM})\s*%\s*(?:\/\s*(${NUM})\s*(%)?)?\s*\)`,
  'iy'
);

const HWB_SPACE_RE = new RegExp(
  String.raw`hwb\(\s*(${NUM})(deg|grad|rad|turn)?\s+(${NUM})\s*%\s+(${NUM})\s*%\s*(?:\/\s*(${NUM})\s*(%)?)?\s*\)`,
  'iy'
);

const HEX_FUNCTION_RE = /hex\(\s*(#?)([0-9A-Fa-f]{3,8})\s*\)/iy;

const LAB_RE = new RegExp(
  String.raw`lab\(\s*(${NUM})(%?)\s+(${NUM})(%?)\s+(${NUM})(%?)(?:\s*\/\s*(${NUM})(%?))?\s*\)`,
  'iy'
);

const LCH_RE = new RegExp(
  String.raw`lch\(\s*(${NUM})(%?)\s+(${NUM})(%?)\s+(${NUM})(deg|grad|rad|turn)?\s*(?:\/\s*(${NUM})(%)?)?\s*\)`,
  'iy'
);

const OKLAB_RE = new RegExp(
  String.raw`oklab\(\s*(${NUM})(%?)\s+(${NUM})(%?)\s+(${NUM})(%?)(?:\s*\/\s*(${NUM})(%?))?\s*\)`,
  'iy'
);

const OKLCH_RE = new RegExp(
  String.raw`oklch\(\s*(${NUM})(%?)\s+(${NUM})(%?)\s+(${NUM})(deg|grad|rad|turn)?\s*(?:\/\s*(${NUM})(%)?)?\s*\)`,
  'iy'
);

const COLOR_FUNCTION_RE = new RegExp(
  String.raw`color\(\s*([a-z][a-z0-9-]*)\s+(${NUM})(%?)\s+(${NUM})(%?)\s+(${NUM})(%?)(?:\s*\/\s*(${NUM})(%?))?\s*\)`,
  'iy'
);

const NAMED_COLOR_RE = new RegExp(
  String.raw`(?<![A-Za-z0-9_$#/.-])(?:${[...NAMED_COLOR_NAMES]
    .sort((a, b) => b.length - a.length)
    .join('|')})(?![A-Za-z0-9_$-])`,
  'gi'
);

/**
 * Matches # or a CSS-like function token at an identifier boundary. The
 * negative lookbehind prevents quadratic re-scanning inside long identifiers.
 */
const CANDIDATE_RE =
  /#|(?<![A-Za-z0-9_$-])[A-Za-z][A-Za-z0-9_-]*\(/g;

const HEX_DIGIT_RE = /^[0-9A-Fa-f]$/;
const HEX_LENGTHS = new Set([3, 4, 6, 8]);
const SUPPORTED_FUNCTIONS = new Set([
  'hex',
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color'
]);

const COLOR_SPACES = new Set<ColorSpace>([
  'srgb',
  'srgb-linear',
  'display-p3'
]);

function execAt(re: RegExp, text: string, index: number): RegExpExecArray | null {
  re.lastIndex = index;
  return re.exec(text);
}

function isHexDigit(char: string): boolean {
  return HEX_DIGIT_RE.test(char);
}

function isWordCharacter(char: string): boolean {
  return /[A-Za-z0-9_$-]/.test(char);
}

/**
 * Characters immediately before a candidate that mean it is part of a longer
 * identifier, URL fragment, or token. A leading slash prevents treating the
 * fragment in "https://example.com/#fff" as a color.
 */
function isBlockedBefore(text: string, start: number): boolean {
  return start > 0 && /[A-Za-z0-9_$#/-]/.test(text[start - 1]);
}

function parseFinite(value: string): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseRgbChannel(value: string, percent: string): number | null {
  const number = parseFinite(value);
  if (number === null) {
    return null;
  }

  // CSS clamps out-of-range channels at parsed-value time rather than
  // rejecting the declaration.
  return clamp01(percent === '%' ? number / 100 : number / 255);
}

function parseAlpha(value: string | undefined, percent: string | undefined): number | null {
  if (value === undefined) {
    return 1;
  }

  const number = parseFinite(value);
  if (number === null) {
    return null;
  }

  return clamp01(percent === '%' ? number / 100 : number);
}

function parsePercent(value: string): number | null {
  const number = parseFinite(value);
  return number === null ? null : Math.min(100, Math.max(0, number));
}

function hueToDegrees(unit: string | undefined, value: string): number | null {
  const number = parseFinite(value);
  if (number === null) {
    return null;
  }

  switch (unit?.toLowerCase()) {
    case 'turn':
      return number * 360;
    case 'rad':
      return (number * 180) / Math.PI;
    case 'grad':
      return number * 0.9;
    default:
      return number;
  }
}

function parseHexDigits(digits: string): RgbaColor | null {
  if (!HEX_LENGTHS.has(digits.length)) {
    return null;
  }

  const expand = (value: string): number =>
    parseInt(value.length === 1 ? value + value : value, 16) / 255;

  if (digits.length <= 4) {
    return {
      r: expand(digits[0]),
      g: expand(digits[1]),
      b: expand(digits[2]),
      a: digits.length === 4 ? expand(digits[3]) : 1
    };
  }

  return {
    r: expand(digits.slice(0, 2)),
    g: expand(digits.slice(2, 4)),
    b: expand(digits.slice(4, 6)),
    a: digits.length === 8 ? expand(digits.slice(6, 8)) : 1
  };
}

function isAllUppercase(text: string): boolean {
  return text === text.toUpperCase();
}

function baseStyle(syntax: ColorSyntax): ColorStyle {
  return {
    syntax,
    uppercase: false,
    shorthand: false,
    hasAlpha: false,
    alphaPercent: false,
    separator: 'space',
    hueUnit: 'deg',
    functionName: syntax,
    hexPrefix: false
  };
}

function parseHexCandidate(text: string, start: number): ParsedColor | null {
  if (isBlockedBefore(text, start)) {
    return null;
  }

  // If a hex(...) wrapper was rejected as a whole (for example because the
  // closing parenthesis is followed by an identifier), do not expose its
  // argument as a standalone color literal.
  const preceding = text.slice(Math.max(0, start - 16), start);
  if (/hex\(\s*$/i.test(preceding)) {
    return null;
  }

  let index = start + 1;
  while (index < text.length && isHexDigit(text[index])) {
    index += 1;
  }

  const digits = text.slice(start + 1, index);
  const color = parseHexDigits(digits);
  if (!color) {
    return null;
  }

  // Reject when this is only a prefix of a longer identifier-like token
  // (for example #fffff or #ffffffzz).
  if (index < text.length && isWordCharacter(text[index])) {
    return null;
  }

  const style: ColorStyle = {
    ...baseStyle('hex'),
    uppercase: isAllUppercase(digits),
    shorthand: digits.length === 3 || digits.length === 4,
    hasAlpha: digits.length === 4 || digits.length === 8
  };

  return {
    start,
    end: index,
    color,
    syntax: 'hex',
    style
  };
}

function parseRgbMatch(
  text: string,
  start: number,
  name: string,
  match: RegExpExecArray,
  separator: 'comma' | 'space'
): ParsedColor | null {
  const r = parseRgbChannel(match[1], match[2]);
  const g = parseRgbChannel(match[3], match[4]);
  const b = parseRgbChannel(match[5], match[6]);
  const a = parseAlpha(match[7], match[8]);

  if (r === null || g === null || b === null || a === null) {
    return null;
  }

  const alphaPresent = match[7] !== undefined;
  const style: ColorStyle = {
    ...baseStyle(name as ColorSyntax),
    hasAlpha: alphaPresent,
    alphaPercent: match[8] === '%',
    separator,
    functionName: text.slice(start, start + name.length)
  };

  return {
    start,
    end: start + match[0].length,
    color: normalizeColor({ r, g, b, a }),
    syntax: name as ColorSyntax,
    style
  };
}

function parseHslMatch(
  text: string,
  start: number,
  name: string,
  match: RegExpExecArray,
  separator: 'comma' | 'space'
): ParsedColor | null {
  const hue = hueToDegrees(match[2], match[1]);
  const saturation = parsePercent(match[3]);
  const lightness = parsePercent(match[4]);
  const alpha = parseAlpha(match[5], match[6]);

  if (hue === null || saturation === null || lightness === null || alpha === null) {
    return null;
  }

  const alphaPresent = match[5] !== undefined;
  const unit = (match[2]?.toLowerCase() ?? 'deg') as ColorStyle['hueUnit'];
  const style: ColorStyle = {
    ...baseStyle(name as ColorSyntax),
    hasAlpha: alphaPresent,
    alphaPercent: match[6] === '%',
    separator,
    hueUnit: unit,
    functionName: text.slice(start, start + name.length)
  };

  return {
    start,
    end: start + match[0].length,
    color: hslToRgb(hue, saturation, lightness, alpha),
    syntax: name as ColorSyntax,
    style
  };
}

function parseHwbMatch(
  text: string,
  start: number,
  match: RegExpExecArray
): ParsedColor | null {
  const hue = hueToDegrees(match[2], match[1]);
  const whiteness = parsePercent(match[3]);
  const blackness = parsePercent(match[4]);
  const alpha = parseAlpha(match[5], match[6]);

  if (hue === null || whiteness === null || blackness === null || alpha === null) {
    return null;
  }

  const alphaPresent = match[5] !== undefined;
  const unit = (match[2]?.toLowerCase() ?? 'deg') as ColorStyle['hueUnit'];
  const style: ColorStyle = {
    ...baseStyle('hwb'),
    hasAlpha: alphaPresent,
    alphaPercent: match[6] === '%',
    separator: 'space',
    hueUnit: unit,
    functionName: text.slice(start, start + 'hwb'.length)
  };

  return {
    start,
    end: start + match[0].length,
    color: hwbToRgb(hue, whiteness, blackness, alpha),
    syntax: 'hwb',
    style
  };
}

function parseLabLightness(value: string): number | null {
  const number = parseFinite(value);
  return number === null ? null : Math.min(100, Math.max(0, number));
}

function parseOklabLightness(value: string, percent: string): number | null {
  const number = parseFinite(value);
  if (number === null) {
    return null;
  }
  const normalized = percent === '%' ? number / 100 : number;
  return Math.min(1, Math.max(0, normalized));
}

function parseLabAxis(value: string, percent: string, percentScale: number): number | null {
  const number = parseFinite(value);
  if (number === null) {
    return null;
  }
  return percent === '%' ? (number / 100) * percentScale : number;
}

function parseChroma(value: string, percent: string, percentScale: number): number | null {
  const chroma = parseLabAxis(value, percent, percentScale);
  return chroma === null ? null : Math.max(0, chroma);
}

function parseLabMatch(
  text: string,
  start: number,
  name: string,
  match: RegExpExecArray
): ParsedColor | null {
  const lightness = parseLabLightness(match[1]);
  const a = parseLabAxis(match[3], match[4], 125);
  const b = parseLabAxis(match[5], match[6], 125);
  const alpha = parseAlpha(match[7], match[8]);

  if (lightness === null || a === null || b === null || alpha === null) {
    return null;
  }

  const style: ColorStyle = {
    ...baseStyle('lab'),
    hasAlpha: match[7] !== undefined,
    alphaPercent: match[8] === '%',
    separator: 'space',
    functionName: text.slice(start, start + name.length)
  };

  return {
    start,
    end: start + match[0].length,
    color: labToRgb(lightness, a, b, alpha),
    syntax: 'lab',
    style
  };
}

function parseLchMatch(
  text: string,
  start: number,
  name: string,
  match: RegExpExecArray
): ParsedColor | null {
  const lightness = parseLabLightness(match[1]);
  const chroma = parseChroma(match[3], match[4], 150);
  const hue = hueToDegrees(match[6], match[5]);
  const alpha = parseAlpha(match[7], match[8]);

  if (
    lightness === null ||
    chroma === null ||
    hue === null ||
    alpha === null
  ) {
    return null;
  }

  const unit = (match[6]?.toLowerCase() ?? 'deg') as ColorStyle['hueUnit'];
  const style: ColorStyle = {
    ...baseStyle('lch'),
    hasAlpha: match[7] !== undefined,
    alphaPercent: match[8] === '%',
    separator: 'space',
    hueUnit: unit,
    functionName: text.slice(start, start + name.length)
  };

  return {
    start,
    end: start + match[0].length,
    color: lchToRgb(lightness, chroma, hue, alpha),
    syntax: 'lch',
    style
  };
}

function parseOklabMatch(
  text: string,
  start: number,
  name: string,
  match: RegExpExecArray
): ParsedColor | null {
  const lightness = parseOklabLightness(match[1], match[2]);
  const a = parseLabAxis(match[3], match[4], 0.4);
  const b = parseLabAxis(match[5], match[6], 0.4);
  const alpha = parseAlpha(match[7], match[8]);

  if (lightness === null || a === null || b === null || alpha === null) {
    return null;
  }

  const style: ColorStyle = {
    ...baseStyle('oklab'),
    hasAlpha: match[7] !== undefined,
    alphaPercent: match[8] === '%',
    separator: 'space',
    functionName: text.slice(start, start + name.length)
  };

  return {
    start,
    end: start + match[0].length,
    color: oklabToRgb(lightness, a, b, alpha),
    syntax: 'oklab',
    style
  };
}

function parseOklchMatch(
  text: string,
  start: number,
  name: string,
  match: RegExpExecArray
): ParsedColor | null {
  const lightness = parseOklabLightness(match[1], match[2]);
  const chroma = parseChroma(match[3], match[4], 0.4);
  const hue = hueToDegrees(match[6], match[5]);
  const alpha = parseAlpha(match[7], match[8]);

  if (
    lightness === null ||
    chroma === null ||
    hue === null ||
    alpha === null
  ) {
    return null;
  }

  const unit = (match[6]?.toLowerCase() ?? 'deg') as ColorStyle['hueUnit'];
  const style: ColorStyle = {
    ...baseStyle('oklch'),
    hasAlpha: match[7] !== undefined,
    alphaPercent: match[8] === '%',
    separator: 'space',
    hueUnit: unit,
    functionName: text.slice(start, start + name.length)
  };

  return {
    start,
    end: start + match[0].length,
    color: oklchToRgb(lightness, chroma, hue, alpha),
    syntax: 'oklch',
    style
  };
}

function parseColorMatch(
  text: string,
  start: number,
  match: RegExpExecArray
): ParsedColor | null {
  const space = match[1].toLowerCase() as ColorSpace;
  if (!COLOR_SPACES.has(space)) {
    return null;
  }

  const channel = (value: string, percent: string): number | null => {
    const number = parseFinite(value);
    if (number === null) {
      return null;
    }
    return percent === '%' ? number / 100 : number;
  };

  const c0 = channel(match[2], match[3]);
  const c1 = channel(match[4], match[5]);
  const c2 = channel(match[6], match[7]);
  const alpha = parseAlpha(match[8], match[9]);

  if (c0 === null || c1 === null || c2 === null || alpha === null) {
    return null;
  }

  const style: ColorStyle = {
    ...baseStyle('color'),
    hasAlpha: match[8] !== undefined,
    alphaPercent: match[9] === '%',
    separator: 'space',
    functionName: text.slice(start, start + 'color'.length),
    colorSpace: space
  };

  return {
    start,
    end: start + match[0].length,
    color: colorSpaceToRgb(space, [c0, c1, c2], alpha),
    syntax: 'color',
    style
  };
}

function parseFunctionCandidate(
  text: string,
  start: number,
  name: string
): ParsedColor | null {
  if (isBlockedBefore(text, start)) {
    return null;
  }

  let parsed: ParsedColor | null = null;

  switch (name) {
    case 'hex': {
      const match = execAt(HEX_FUNCTION_RE, text, start);
      if (!match) {
        return null;
      }
      const digits = match[2];
      if (!HEX_LENGTHS.has(digits.length)) {
        return null;
      }
      const color = parseHexDigits(digits);
      if (!color) {
        return null;
      }
      const style: ColorStyle = {
        ...baseStyle('hex-function'),
        uppercase: isAllUppercase(digits),
        shorthand: digits.length === 3 || digits.length === 4,
        hasAlpha: digits.length === 4 || digits.length === 8,
        functionName: text.slice(start, start + 3),
        hexPrefix: match[1] === '#'
      };
      parsed = {
        start,
        end: start + match[0].length,
        color,
        syntax: 'hex-function',
        style
      };
      break;
    }
    case 'rgb':
    case 'rgba': {
      const commaMatch = execAt(RGB_COMMA_RE, text, start);
      if (commaMatch) {
        parsed = parseRgbMatch(text, start, name, commaMatch, 'comma');
      } else {
        const spaceMatch = execAt(RGB_SPACE_RE, text, start);
        if (spaceMatch) {
          parsed = parseRgbMatch(text, start, name, spaceMatch, 'space');
        }
      }
      break;
    }
    case 'hsl':
    case 'hsla': {
      const commaMatch = execAt(HSL_COMMA_RE, text, start);
      if (commaMatch) {
        parsed = parseHslMatch(text, start, name, commaMatch, 'comma');
      } else {
        const spaceMatch = execAt(HSL_SPACE_RE, text, start);
        if (spaceMatch) {
          parsed = parseHslMatch(text, start, name, spaceMatch, 'space');
        }
      }
      break;
    }
    case 'hwb': {
      const match = execAt(HWB_SPACE_RE, text, start);
      if (match) {
        parsed = parseHwbMatch(text, start, match);
      }
      break;
    }
    case 'lab': {
      const match = execAt(LAB_RE, text, start);
      if (match) {
        parsed = parseLabMatch(text, start, name, match);
      }
      break;
    }
    case 'lch': {
      const match = execAt(LCH_RE, text, start);
      if (match) {
        parsed = parseLchMatch(text, start, name, match);
      }
      break;
    }
    case 'oklab': {
      const match = execAt(OKLAB_RE, text, start);
      if (match) {
        parsed = parseOklabMatch(text, start, name, match);
      }
      break;
    }
    case 'oklch': {
      const match = execAt(OKLCH_RE, text, start);
      if (match) {
        parsed = parseOklchMatch(text, start, name, match);
      }
      break;
    }
    case 'color': {
      const match = execAt(COLOR_FUNCTION_RE, text, start);
      if (match) {
        parsed = parseColorMatch(text, start, match);
      }
      break;
    }
    default:
      return null;
  }

  if (!parsed) {
    return null;
  }

  // Do not match a prefix of a longer function/identifier token.
  if (parsed.end < text.length && isWordCharacter(text[parsed.end])) {
    return null;
  }

  return parsed;
}

function isCancelled(token: CancellationLike | undefined): boolean {
  return token?.isCancellationRequested === true;
}

function mergeNamedColors(
  text: string,
  existing: readonly ParsedColor[],
  token: CancellationLike | undefined
): ParsedColor[] {
  const named: ParsedColor[] = [];
  const matcher = new RegExp(NAMED_COLOR_RE.source, 'gi');
  let match: RegExpExecArray | null;
  let existingIndex = 0;

  while ((match = matcher.exec(text)) !== null) {
    if (isCancelled(token)) {
      break;
    }

    const start = match.index;
    const end = start + match[0].length;

    while (
      existingIndex < existing.length &&
      existing[existingIndex].end <= start
    ) {
      existingIndex += 1;
    }
    if (
      existingIndex < existing.length &&
      existing[existingIndex].start < end &&
      existing[existingIndex].end > start
    ) {
      continue;
    }

    const color = namedColorToRgba(match[0]);
    if (!color) {
      continue;
    }

    const style: ColorStyle = {
      ...baseStyle('named'),
      uppercase: isAllUppercase(match[0]),
      hasAlpha: match[0].toLowerCase() === 'transparent',
      functionName: match[0]
    };

    named.push({
      start,
      end,
      color,
      syntax: 'named',
      style
    });
  }

  if (named.length === 0) {
    return [...existing];
  }

  return [...existing, ...named].sort((a, b) => a.start - b.start);
}

/**
 * Scan text and return every supported color literal in source order.
 *
 * The scan is linear in the document size (modulo bounded function regexes)
 * and never throws on malformed input.
 */
export function parseColors(
  text: string,
  options: ParseOptions = {}
): ParsedColor[] {
  const colors: ParsedColor[] = [];
  const token = options.token;
  const candidate = new RegExp(CANDIDATE_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = candidate.exec(text)) !== null) {
    if (isCancelled(token)) {
      return colors;
    }

    const start = match.index;

    if (text[start] === '#') {
      const parsed = parseHexCandidate(text, start);
      if (parsed) {
        colors.push(parsed);
        candidate.lastIndex = parsed.end;
      } else {
        candidate.lastIndex = start + 1;
      }
      continue;
    }

    const tokenText = match[0];
    const name = tokenText.slice(0, -1).toLowerCase();

    if (!SUPPORTED_FUNCTIONS.has(name)) {
      candidate.lastIndex = start + tokenText.length;
      continue;
    }

    const parsed = parseFunctionCandidate(text, start, name);
    if (parsed) {
      colors.push(parsed);
      candidate.lastIndex = parsed.end;
    } else {
      candidate.lastIndex = start + tokenText.length;
    }
  }

  if (options.namedColors && !isCancelled(token)) {
    return mergeNamedColors(text, colors, token);
  }

  return colors;
}

/** Parse a string that must consist of exactly one color literal. */
export function parseColorLiteral(
  text: string,
  options: ParseOptions = {}
): ParsedColor | null {
  const colors = parseColors(text, options);
  if (colors.length !== 1) {
    return null;
  }
  const color = colors[0];
  return color.start === 0 && color.end === text.length ? color : null;
}

/**
 * Find a color containing an offset. Cursor offsets at the end of a literal
 * are treated as inside it, which matches common editor expectations.
 */
export function findColorAtOffset(
  colors: readonly ParsedColor[],
  offset: number
): ParsedColor | null {
  for (const color of colors) {
    if (offset >= color.start && offset <= color.end) {
      return color;
    }
    if (color.start > offset) {
      break;
    }
  }
  return null;
}
