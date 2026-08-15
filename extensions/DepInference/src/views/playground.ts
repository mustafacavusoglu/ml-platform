import * as vscode from 'vscode';

export class PlaygroundPanel {
  private static current?: PlaygroundPanel;

  private panel: vscode.WebviewPanel;
  private deploymentName: string;
  private predictorUrl: string;

  constructor(deploymentName: string, predictorUrl: string) {
    this.deploymentName = deploymentName;
    this.predictorUrl = predictorUrl;

    if (PlaygroundPanel.current) {
      PlaygroundPanel.current.panel.dispose();
    }

    this.panel = vscode.window.createWebviewPanel(
      'depinferencePlayground',
      `Playground — ${deploymentName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }
    );
    this.panel.webview.html = getPlaygroundHtml(this.deploymentName, this.predictorUrl);
    this.panel.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message as PlaygroundMessage);
    });
    this.panel.onDidDispose(() => {
      if (PlaygroundPanel.current === this) {
        PlaygroundPanel.current = undefined;
      }
    });
    PlaygroundPanel.current = this;
  }

  private async handleMessage(message: PlaygroundMessage): Promise<void> {
    if (message.type !== 'predict') {
      return;
    }

    const startTime = Date.now();
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (message.authToken) {
        headers['Authorization'] = `Bearer ${message.authToken}`;
      }

      const response = await fetch(
        `${this.predictorUrl}/v1/models/${this.deploymentName}:predict`,
        {
          method: 'POST',
          headers,
          body: message.body,
          signal: AbortSignal.timeout(60_000),
        }
      );

      const elapsed = Date.now() - startTime;
      const responseBody = await response.text();
      const pretty = tryPrettyJson(responseBody);

      await this.panel.webview.postMessage({
        type: 'response',
        status: response.status,
        statusText: response.statusText,
        elapsed,
        body: pretty,
        raw: responseBody,
      });
    } catch (error) {
      const elapsed = Date.now() - startTime;
      await this.panel.webview.postMessage({
        type: 'response',
        status: 0,
        statusText: 'Error',
        elapsed,
        body: error instanceof Error ? error.message : String(error),
        raw: '',
      });
    }
  }
}

type PlaygroundMessage = {
  type: 'predict';
  body: string;
  authToken?: string;
};

function getPlaygroundHtml(name: string, predictorUrl: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    :root {
      color-scheme: light dark;
      --border: var(--vscode-panel-border, #ccc);
      --muted: var(--vscode-descriptionForeground, #777);
      --accent: var(--vscode-focusBorder, #007fd4);
      --card-bg: var(--vscode-editorWidget-background, #252526);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .endpoint {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--card-bg);
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .endpoint label { font-weight: 600; }
    .endpoint code {
      color: var(--vscode-textLink-foreground);
      word-break: break-all;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      height: calc(100vh - 85px);
    }
    .request-panel, .response-panel {
      display: flex;
      flex-direction: column;
    }
    .request-panel { border-right: 1px solid var(--border); }
    .panel-header {
      padding: 10px 16px;
      font-size: 12px;
      font-weight: 600;
      border-bottom: 1px solid var(--border);
      background: var(--card-bg);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .panel-body { flex: 1; display: flex; flex-direction: column; }
    textarea {
      flex: 1;
      resize: none;
      padding: 12px 16px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      line-height: 1.5;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: none;
      outline: none;
    }
    .auth-row {
      padding: 8px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .auth-row input {
      flex: 1;
      padding: 4px 6px;
      font: inherit;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
    }
    .send-row {
      padding: 10px 16px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 8px;
      background: var(--card-bg);
    }
    button {
      padding: 6px 14px;
      font: inherit;
      cursor: pointer;
      border: none;
    }
    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .response-body {
      flex: 1;
      overflow: auto;
      padding: 12px 16px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .status-bar {
      padding: 8px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 16px;
      font-size: 12px;
      background: var(--card-bg);
    }
    .status-bar span { color: var(--muted); }
    .status-bar .value { color: var(--vscode-foreground); font-weight: 600; }
    @media (max-width: 720px) {
      .grid { grid-template-columns: 1fr; height: auto; }
      .request-panel { border-right: 0; border-bottom: 1px solid var(--border); }
    }
  </style>
</head>
<body>
  <div class="endpoint">
    <label>Endpoint</label>
    <code>${predictorUrl}/v1/models/${name}:predict</code>
  </div>
  <div class="grid">
    <div class="request-panel">
      <div class="panel-header">Request</div>
      <div class="panel-body">
        <div class="auth-row">
          <label style="font-weight:400;color:var(--muted)">Auth Token</label>
          <input id="authToken" type="password" placeholder="optional Bearer token">
        </div>
        <textarea id="requestBody" placeholder='{"inputs": [[...]]}'>{
  "inputs": [[5.1, 3.5, 1.4, 0.2]]
}</textarea>
        <div class="send-row">
          <button class="primary" id="sendBtn">Send</button>
          <button class="secondary" id="clearBtn">Clear</button>
        </div>
      </div>
    </div>
    <div class="response-panel">
      <div class="panel-header">Response</div>
      <div class="status-bar" id="statusBar" style="display:none">
        <span>Status: <span class="value" id="respStatus"></span></span>
        <span>Time: <span class="value" id="respTime"></span></span>
      </div>
      <div class="response-body" id="responseBody">Send a request to see the response.</div>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);
    const requestBody = $('requestBody');
    const authToken = $('authToken');
    const responseBody = $('responseBody');
    const statusBar = $('statusBar');
    const respStatus = $('respStatus');
    const respTime = $('respTime');

    $('sendBtn').addEventListener('click', () => {
      responseBody.textContent = 'Sending…';
      statusBar.style.display = 'none';
      vscode.postMessage({
        type: 'predict',
        body: requestBody.value,
        authToken: authToken.value.trim() || undefined,
      });
    });

    $('clearBtn').addEventListener('click', () => {
      requestBody.value = '';
      responseBody.textContent = 'Send a request to see the response.';
      statusBar.style.display = 'none';
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'response') {
        statusBar.style.display = 'flex';
        respStatus.textContent = msg.status + (msg.statusText ? ' ' + msg.statusText : '');
        respTime.textContent = msg.elapsed + 'ms';
        responseBody.textContent = msg.body || '(empty)';
      }
    });
  </script>
</body>
</html>`;
}

function tryPrettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
