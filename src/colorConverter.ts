import {
  ColorFormat,
  ColorSpace,
  ColorStyle,
  HexCase,
  RgbaColor
} from './types';
import { findNamedColor, namedColorToRgba } from './namedColors';

export interface FormatColorOptions {
  /** Letter case for generated HEX digits. Defaults to uppercase. */
  readonly hexCase?: HexCase;
  /** Allow #RGB(A) shorthand when the value permits it. Defaults to true. */
  readonly hexShorthand?: boolean;
  /** Force alpha into HEX/RGB/HSL even for opaque colors. Defaults to false. */
  readonly showAlpha?: boolean;
  /**
   * Alpha policy. "auto" includes alpha for transparent colors, when
   * showAlpha is set, or when the preserved style had an alpha channel.
   */
  readonly includeAlpha?: 'auto' | 'always' | 'never';
  /** Original style, used by formatPreserving(). */
  readonly style?: ColorStyle;
}

const DEG_TO_RAD = Math.PI / 180;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function clampByte(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(255, Math.max(0, Math.round(value * 255)));
}

export function normalizeColor(color: RgbaColor): RgbaColor {
  return {
    r: clamp01(color.r),
    g: clamp01(color.g),
    b: clamp01(color.b),
    a: clamp01(color.a)
  };
}

/** Convert a hue in degrees plus saturation/lightness percentages to RGB. */
export function hslToRgb(
  hueDegrees: number,
  saturationPercent: number,
  lightnessPercent: number,
  alpha = 1
): RgbaColor {
  const h = ((hueDegrees % 360) + 360) % 360;
  const s = Math.min(100, Math.max(0, saturationPercent)) / 100;
  const l = Math.min(100, Math.max(0, lightnessPercent)) / 100;

  if (s === 0) {
    return { r: l, g: l, b: l, a: clamp01(alpha) };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;

  const hueToChannel = (tInput: number): number => {
    let t = tInput;
    if (t < 0) {
      t += 1;
    }
    if (t > 1) {
      t -= 1;
    }
    if (t < 1 / 6) {
      return p + (q - p) * 6 * t;
    }
    if (t < 1 / 2) {
      return q;
    }
    if (t < 2 / 3) {
      return p + (q - p) * (2 / 3 - t) * 6;
    }
    return p;
  };

  return {
    r: hueToChannel(hk + 1 / 3),
    g: hueToChannel(hk),
    b: hueToChannel(hk - 1 / 3),
    a: clamp01(alpha)
  };
}

/** Convert RGB to hue (degrees), saturation and lightness (percentages). */
export function rgbToHsl(color: RgbaColor): {
  h: number;
  s: number;
  l: number;
  a: number;
} {
  const r = clamp01(color.r);
  const g = clamp01(color.g);
  const b = clamp01(color.b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / delta) % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
        break;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  return { h, s: s * 100, l: l * 100, a: clamp01(color.a) };
}

/** Convert HWB (hue degrees, whiteness/blackness percentages) to RGB. */
export function hwbToRgb(
  hueDegrees: number,
  whitenessPercent: number,
  blacknessPercent: number,
  alpha = 1
): RgbaColor {
  const w = Math.max(0, whitenessPercent) / 100;
  const bl = Math.max(0, blacknessPercent) / 100;

  if (w + bl >= 1) {
    const gray = w / (w + bl);
    return { r: gray, g: gray, b: gray, a: clamp01(alpha) };
  }

  const base = hslToRgb(hueDegrees, 100, 50);
  const factor = 1 - w - bl;
  return {
    r: base.r * factor + w,
    g: base.g * factor + w,
    b: base.b * factor + w,
    a: clamp01(alpha)
  };
}

/** Convert RGB to hue (degrees), whiteness and blackness (percentages). */
export function rgbToHwb(color: RgbaColor): {
  h: number;
  w: number;
  b: number;
  a: number;
} {
  const r = clamp01(color.r);
  const g = clamp01(color.g);
  const b = clamp01(color.b);
  const hue = rgbToHsl(color).h;
  const white = Math.min(r, g, b);
  const black = 1 - Math.max(r, g, b);
  return {
    h: hue,
    w: white * 100,
    b: black * 100,
    a: clamp01(color.a)
  };
}

/* ------------------------------------------------------------------ *
 * CSS Color 4 color spaces
 * ------------------------------------------------------------------ */

export function srgbToLinear(value: number): number {
  const v = Math.abs(value);
  const linear = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return value < 0 ? -linear : linear;
}

export function linearToSrgb(value: number): number {
  const v = Math.abs(value);
  const encoded = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return value < 0 ? -encoded : encoded;
}

function linearSrgbToXyzD65(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b
  ];
}

