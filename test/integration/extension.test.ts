import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { applyColorConversion } from '../../src/commands';
import { getConfig } from '../../src/config';
import { parseColors } from '../../src/colorParser';

async function openDocument(
  content: string,
  language = 'plaintext'
): Promise<vscode.TextDocument> {
  return vscode.workspace.openTextDocument({ content, language });
}

async function documentColors(
  document: vscode.TextDocument
): Promise<vscode.ColorInformation[]> {
  await vscode.window.showTextDocument(document, { preview: false });
  return (
    (await vscode.commands.executeCommand<vscode.ColorInformation[]>(
      'vscode.executeDocumentColorProvider',
      document.uri
    )) ?? []
  );
}

describe('YACP extension integration', () => {
  before(async () => {
    const extension = vscode.extensions.getExtension('yacp.yacp');
    assert.ok(extension, 'YACP extension should be discoverable');
    await extension.activate();
    assert.equal(extension.isActive, true);
  });

  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('registers its commands and the native standalone picker command', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('yacp.pickColor'));
    assert.ok(commands.includes('yacp.convertColorFormat'));
    assert.ok(
      commands.includes('editor.action.showOrFocusStandaloneColorPicker'),
      'The native picker fallback command should exist'
    );
  });

  it('detects colors independently of the language mode', async () => {
    const content =
      'a = "#FF0080"; b = rgb(255, 0, 128); c = hsl(270, 60%, 50%);';

    for (const language of [
      'plaintext',
      'python',
      'javascript',
      'typescript',
      'json',
      'markdown',
      'html',
      'xml',
      'yaml',
      'toml',
      'rust',
      'go',
      'java',
      'csharp',
      'yacp-custom-language'
    ]) {
      const document = await openDocument(content, language);
      const colors = await documentColors(document);
      assert.equal(
        colors.length,
        3,
        `Expected three colors for language ${language}`
      );
    }
  });

  it('detects colors in real files on disk', async () => {
    const file = path.join(
      os.tmpdir(),
      `yacp-extension-test-${process.pid}-${Date.now()}.txt`
    );
    fs.writeFileSync(file, '#ff0080\nrgb(0 0 0)\n', 'utf8');

    try {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.file(file)
      );
      const colors = await documentColors(document);
      assert.equal(colors.length, 2);
      assert.equal(document.getText(colors[0].range), '#ff0080');
      assert.equal(document.getText(colors[1].range), 'rgb(0 0 0)');
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('does not treat named words in plaintext as colors', async () => {
    const document = await openDocument(
      'red = 1; blue = 2; transparent = true;',
      'plaintext'
    );
    assert.equal((await documentColors(document)).length, 0);
  });

  it('detects modern CSS color spaces universally', async () => {
    const content =
      'a = lab(53.24 80.09 67.2);\n' +
      'b = oklch(0.62796 0.25768 29.2);\n' +
      'c = color(display-p3 0.5 0.2 0.8 / 50%);';
    const document = await openDocument(content, 'plaintext');
    const colors = await documentColors(document);
    assert.equal(colors.length, 3);
    assert.ok(Math.abs(colors[0].color.red - 1) < 0.02);
    assert.equal(colors[2].color.alpha, 0.5);
  });

  it('returns exact ranges for multiple and multi-line colors', async () => {
    const content =
      'const a = "#1e90ff";\r\n' +
      'const b = rgba(255, 0, 0, 0.5);\r\n' +
      'const c = rgb(\r\n  0,\r\n  255,\r\n  0\r\n);';
    const document = await openDocument(content, 'javascript');
    const colors = await documentColors(document);

    assert.equal(colors.length, 3);
    assert.equal(document.getText(colors[0].range), '#1e90ff');
    assert.equal(document.getText(colors[1].range), 'rgba(255, 0, 0, 0.5)');
    assert.equal(
      document.getText(colors[2].range),
      'rgb(\r\n  0,\r\n  255,\r\n  0\r\n)'
    );
    assert.equal(colors[1].color.alpha, 0.5);
    assert.equal(colors[1].range.start.line, 1);
    assert.equal(colors[2].range.start.line, 2);
    assert.equal(colors[2].range.end.line, 6);
  });

  it('updates colors after a document edit', async () => {
    const document = await openDocument('one = "#fff";', 'plaintext');
    const editor = await vscode.window.showTextDocument(document);
    let colors = await documentColors(document);
    assert.equal(colors.length, 1);

    await editor.edit((edit) => {
      edit.insert(new vscode.Position(0, 0), 'two = "#000";\n');
    });

    colors = await documentColors(document);
    assert.equal(colors.length, 2);
    assert.equal(document.getText(colors[0].range), '#000');
    assert.equal(document.getText(colors[1].range), '#fff');
  });

  it('provides preservation and conversion presentations', async () => {
    const document = await openDocument('color: #ff0080;', 'plaintext');
    const colors = await documentColors(document);
    assert.equal(colors.length, 1);

    const presentations =
      (await vscode.commands.executeCommand<vscode.ColorPresentation[]>(
        'vscode.executeColorPresentationProvider',
        colors[0].color,
        { uri: document.uri, range: colors[0].range }
      )) ?? [];

    assert.ok(presentations.length >= 6, 'Expected several formats');

    const texts = presentations.map(
      (presentation) => presentation.textEdit?.newText
    );
    assert.ok(texts.includes('#ff0080'), 'Preserve original lowercase HEX');
    assert.ok(texts.includes('#FF0080'), 'Uppercase HEX conversion');
    assert.ok(
      texts.some((text) => text?.startsWith('rgb(')),
      'RGB conversion'
    );
    assert.ok(
      texts.some((text) => text?.startsWith('hsl(')),
      'HSL conversion'
    );

    const preserve = presentations.find(
      (presentation) => presentation.textEdit?.newText === '#ff0080'
    );
    assert.ok(preserve);
    assert.ok(preserve.textEdit?.range.isEqual(colors[0].range));
  });

  it('applies a conversion to exactly the color range and supports undo', async () => {
    const original = 'before = "#FF0080"; after = 42; // untouched';
    const document = await openDocument(original, 'plaintext');
    const editor = await vscode.window.showTextDocument(document);
    const parsed = parseColors(original)[0];
    assert.ok(parsed);

    const applied = await applyColorConversion(
      document,
      parsed,
      'rgba',
      getConfig(document.uri)
    );
    assert.equal(applied, true);
    assert.equal(
      document.getText(),
      'before = "rgba(255, 0, 128, 1)"; after = 42; // untouched'
    );

    await vscode.commands.executeCommand('undo');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(document.getText(), original);
    assert.equal(editor.document.getText(), original);
  });

  it('preserves alpha when converting to HEX', async () => {
    const original = 'stroke = rgba(255, 0, 0, 0.5);';
    const document = await openDocument(original, 'plaintext');
    await vscode.window.showTextDocument(document);
    const parsed = parseColors(original)[0];

    const applied = await applyColorConversion(
      document,
      parsed,
      'hex',
      getConfig(document.uri)
    );
    assert.equal(applied, true);
    assert.equal(document.getText(), 'stroke = #FF000080;');
  });
});
