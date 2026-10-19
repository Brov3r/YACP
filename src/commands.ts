import * as vscode from 'vscode';
import {
  getConfig,
  isCssLikeLanguage,
  orderFormats,
  shouldDetectNamedColors,
  YacpConfig
} from './config';
import { applyContextFilters } from './colorFilters';
import { formatColor, isTransparent } from './colorConverter';
import { findColorAtOffset, parseColors } from './colorParser';
import {
  COLOR_FORMAT_LABELS,
  ColorFormat,
  ParsedColor
} from './types';

interface ColorQuickPickItem extends vscode.QuickPickItem {
  readonly parsed: ParsedColor;
}

interface FormatQuickPickItem extends vscode.QuickPickItem {
  readonly format: ColorFormat;
  readonly discardsAlpha: boolean;
}

function rangeFor(
  document: vscode.TextDocument,
  parsed: ParsedColor
): vscode.Range {
  return new vscode.Range(
    document.positionAt(parsed.start),
    document.positionAt(parsed.end)
  );
}

function getActiveEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showInformationMessage(
      'YACP: Open a text editor to use the color picker.'
    );
    return undefined;
  }
  return editor;
}

function colorsInContext(
  document: vscode.TextDocument,
  selection: vscode.Selection,
  config: YacpConfig
): ParsedColor[] {
  const text = document.getText();
  const namedColors = shouldDetectNamedColors(document.languageId, config);
  const colors = applyContextFilters(
    text,
    parseColors(text, { namedColors }),
    {
      namedContext: namedColors && config.namedColors === 'auto',
      cssLike: isCssLikeLanguage(document.languageId)
    }
  );

  if (selection.isEmpty) {
    const found = findColorAtOffset(
      colors,
      document.offsetAt(selection.active)
    );
    return found ? [found] : [];
  }

  const start = document.offsetAt(selection.start);
  const end = document.offsetAt(selection.end);
  const contained = colors.filter(
    (color) => color.start >= start && color.end <= end
  );
  if (contained.length > 0) {
    return contained;
  }

  return colors.filter((color) => color.start < end && color.end > start);
}

async function chooseColor(
  document: vscode.TextDocument,
  colors: readonly ParsedColor[]
): Promise<ParsedColor | undefined> {
  if (colors.length === 0) {
    void vscode.window.showInformationMessage(
      'YACP: No supported color literal was found at the cursor or in the selection.'
    );
    return undefined;
  }

  if (colors.length === 1) {
    return colors[0];
  }

  const items: ColorQuickPickItem[] = colors.map((parsed) => {
    const position = document.positionAt(parsed.start);
    return {
      label: document.getText(rangeFor(document, parsed)),
      description: `Line ${position.line + 1}`,
      parsed
    };
  });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select the color to use'
  });
  return picked?.parsed;
}

function alphaIsDiscarded(format: ColorFormat, parsed: ParsedColor): boolean {
  return (
    (format === 'rgb' || format === 'hsl') && isTransparent(parsed.color)
  );
}

function previewConversion(
  color: ParsedColor,
  format: ColorFormat,
  config: YacpConfig,
  discardAlpha: boolean
): string {
  const includeAlpha = discardAlpha
    ? 'never'
    : format === 'rgba' || format === 'hsla'
      ? 'always'
      : 'auto';

  return formatColor(color.color, format, {
    hexCase: config.hexCase,
    showAlpha: config.showAlpha,
    includeAlpha
  });
}

/**
 * Replace only the color literal. Exported so integration tests can verify
 * that surrounding document content is preserved and undo works normally.
 */
export async function applyColorConversion(
  document: vscode.TextDocument,
  parsed: ParsedColor,
  format: ColorFormat,
  config: YacpConfig,
  discardAlpha = false
): Promise<boolean> {
  const text = previewConversion(parsed, format, config, discardAlpha);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, rangeFor(document, parsed), text);
  return vscode.workspace.applyEdit(edit);
}

async function convertColorFormatCommand(): Promise<void> {
  const editor = getActiveEditor();
  if (!editor) {
    return;
  }

  const config = getConfig(editor.document.uri);
  if (!config.enable) {
    void vscode.window.showInformationMessage(
      'YACP is disabled by the "yacp.enable" setting.'
    );
    return;
  }

  const colors = colorsInContext(editor.document, editor.selection, config);
  const parsed = await chooseColor(editor.document, colors);
  if (!parsed) {
    return;
  }

  const formats = orderFormats(config.supportedFormats, config.defaultFormat);
  const items: FormatQuickPickItem[] = formats.map((format) => {
    const discardsAlpha = alphaIsDiscarded(format, parsed);
    const preview = previewConversion(parsed, format, config, discardsAlpha);
    return {
      label: COLOR_FORMAT_LABELS[format],
      description: preview,
      detail: discardsAlpha
        ? 'Alpha transparency will be discarded. Use RGBA, HSLA or HEX to keep it.'
        : undefined,
      format,
      discardsAlpha
    };
  });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Choose the target color format',
    matchOnDescription: true
  });
  if (!picked) {
    return;
  }

  if (picked.discardsAlpha) {
    const confirmation = await vscode.window.showWarningMessage(
      'This target format cannot represent alpha transparency. Convert and discard the alpha channel?',
      { modal: true },
      'Convert and discard alpha'
    );
    if (confirmation !== 'Convert and discard alpha') {
      return;
    }
  }

  const applied = await applyColorConversion(
    editor.document,
    parsed,
    picked.format,
    config,
    picked.discardsAlpha
  );

  if (!applied) {
    void vscode.window.showErrorMessage(
      'YACP: The color could not be converted. The document may be read-only.'
    );
    return;
  }

  vscode.window.setStatusBarMessage('YACP: color converted', 3000);
}

async function pickColorCommand(): Promise<void> {
  const editor = getActiveEditor();
  if (!editor) {
    return;
  }

  const config = getConfig(editor.document.uri);
  if (!config.enable) {
    void vscode.window.showInformationMessage(
      'YACP is disabled by the "yacp.enable" setting.'
    );
    return;
  }

  const colors = colorsInContext(editor.document, editor.selection, config);
  const parsed = await chooseColor(editor.document, colors);
  if (!parsed) {
    return;
  }

  const range = rangeFor(editor.document, parsed);
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

  try {
    // VS Code exposes its standalone picker as a built-in command. It uses
    // registered DocumentColorProviders (including YACP) for the color under
    // the cursor/selection, preserving the native look and undo behavior.
    await vscode.commands.executeCommand(
      'editor.action.showOrFocusStandaloneColorPicker'
    );
  } catch {
    const fallback = await vscode.window.showWarningMessage(
      'The native standalone color picker is not available in this VS Code version. You can still convert this color with YACP.',
      'Convert Color Format'
    );
    if (fallback === 'Convert Color Format') {
      await vscode.commands.executeCommand('yacp.convertColorFormat');
    }
  }
}

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('yacp.pickColor', pickColorCommand),
    vscode.commands.registerCommand(
      'yacp.convertColorFormat',
      convertColorFormatCommand
    )
  );
}
