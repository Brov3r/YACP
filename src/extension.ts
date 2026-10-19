import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { CONFIG_KEYS } from './config';
import { YacpColorProvider } from './colorProvider';

/**
 * The language wildcard is intentional: YACP must not depend on a file's
 * language mode or syntax grammar. The provider is registered for every text
 * document VS Code exposes to extensions (files, untitled documents, virtual
 * and remote file systems, notebook cells, etc.).
 */
const ALL_TEXT_DOCUMENTS: vscode.DocumentSelector = { scheme: '*' };

export function activate(context: vscode.ExtensionContext): void {
  const provider = new YacpColorProvider();

  let registration = vscode.languages.registerColorProvider(
    ALL_TEXT_DOCUMENTS,
    provider
  );

  const refreshRegistration = (): void => {
    // Re-registering makes VS Code recompute color decorators, which is the
    // only supported way to apply a settings change to already open editors.
    registration.dispose();
    registration = vscode.languages.registerColorProvider(
      ALL_TEXT_DOCUMENTS,
      provider
    );
  };

  context.subscriptions.push(
    {
      dispose: () => registration.dispose()
    },
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (CONFIG_KEYS.some((key) => event.affectsConfiguration(key))) {
        refreshRegistration();
      }
    })
  );

  registerCommands(context);
}

export function deactivate(): void {
  // All disposables are owned by the extension context.
}
