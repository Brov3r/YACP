import * as vscode from 'vscode';
import {
  COLOR_FORMATS,
  DEFAULT_COLOR_FORMATS,
  ColorFormat,
  HexCase
} from './types';

export const CONFIG_SECTION = 'yacp';

export type DefaultFormat = 'auto' | ColorFormat;
export type NamedColorMode = 'auto' | 'always' | 'never';

export interface YacpConfig {
  readonly enable: boolean;
  readonly defaultFormat: DefaultFormat;
  readonly hexCase: HexCase;
  readonly showAlpha: boolean;
  readonly supportedFormats: readonly ColorFormat[];
  readonly namedColors: NamedColorMode;
}

export const CONFIG_KEYS = [
  'yacp.enable',
  'yacp.defaultFormat',
  'yacp.hexCase',
  'yacp.showAlpha',
  'yacp.supportedFormats',
  'yacp.namedColors'
] as const;

const DEFAULT_FORMATS: readonly ColorFormat[] = [...DEFAULT_COLOR_FORMATS];
const DEFAULT_FORMAT_VALUES: readonly DefaultFormat[] = ['auto', ...COLOR_FORMATS];
const NAMED_COLOR_MODES: readonly NamedColorMode[] = ['auto', 'always', 'never'];

const CSS_LANGUAGE_IDS = new Set([
  'css',
  'scss',
  'less',
  'sass',
  'stylus',
  'postcss'
]);

export function isCssLikeLanguage(languageId: string): boolean {
  return CSS_LANGUAGE_IDS.has(languageId);
}

export function shouldDetectNamedColors(
  languageId: string,
  config: YacpConfig
): boolean {
  return (
    config.namedColors === 'always' ||
    (config.namedColors === 'auto' && isCssLikeLanguage(languageId))
  );
}

export function getConfig(uri?: vscode.Uri): YacpConfig {
  const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION, uri);

  const defaultFormat = configuration.get<string>('defaultFormat', 'auto');
  const hexCase = configuration.get<string>('hexCase', 'upper');
  const rawFormats = configuration.get<readonly string[]>('supportedFormats', [
    ...DEFAULT_FORMATS
  ]);
  const namedColors = configuration.get<string>('namedColors', 'auto');

  const formats = Array.isArray(rawFormats)
    ? rawFormats.filter(
        (format): format is ColorFormat =>
          typeof format === 'string' &&
          (COLOR_FORMATS as readonly string[]).includes(format)
      )
    : [];

  return {
    enable: configuration.get<boolean>('enable', true) !== false,
    defaultFormat: (DEFAULT_FORMAT_VALUES as readonly string[]).includes(defaultFormat)
      ? (defaultFormat as DefaultFormat)
      : 'auto',
    hexCase: hexCase === 'lower' ? 'lower' : 'upper',
    showAlpha: configuration.get<boolean>('showAlpha', false) === true,
    supportedFormats: formats.length > 0 ? formats : DEFAULT_FORMATS,
    namedColors: (NAMED_COLOR_MODES as readonly string[]).includes(namedColors)
      ? (namedColors as NamedColorMode)
      : 'auto'
  };
}

/** Order formats with the configured default first (when not "auto"). */
export function orderFormats(
  formats: readonly ColorFormat[],
  defaultFormat: DefaultFormat
): ColorFormat[] {
  if (defaultFormat === 'auto' || !formats.includes(defaultFormat)) {
    return [...formats];
  }
  return [
    defaultFormat,
    ...formats.filter((format) => format !== defaultFormat)
  ];
}
