import * as vscode from 'vscode';
import {
  getConfig,
  isCssLikeLanguage,
  orderFormats,
  shouldDetectNamedColors
} from './config';
import { formatColor, formatPreserving } from './colorConverter';
import { parseColorLiteral, parseColors } from './colorParser';
import { ColorStyle, ParsedColor, RgbaColor } from './types';

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

/**
 * Converts document offsets to VS Code ranges while walking line starts once.
 * Parsed colors are sorted, so this is linear in the document size.
 */
function rangesFromColors(
  document: vscode.TextDocument,
  lineStarts: readonly number[],
  colors: readonly ParsedColor[],
  token: vscode.CancellationToken
): vscode.ColorInformation[] {
  const result: vscode.ColorInformation[] = [];
  let lineIndex = 0;

  for (let index = 0; index < colors.length; index += 1) {
    if (token.isCancellationRequested) {
      return [];
    }

    const parsed = colors[index];

    while (
      lineIndex + 1 < lineStarts.length &&
      parsed.start >= lineStarts[lineIndex + 1]
    ) {
      lineIndex += 1;
    }
    const start = new vscode.Position(
      lineIndex,
      parsed.start - lineStarts[lineIndex]
    );

    while (
      lineIndex + 1 < lineStarts.length &&
      parsed.end >= lineStarts[lineIndex + 1]
    ) {
      lineIndex += 1;
    }
    const end = new vscode.Position(
      lineIndex,
      parsed.end - lineStarts[lineIndex]
    );

    result.push(
      new vscode.ColorInformation(
        new vscode.Range(start, end),
        new vscode.Color(parsed.color.r, parsed.color.g, parsed.color.b, parsed.color.a)
      )
    );
  }

  return result;
}

function toRgbaColor(color: vscode.Color): RgbaColor {
  return { r: color.red, g: color.green, b: color.blue, a: color.alpha };
}

export class YacpColorProvider implements vscode.DocumentColorProvider {
  public provideDocumentColors(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.ColorInformation[]> {
    const config = getConfig(document.uri);
    if (!config.enable || token.isCancellationRequested) {
      return [];
    }

    // VS Code's built-in CSS/SCSS/LESS extension registers its own color
    // provider. Returning overlapping information would render duplicate
    // swatches, so CSS-like languages keep the built-in provider. YACP's
    // commands and parser still fully support these files.
    if (isCssLikeLanguage(document.languageId)) {
      return [];
    }

    const namedColors = shouldDetectNamedColors(
      document.languageId,
      config
    );
    const text = document.getText();
    const colors = parseColors(text, { token, namedColors });

    // A cancelled scan may be partial; never display partial data.
    if (token.isCancellationRequested) {
      return [];
    }

    if (colors.length === 0) {
      return [];
    }

    return rangesFromColors(
      document,
      buildLineStarts(text),
      colors,
      token
    );
  }

  public provideColorPresentations(
    color: vscode.Color,
    context: {
      readonly document: vscode.TextDocument;
      readonly range: vscode.Range;
    },
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.ColorPresentation[]> {
    const config = getConfig(context.document.uri);
    if (!config.enable || token.isCancellationRequested) {
      return [];
    }

    const rgba = toRgbaColor(color);
    const originalText = context.document.getText(context.range);
    const original = parseColorLiteral(originalText, { namedColors: true });
    const style: ColorStyle | undefined = original?.style;

    const presentations: vscode.ColorPresentation[] = [];
    const seenTexts = new Set<string>();

    const addPresentation = (label: string, text: string): void => {
      if (token.isCancellationRequested || seenTexts.has(text)) {
        return;
      }
      seenTexts.add(text);
      const presentation = new vscode.ColorPresentation(label);
      presentation.textEdit = new vscode.TextEdit(context.range, text);
      presentations.push(presentation);
    };

    const addFormat = (format: (typeof config.supportedFormats)[number]): void => {
      const includeAlpha =
        format === 'rgba' || format === 'hsla' ? 'always' : 'auto';
      const text = formatColor(rgba, format, {
        hexCase: config.hexCase,
        showAlpha: config.showAlpha,
        includeAlpha
      });
      // VS Code uses the label to guess which presentation matches the
      // original literal. Using the text itself makes the first matching
      // presentation deterministic (preserve when defaultFormat is auto).
      addPresentation(text, text);
    };

    const formats = orderFormats(config.supportedFormats, config.defaultFormat);

    // When the user explicitly prefers a format, offer it first. Otherwise the
    // original literal's own format/style is the default, matching the
    // requirement that changing a color must not convert it implicitly.
    if (
      config.defaultFormat !== 'auto' &&
      config.supportedFormats.includes(config.defaultFormat)
    ) {
      addFormat(config.defaultFormat);
    }

    if (style) {
      const preserved = formatPreserving(rgba, style, {
        hexCase: config.hexCase,
        showAlpha: config.showAlpha
      });
      addPresentation(preserved, preserved);
    }

    for (const format of formats) {
      addFormat(format);
    }

    return presentations;
  }
}
