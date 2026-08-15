import * as vscode from 'vscode';

const PAT_SECRET_KEY = 'depinference.azurePat';

/**
 * Optional: a PAT lets the extension create pull requests automatically and
 * poll their status. Without it, submit still works — the prefilled PR
 * creation page opens in the browser instead.
 */
export class PatStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async get(): Promise<string | undefined> {
    const pat = await this.context.secrets.get(PAT_SECRET_KEY);
    return pat && pat.trim() ? pat.trim() : undefined;
  }

  async set(pat: string): Promise<void> {
    await this.context.secrets.store(PAT_SECRET_KEY, pat.trim());
  }

  async clear(): Promise<void> {
    await this.context.secrets.delete(PAT_SECRET_KEY);
  }

  async promptAndSet(): Promise<boolean> {
    const pat = await vscode.window.showInputBox({
      title: 'Azure DevOps PAT',
      prompt: 'Personal access token with Code (Read & Write) scope. Stored in SecretStorage.',
      password: true,
      ignoreFocusOut: true,
    });
    if (pat === undefined) {
      return false;
    }
    if (!pat.trim()) {
      void vscode.window.showWarningMessage('PAT was empty; nothing was saved.');
      return false;
    }
    await this.set(pat);
    void vscode.window.showInformationMessage('Azure DevOps PAT saved.');
    return true;
  }
}