function xyzD65ToLinearSrgb(
  x: number,
  y: number,
  z: number
): [number, number, number] {
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z
  ];
}

function linearP3ToXyzD65(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  return [
    0.4865709486482162 * r + 0.26566769316909306 * g + 0.1982172852343625 * b,
    0.2289745640697488 * r + 0.6917385218365064 * g + 0.079286914093745 * b,
    0.04511338185890264 * g + 1.043944368900976 * b
  ];
}

function xyzD65ToLinearP3(
  x: number,
  y: number,
  z: number
): [number, number, number] {
  return [
    2.493496911941425 * x - 0.9313836179191239 * y - 0.40271078445071684 * z,
    -0.8294889695615747 * x + 1.7626640603183463 * y + 0.023624685841943577 * z,
    0.03584583024378447 * x - 0.07617238926804182 * y + 0.9568845240076872 * z
  ];
}

const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;
const D65_WHITE = [0.95047, 1, 1.08883] as const;

function labForward(value: number): number {
  return value > LAB_EPSILON ? Math.cbrt(value) : (LAB_KAPPA * value + 16) / 116;
}

function labInverse(value: number): number {
  const cubed = value ** 3;
  return cubed > LAB_EPSILON ? cubed : (116 * value - 16) / LAB_KAPPA;
}

export function rgbToLab(color: RgbaColor): {
  l: number;
  a: number;
  b: number;
  alpha: number;
} {
  const c = normalizeColor(color);
  const linear = [srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b)];
  const xyz = linearSrgbToXyzD65(linear[0], linear[1], linear[2]);
  const fx = labForward(xyz[0] / D65_WHITE[0]);
  const fy = labForward(xyz[1] / D65_WHITE[1]);
  const fz = labForward(xyz[2] / D65_WHITE[2]);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
    alpha: c.a
  };
}

