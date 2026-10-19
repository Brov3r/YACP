/**
 * Shared color model and syntax metadata.
 *
 * All colors are normalized to red/green/blue/alpha channels in the range
 * 0..1. This keeps parsing, conversion and editor integration independent.
 */

export interface RgbaColor {
  /** Red channel, 0..1. */
  readonly r: number;
  /** Green channel, 0..1. */
  readonly g: number;
  /** Blue channel, 0..1. */
  readonly b: number;
  /** Alpha channel, 0..1. */
  readonly a: number;
}

export type ColorSyntax =
  | 'hex'
  | 'hex-function'
  | 'rgb'
  | 'rgba'
  | 'hsl'
  | 'hsla'
  | 'hwb'
  | 'lab'
  | 'lch'
  | 'oklab'
  | 'oklch'
  | 'color'
  | 'named';

/** Formats that can be written by the converter. */
export type ColorFormat =
  | 'hex'
  | 'rgb'
  | 'rgba'
  | 'hsl'
  | 'hsla'
  | 'hwb'
  | 'lab'
  | 'lch'
  | 'oklab'
  | 'oklch'
  | 'color';

export type ColorSpace = 'srgb' | 'srgb-linear' | 'display-p3';

export type HexCase = 'upper' | 'lower';

export interface ColorStyle {
  /** Syntax used by the original literal. */
  readonly syntax: ColorSyntax;
  /** True when HEX letters in the original were uppercase. */
  readonly uppercase: boolean;
  /** True when the original used #RGB/#RGBA shorthand. */
  readonly shorthand: boolean;
  /** True when the original literal explicitly included an alpha channel. */
  readonly hasAlpha: boolean;
  /** True when the original alpha was written as a percentage. */
  readonly alphaPercent: boolean;
  /** Separator style used by rgb()/hsl() functions. */
  readonly separator: 'comma' | 'space';
  /** Hue unit used by hsl()/hwb(). */
  readonly hueUnit: 'deg' | 'grad' | 'rad' | 'turn';
  /** Original function name or named-color word, preserving case. */
  readonly functionName: string;
  /** True for hex(#RRGGBB), false for hex(RRGGBB). */
  readonly hexPrefix: boolean;
  /** Color space for color() literals. */
  readonly colorSpace?: ColorSpace;
}

export interface ParsedColor {
  /** Zero-based offset of the first character of the literal. */
  readonly start: number;
  /** Zero-based offset one past the last character of the literal. */
  readonly end: number;
  readonly color: RgbaColor;
  readonly syntax: ColorSyntax;
  readonly style: ColorStyle;
}

export interface CancellationLike {
  readonly isCancellationRequested: boolean;
}

export interface ParseOptions {
  /** Optional cancellation token. Parsing stops early when cancelled. */
  readonly token?: CancellationLike;
  /** Enable CSS named colors (including "transparent"). */
  readonly namedColors?: boolean;
}

export const COLOR_FORMATS: readonly ColorFormat[] = [
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
];

/** Formats offered by default; additional CSS color spaces are opt-in. */
export const DEFAULT_COLOR_FORMATS: readonly ColorFormat[] = [
  'hex',
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb'
];

export const COLOR_FORMAT_LABELS: Readonly<Record<ColorFormat, string>> = {
  hex: 'HEX',
  rgb: 'RGB',
  rgba: 'RGBA',
  hsl: 'HSL',
  hsla: 'HSLA',
  hwb: 'HWB',
  lab: 'LAB',
  lch: 'LCH',
  oklab: 'OKLAB',
  oklch: 'OKLCH',
  color: 'COLOR'
};
