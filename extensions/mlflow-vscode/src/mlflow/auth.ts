import * as vscode from 'vscode';
import { effectiveTrackingUri, type MlflowConfig } from '../config';
import type { MlflowAuthHeadersProvider } from './client';

const SESSION_TOKEN_SECRET = 'mlflow.openshiftSessionToken';
const SERVICE_ACCOUNT_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';

export class OpenShiftAuth implements MlflowAuthHeadersProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly config: MlflowConfig
  ) {}

  async getHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    if (!token) {
      return {};
    }
    return {
      Cookie: `${this.config.cookieName}=${token}`,
    };
  }

  async getToken(): Promise<string | undefined> {
    return this.context.secrets.get(SESSION_TOKEN_SECRET);
  }

  async clear(): Promise<void> {
    await this.context.secrets.delete(SESSION_TOKEN_SECRET);
  }

  async signIn(): Promise<string> {
    const trackingUri = effectiveTrackingUri(this.config);
    if (!trackingUri) {
      throw new Error('Configure MLflow tracking URI before signing in.');
    }

    const token = await this.obtainSessionToken(trackingUri);
    await this.context.secrets.store(SESSION_TOKEN_SECRET, token);
    return token;
  }

  private async obtainSessionToken(trackingUri: string): Promise<string> {
    const serviceAccountToken = await this.readServiceAccountToken();
    if (serviceAccountToken) {
      try {
        const token = await this.tokenViaOAuthChallenge(
          trackingUri,
          'serviceaccount',
          serviceAccountToken
        );
        if (await this.isTokenAccepted(trackingUri, token)) {
          return token;
        }
      } catch {
        // Fall through to the user-facing sign-in flow.
      }
    }

    const userToken = await this.promptForToken();
    if (!userToken) {
      throw new Error('OpenShift sign-in was cancelled.');
    }

    if (await this.isTokenAccepted(trackingUri, userToken)) {
      return userToken;
    }

    try {
      return await this.tokenViaOAuthChallenge(trackingUri, 'user', userToken);
    } catch {
      throw new Error(
        'The OpenShift access token was rejected. Generate a new token with oc whoami -t and try again.'
      );
    }
  }

  private async tokenViaOAuthChallenge(
    trackingUri: string,
    username: string,
    password: string
  ): Promise<string> {
    const oauthUrl = await this.discoverOAuthUrl(trackingUri);
    oauthUrl.searchParams.set('client_id', 'openshift-challenging-client');
    oauthUrl.searchParams.set('response_type', 'token');
    oauthUrl.searchParams.set('redirect_uri', 'urn:ietf:wg:oauth:2.0:oob');

    const credentials = toBase64(`${username}:${password}`);
    const response = await fetch(oauthUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Authorization: `Basic ${credentials}`,
      },
      signal: AbortSignal.timeout(15_000),
    });

    const location = response.headers.get('location');
    if (!location) {
      throw new Error(`OpenShift OAuth challenge failed with HTTP ${response.status}.`);
    }

    const token = extractAccessToken(new URL(location, oauthUrl));
    if (!token) {
      throw new Error('OpenShift OAuth challenge returned no access token.');
    }
    return token;
  }

  private async discoverOAuthUrl(trackingUri: string): Promise<URL> {
    const probeUrl = `${trackingUri}/api/2.0/mlflow/experiments/list?view_type=ALL`;
    const response = await fetch(probeUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });

    const location = response.headers.get('location');
    if (!location) {
      throw new Error(`MLflow route did not redirect to OpenShift OAuth (HTTP ${response.status}).`);
    }
    return new URL(location, probeUrl);
  }

  private async isTokenAccepted(trackingUri: string, token: string): Promise<boolean> {
    const response = await fetch(
      `${trackingUri}/api/2.0/mlflow/experiments/list?view_type=ALL`,
      {
        redirect: 'manual',
        headers: {
          Cookie: `${this.config.cookieName}=${token}`,
        },
        signal: AbortSignal.timeout(15_000),
      }
    );
    return response.ok;
  }

  private async readServiceAccountToken(): Promise<string | undefined> {
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.file(SERVICE_ACCOUNT_TOKEN_PATH)
      );
      const token = new TextDecoder().decode(bytes).trim();
      return token || undefined;
    } catch {
      return undefined;
    }
  }

  private async promptForToken(): Promise<string | undefined> {
    const panel = vscode.window.createWebviewPanel(
      'mlflowOpenShiftSignIn',
      'Sign in to OpenShift',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }
    );
    panel.webview.html = getSignInHtml();

    return new Promise<string | undefined>((resolve) => {
      const messageSubscription = panel.webview.onDidReceiveMessage((message) => {
        if (message.type === 'submit') {
          cleanup();
          resolve(String(message.token ?? '').trim() || undefined);
          panel.dispose();
        } else if (message.type === 'cancel') {
          cleanup();
          resolve(undefined);
          panel.dispose();
        }
      });

      const disposeSubscription = panel.onDidDispose(() => {
        cleanup();
        resolve(undefined);
      });

      function cleanup(): void {
        messageSubscription.dispose();
        disposeSubscription.dispose();
      }
    });
  }
}

function extractAccessToken(url: URL): string | undefined {
  const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (fragment) {
    const token = new URLSearchParams(fragment).get('access_token');
    if (token) {
      return token;
    }
  }
  return url.searchParams.get('access_token') ?? undefined;
}

function toBase64(value: string): string {
  return btoa(value);
}

function getSignInHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); margin: 24px; }
    h1 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
    p { color: var(--vscode-descriptionForeground); line-height: 1.5; margin: 8px 0 16px; }
    input { width: 100%; box-sizing: border-box; padding: 8px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); }
    .row { display: flex; gap: 8px; margin-top: 16px; }
    button { padding: 6px 12px; cursor: pointer; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  </style>
</head>
<body>
  <h1>Sign in to OpenShift</h1>
  <p>Paste an OpenShift access token from <code>oc whoami -t</code> or the web console. The token is stored in VS Code SecretStorage.</p>
  <input id="token" type="password" autocomplete="off" placeholder="OpenShift access token">
  <div class="row">
    <button id="submit">Sign in</button>
    <button id="cancel" class="secondary">Cancel</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const token = document.getElementById('token');
    document.getElementById('submit').addEventListener('click', () => vscode.postMessage({ type: 'submit', token: token.value }));
    document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    token.addEventListener('keydown', (event) => { if (event.key === 'Enter') document.getElementById('submit').click(); });
    token.focus();
  </script>
</body>
</html>`;
}