export function labToRgb(
  lightness: number,
  a: number,
  b: number,
  alpha = 1
): RgbaColor {
  const fy = (lightness + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const xyz = [
    labInverse(fx) * D65_WHITE[0],
    labInverse(fy) * D65_WHITE[1],
    labInverse(fz) * D65_WHITE[2]
  ];
  const linear = xyzD65ToLinearSrgb(xyz[0], xyz[1], xyz[2]);

  return normalizeColor({
    r: linearToSrgb(linear[0]),
    g: linearToSrgb(linear[1]),
    b: linearToSrgb(linear[2]),
    a: clamp01(alpha)
  });
}

export function rgbToLch(color: RgbaColor): {
  l: number;
  c: number;
  h: number;
  alpha: number;
} {
  const lab = rgbToLab(color);
  const chroma = Math.hypot(lab.a, lab.b);
  let hue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (hue < 0) {
    hue += 360;
  }
  return { l: lab.l, c: chroma, h: hue, alpha: lab.alpha };
}

export function lchToRgb(
  lightness: number,
  chroma: number,
  hueDegrees: number,
  alpha = 1
): RgbaColor {
  const radians = (hueDegrees * Math.PI) / 180;
  return labToRgb(
    lightness,
    chroma * Math.cos(radians),
    chroma * Math.sin(radians),
    alpha
  );
}

export function rgbToOklab(color: RgbaColor): {
  l: number;
  a: number;
  b: number;
  alpha: number;
} {
  const c = normalizeColor(color);
  const r = srgbToLinear(c.r);
  const g = srgbToLinear(c.g);
  const b = srgbToLinear(c.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l:
      0.2104542553 * lRoot +
      0.793617785 * mRoot -
      0.0040720468 * sRoot,
    a:
      1.9779984951 * lRoot -
      2.428592205 * mRoot +
      0.4505937099 * sRoot,
    b:
      0.0259040371 * lRoot +
      0.7827717662 * mRoot -
      0.808675766 * sRoot,
    alpha: c.a
  };
}

export function oklabToRgb(
  lightness: number,
  a: number,
  b: number,
  alpha = 1
): RgbaColor {
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return normalizeColor({
    r: linearToSrgb(r),
    g: linearToSrgb(g),
    b: linearToSrgb(blue),
    a: clamp01(alpha)
  });
}

export function rgbToOklch(color: RgbaColor): {
  l: number;
  c: number;
  h: number;
  alpha: number;
} {
  const lab = rgbToOklab(color);
  const chroma = Math.hypot(lab.a, lab.b);
  let hue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (hue < 0) {
    hue += 360;
  }
  return { l: lab.l, c: chroma, h: hue, alpha: lab.alpha };
}

export function oklchToRgb(
  lightness: number,
  chroma: number,
  hueDegrees: number,
  alpha = 1
): RgbaColor {
  const radians = (hueDegrees * Math.PI) / 180;
  return oklabToRgb(
    lightness,
    chroma * Math.cos(radians),
    chroma * Math.sin(radians),
    alpha
  );
}

/** Convert color() channels in a supported color space to normalized sRGB. */
export function colorSpaceToRgb(
  space: ColorSpace,
  channels: readonly [number, number, number],
  alpha = 1
): RgbaColor {
  const [c0, c1, c2] = channels;
  let r: number;
  let g: number;
  let b: number;

  switch (space) {
    case 'srgb-linear': {
      r = linearToSrgb(c0);
      g = linearToSrgb(c1);
      b = linearToSrgb(c2);
      break;
    }
    case 'display-p3': {
      const linear = linearP3ToXyzD65(
        srgbToLinear(c0),
        srgbToLinear(c1),
        srgbToLinear(c2)
      );
      const srgbLinear = xyzD65ToLinearSrgb(linear[0], linear[1], linear[2]);
      r = linearToSrgb(srgbLinear[0]);
      g = linearToSrgb(srgbLinear[1]);
      b = linearToSrgb(srgbLinear[2]);
      break;
    }
    default:
      r = c0;
      g = c1;
      b = c2;
      break;
  }

  return normalizeColor({ r, g, b, a: clamp01(alpha) });
}

/** Convert normalized sRGB to color() channels in a supported color space. */
export function rgbToColorSpace(
  space: ColorSpace,
  color: RgbaColor
): [number, number, number] {
  const c = normalizeColor(color);

  switch (space) {
    case 'srgb-linear':
      return [srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b)];
    case 'display-p3': {
      const xyz = linearSrgbToXyzD65(
        srgbToLinear(c.r),
        srgbToLinear(c.g),
        srgbToLinear(c.b)
      );
      const linearP3 = xyzD65ToLinearP3(xyz[0], xyz[1], xyz[2]);
      return [
        linearToSrgb(linearP3[0]),
        linearToSrgb(linearP3[1]),
        linearToSrgb(linearP3[2])
      ];
    }
    default:
      return [c.r, c.g, c.b];
  }
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatNumber(value: number, maxDigits = 2): string {
  return String(roundTo(value, maxDigits));
}

function alphaByte(alpha: number): number {
  return clampByte(alpha);
}

function shouldIncludeAlpha(
  color: RgbaColor,
  format: ColorFormat,
  options: FormatColorOptions
): boolean {
  if (format === 'rgba' || format === 'hsla') {
    return true;
  }

  const mode = options.includeAlpha ?? 'auto';
  if (mode === 'always') {
    return true;
  }
  if (mode === 'never') {
    return false;
  }

  return (
    alphaByte(color.a) < 255 ||
    options.showAlpha === true ||
    options.style?.hasAlpha === true
  );
}

function formatAlpha(alpha: number, style?: ColorStyle): string {
  if (style?.alphaPercent) {
    return `${formatNumber(clamp01(alpha) * 100, 2)}%`;
  }
  return formatNumber(clamp01(alpha), 4);
}

function channelHex(value: number): string {
  return clampByte(value).toString(16).padStart(2, '0');
}

function canShortenHex(pairs: readonly string[]): boolean {
  return pairs.every((pair) => pair.length === 2 && pair[0] === pair[1]);
}

/**
 * Format a color as bare HEX digits, without the leading #.
 */
export function formatHexDigits(
  color: RgbaColor,
  options: FormatColorOptions = {}
): string {
  const includeAlpha = shouldIncludeAlpha(color, 'hex', options);
  const pairs = [
    channelHex(color.r),
    channelHex(color.g),
    channelHex(color.b)
  ];
  if (includeAlpha) {
    pairs.push(channelHex(color.a));
  }

  const shorthand =
    options.hexShorthand ?? options.style?.shorthand ?? true;

  let digits = pairs.join('');
  if (shorthand && canShortenHex(pairs)) {
    digits = pairs.map((pair) => pair[0]).join('');
  }

  const upper = options.style
    ? options.style.uppercase
    : (options.hexCase ?? 'upper') === 'upper';

  return upper ? digits.toUpperCase() : digits.toLowerCase();
}

function formatHue(hueDegrees: number, style?: ColorStyle): string {
  const unit = style?.hueUnit ?? 'deg';
  const normalized = ((hueDegrees % 360) + 360) % 360;

  switch (unit) {
    case 'turn':
      return `${formatNumber(normalized / 360, 4)}turn`;
    case 'rad':
      return `${formatNumber(normalized * DEG_TO_RAD, 4)}rad`;
    case 'grad':
      return `${formatNumber(normalized / 0.9, 3)}grad`;
    default:
      return formatNumber(normalized, 1);
  }
}

function formatRgb(
  color: RgbaColor,
  format: ColorFormat,
  options: FormatColorOptions
): string {
  const includeAlpha = shouldIncludeAlpha(color, format, options);
  const style = options.style;
  let name = style?.functionName ?? (includeAlpha ? 'rgba' : 'rgb');

  // Legacy comma syntax needs the alpha-aware alias when a previously opaque
  // rgb() literal must gain an alpha channel. Modern slash syntax is valid on
  // both aliases, so it keeps the original name.
  if (
    includeAlpha &&
    style &&
    !style.hasAlpha &&
    style.separator === 'comma' &&
    name.toLowerCase() === 'rgb'
  ) {
    name = name === name.toUpperCase() ? 'RGBA' : 'rgba';
  }

  const separator = style?.separator ?? 'comma';

  const channels = [
    String(clampByte(color.r)),
    String(clampByte(color.g)),
    String(clampByte(color.b))
  ];

  if (!includeAlpha) {
    return separator === 'space'
      ? `${name}(${channels.join(' ')})`
      : `${name}(${channels.join(', ')})`;
  }

  const alpha = formatAlpha(color.a, style);
  return separator === 'space'
    ? `${name}(${channels.join(' ')} / ${alpha})`
    : `${name}(${channels.join(', ')}, ${alpha})`;
}

function formatHsl(
  color: RgbaColor,
  format: ColorFormat,
  options: FormatColorOptions
): string {
  const includeAlpha = shouldIncludeAlpha(color, format, options);
  const style = options.style;
  let name = style?.functionName ?? (includeAlpha ? 'hsla' : 'hsl');

  if (
    includeAlpha &&
    style &&
    !style.hasAlpha &&
    style.separator === 'comma' &&
    name.toLowerCase() === 'hsl'
  ) {
    name = name === name.toUpperCase() ? 'HSLA' : 'hsla';
  }

  const separator = style?.separator ?? 'comma';
  const { h, s, l } = rgbToHsl(color);
  const channels = [
    formatHue(h, style),
    `${formatNumber(s, 2)}%`,
    `${formatNumber(l, 2)}%`
  ];

  if (!includeAlpha) {
    return separator === 'space'
      ? `${name}(${channels.join(' ')})`
      : `${name}(${channels.join(', ')})`;
  }

  const alpha = formatAlpha(color.a, style);
  return separator === 'space'
    ? `${name}(${channels.join(' ')} / ${alpha})`
    : `${name}(${channels.join(', ')}, ${alpha})`;
}

function formatHwb(color: RgbaColor, options: FormatColorOptions): string {
  const includeAlpha = shouldIncludeAlpha(color, 'hwb', options);
  const style = options.style;
  const name = style?.functionName ?? 'hwb';
  const { h, w, b } = rgbToHwb(color);
  const base = `${name}(${formatHue(h, style)} ${formatNumber(w, 2)}% ${formatNumber(
    b,
    2
  )}%`;

  return includeAlpha
    ? `${base} / ${formatAlpha(color.a, style)})`
    : `${base})`;
}

function alphaSuffix(
  color: RgbaColor,
  format: ColorFormat,
  options: FormatColorOptions
): string {
  return shouldIncludeAlpha(color, format, options)
    ? ` / ${formatAlpha(color.a, options.style)}`
    : '';
}

function formatLab(color: RgbaColor, options: FormatColorOptions): string {
  const style = options.style;
  const name = style?.functionName ?? 'lab';
  const { l, a, b } = rgbToLab(color);
  return `${name}(${formatNumber(l, 2)} ${formatNumber(a, 2)} ${formatNumber(
    b,
    2
  )}${alphaSuffix(color, 'lab', options)})`;
}

function formatLch(color: RgbaColor, options: FormatColorOptions): string {
  const style = options.style;
  const name = style?.functionName ?? 'lch';
  const { l, c, h } = rgbToLch(color);
  return `${name}(${formatNumber(l, 2)} ${formatNumber(c, 2)} ${formatHue(
    h,
    style
  )}${alphaSuffix(color, 'lch', options)})`;
}

function formatOklab(color: RgbaColor, options: FormatColorOptions): string {
  const style = options.style;
  const name = style?.functionName ?? 'oklab';
  const { l, a, b } = rgbToOklab(color);
  return `${name}(${formatNumber(l, 5)} ${formatNumber(a, 5)} ${formatNumber(
    b,
    5
  )}${alphaSuffix(color, 'oklab', options)})`;
}

function formatOklch(color: RgbaColor, options: FormatColorOptions): string {
  const style = options.style;
  const name = style?.functionName ?? 'oklch';
  const { l, c, h } = rgbToOklch(color);
  return `${name}(${formatNumber(l, 5)} ${formatNumber(c, 5)} ${formatHue(
    h,
    style
  )}${alphaSuffix(color, 'oklch', options)})`;
}

function formatColorFunction(
  color: RgbaColor,
  options: FormatColorOptions
): string {
  const style = options.style;
  const name = style?.functionName ?? 'color';
  const space: ColorSpace = style?.colorSpace ?? 'srgb';
  const channels = rgbToColorSpace(space, color);
  return `${name}(${space} ${channels
    .map((channel) => formatNumber(channel, 4))
    .join(' ')}${alphaSuffix(color, 'color', options)})`;
}

/**
 * Convert a normalized color to one of the supported textual formats.
 *
 * The function never mutates the document; callers are responsible for
 * replacing the exact color range.
 */
export function formatColor(
  colorInput: RgbaColor,
  format: ColorFormat,
  options: FormatColorOptions = {}
): string {
  const color = normalizeColor(colorInput);

  switch (format) {
    case 'hex':
      return `#${formatHexDigits(color, options)}`;
    case 'rgb':
    case 'rgba':
      return formatRgb(color, format, options);
    case 'hsl':
    case 'hsla':
      return formatHsl(color, format, options);
    case 'hwb':
      return formatHwb(color, options);
    case 'lab':
      return formatLab(color, options);
    case 'lch':
      return formatLch(color, options);
    case 'oklab':
      return formatOklab(color, options);
    case 'oklch':
      return formatOklch(color, options);
    case 'color':
      return formatColorFunction(color, options);
    default:
      return formatColor(color, 'hex', options);
  }
}

/**
 * Format a color using the original literal's syntax and useful stylistic
 * characteristics (HEX case, shorthand, separators, function name, hue unit).
 */
function sameRgba(a: RgbaColor, b: RgbaColor): boolean {
  return (
    clampByte(a.r) === clampByte(b.r) &&
    clampByte(a.g) === clampByte(b.g) &&
    clampByte(a.b) === clampByte(b.b) &&
    clampByte(a.a) === clampByte(b.a)
  );
}

function formatPreservingNamed(
  color: RgbaColor,
  style: ColorStyle,
  options: FormatColorOptions
): string {
  const originalName = style.functionName.toLowerCase();
  const originalColor = namedColorToRgba(originalName);

  if (originalColor && sameRgba(color, originalColor)) {
    return style.functionName;
  }

  const name = findNamedColor(color);
  if (name) {
    return style.uppercase ? name.toUpperCase() : name;
  }

  // A named color has no named equivalent for the new value. A HEX fallback
  // keeps the visual meaning without inventing an unrelated keyword.
  return formatColor(color, 'hex', {
    hexCase: options.hexCase ?? (style.uppercase ? 'upper' : 'lower'),
    hexShorthand: false,
    showAlpha: options.showAlpha,
    includeAlpha: 'auto'
  });
}

/**
 * Format a color using the original literal's syntax and useful stylistic
 * characteristics (HEX case, shorthand, separators, function name, hue unit).
 */
export function formatPreserving(
  color: RgbaColor,
  style: ColorStyle,
  options: FormatColorOptions = {}
): string {
  const normalized = normalizeColor(color);
  const preserveOptions: FormatColorOptions = {
    ...options,
    style,
    includeAlpha: options.includeAlpha ?? 'auto'
  };

  if (style.syntax === 'hex') {
    return `#${formatHexDigits(normalized, preserveOptions)}`;
  }

  if (style.syntax === 'hex-function') {
    const digits = formatHexDigits(normalized, preserveOptions);
    const prefix = style.hexPrefix ? '#' : '';
    return `${style.functionName}(${prefix}${digits})`;
  }

  if (style.syntax === 'named') {
    return formatPreservingNamed(normalized, style, options);
  }

  return formatColor(normalized, style.syntax as ColorFormat, preserveOptions);
}

/** Visible alpha check with 8-bit rounding tolerance. */
export function isTransparent(color: RgbaColor): boolean {
  return clampByte(color.a) < 255;
}
