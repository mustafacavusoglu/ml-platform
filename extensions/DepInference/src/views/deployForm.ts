import * as vscode from 'vscode';
import { getConfig, type DepInferenceConfig } from '../config';
import { getMlflowSettings, type MlflowSettings } from '../mlflow/mlflowSettings';
import { KubernetesSecretAuth } from '../mlflow/secretAuth';
import { BasicAuth } from '../mlflow/basicAuth';
import { MlflowClient, type MlflowAuthHeadersProvider } from '../mlflow/client';
import { type MlflowExperiment, type MlflowRun } from '../mlflow/types';
import {
  validateDeploymentSpec,
  type DeploymentSpec,
  type DeploymentFormErrors,
} from '../core/deployment';
import {
  resolveResourcePresets,
  describePreset,
  DEFAULT_SIZE,
  MIG_PROFILES,
  type ResourcePreset,
} from '../core/presets';
import { deploymentPreviewYaml } from '../deploy/valuesPatcher';

interface SerializedRun {
  id: string;
  name: string;
  status: string;
  startTime?: number;
}

export class DeployFormPanel {
  private static current?: DeployFormPanel;
  private panel: vscode.WebviewPanel;
  private config: DepInferenceConfig;
  private mlflowSettings: MlflowSettings;
  private presets: Record<string, ResourcePreset>;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly onSubmit: (
      spec: DeploymentSpec,
      preset: ResourcePreset
    ) => Promise<void>
  ) {
    this.config = getConfig();
    this.mlflowSettings = getMlflowSettings();
    this.presets = resolveResourcePresets(this.config.resourcePresets);

    if (DeployFormPanel.current) {
      DeployFormPanel.current.panel.reveal(vscode.ViewColumn.One);
      this.panel = DeployFormPanel.current.panel;
      this.config = getConfig();
      this.mlflowSettings = getMlflowSettings();
      this.presets = resolveResourcePresets(this.config.resourcePresets);
      void this.pushInitialData();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'depinferenceDeploy',
      'New Deployment',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }
    );
    this.panel.webview.html = getFormHtml();
    this.panel.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message as FormMessage);
    });
    this.panel.onDidDispose(() => {
      if (DeployFormPanel.current === this) {
        DeployFormPanel.current = undefined;
      }
    });
    DeployFormPanel.current = this;
    void this.pushInitialData();
  }

  static notifySubmitted(payload: {
    prUrl: string;
    branch: string;
    prAutoCreated: boolean;
  }): void {
    DeployFormPanel.current?.panel.webview.postMessage({ type: 'submitted', ...payload });
  }

  private async pushInitialData(): Promise<void> {
    await this.panel.webview.postMessage({
      type: 'init',
      presets: Object.fromEntries(
        Object.entries(this.presets).map(([name, preset]) => [name, describePreset(preset)])
      ),
      defaultSize: DEFAULT_SIZE,
      imageCatalog: this.config.imageCatalog ?? [],
      repoUrl: this.config.azureRepoUrl,
      projectName: this.config.projectName ?? '',
      migProfiles: [...MIG_PROFILES],
      dummyData: this.config.useDummyData,
    });
    void this.loadProjectExperiment();
  }

  private async loadProjectExperiment(): Promise<void> {
    try {
      const projectName = this.config.projectName;
      if (!projectName) {
        await this.panel.webview.postMessage({
          type: 'error',
          message: 'Project name is not available. Set depinference.workbenchName or depinference.namespace.',
        });
        return;
      }

      const auth = this.createMlflowAuth();
      const client = new MlflowClient(this.mlflowSettings, auth);
      const experiment = await client.getExperimentByName(projectName);
      if (!experiment.experimentId) {
        throw new Error(`MLflow experiment "${projectName}" was not found.`);
      }

      await this.panel.webview.postMessage({
        type: 'experiment',
        experimentId: experiment.experimentId,
        name: experiment.name || projectName,
      });

      const runs = await client.listRuns(experiment.experimentId);
      const serialized: SerializedRun[] = runs.map((r) => ({
        id: r.info.runId,
        name: r.info.runName ?? r.info.runId,
        status: r.info.status,
        startTime: r.info.startTime,
      }));
      await this.panel.webview.postMessage({ type: 'runs', runs: serialized });
    } catch (error) {
      await this.panel.webview.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleMessage(message: FormMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.pushInitialData();
        break;
      case 'preview': {
        const spec = message.spec;
        const preset = this.presets[spec.size ?? DEFAULT_SIZE] ?? this.presets[DEFAULT_SIZE];
        const yaml = deploymentPreviewYaml(spec, preset);
        await this.panel.webview.postMessage({ type: 'yamlPreview', yaml });
        break;
      }
      case 'submit': {
        const spec = message.spec;
        const errors = validateDeploymentSpec(spec, this.presets);
        if (Object.keys(errors).length > 0) {
          await this.panel.webview.postMessage({ type: 'validationErrors', errors });
          return;
        }
        const preset = this.presets[spec.size];
        await this.onSubmit(spec, preset);
        break;
      }
    }
  }

  private createMlflowAuth(): MlflowAuthHeadersProvider {
    if (this.mlflowSettings.useDummyData) {
      return {
        getHeaders: async () => ({}),
        getTrackingUri: async () => undefined,
      };
    }
    if (this.mlflowSettings.authMode === 'basic') {
      return new BasicAuth(this.mlflowSettings);
    }
    return new KubernetesSecretAuth(this.context, this.mlflowSettings);
  }
}

type FormMessage =
  | { type: 'ready' }
  | { type: 'preview'; spec: DeploymentSpec }
  | { type: 'submit'; spec: DeploymentSpec };

function getFormHtml(): string {
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
      --error: var(--vscode-errorForeground, #f14c4c);
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
    .layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      min-height: 100vh;
    }
    .left, .right {
      display: flex;
      flex-direction: column;
    }
    .left { border-right: 1px solid var(--border); }
    .header {
      padding: 16px 20px;
      font-weight: 600;
      font-size: 14px;
      border-bottom: 1px solid var(--border);
      background: var(--card-bg);
    }
    .form { padding: 16px 20px; overflow: auto; flex: 1; }
    .field { margin-bottom: 14px; }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    label {
      display: block;
      font-weight: 600;
      margin-bottom: 4px;
      font-size: 12px;
      color: var(--vscode-foreground);
    }
    label .hint {
      font-weight: 400;
      color: var(--muted);
      margin-left: 6px;
    }
    input, select {
      width: 100%;
      padding: 6px 8px;
      font: inherit;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
    }
    input:focus, select:focus { outline: 1px solid var(--accent); }
    .toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }
    .toggle-row input[type="checkbox"] { width: auto; }
    .conditional { display: none; }
    .conditional.visible { display: block; margin-top: 10px; }
    .error { color: var(--error); font-size: 11px; margin-top: 2px; min-height: 14px; }
    .actions {
      padding: 12px 20px;
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
    .yaml-header {
      padding: 12px 20px;
      font-size: 12px;
      font-weight: 600;
      border-bottom: 1px solid var(--border);
      background: var(--card-bg);
    }
    .yaml-body {
      flex: 1;
      overflow: auto;
      padding: 16px 20px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      line-height: 1.5;
      white-space: pre;
      color: var(--vscode-foreground);
    }
    .error-banner {
      padding: 10px 20px;
      color: var(--error);
      background: var(--vscode-inputValidation-errorBackground);
      border-bottom: 1px solid var(--border);
      display: none;
    }
    .error-banner.visible { display: block; }
    .status-message {
      padding: 10px 20px;
      border-bottom: 1px solid var(--border);
      display: none;
    }
    .status-message.visible { display: block; }
    @media (max-width: 720px) {
      .layout { grid-template-columns: 1fr; }
      .left { border-right: 0; border-bottom: 1px solid var(--border); }
      .field-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <div class="left">
      <div class="header">New Deployment</div>
      <div class="error-banner" id="errorBanner"></div>
      <div class="status-message" id="statusMessage"></div>
      <div class="form">
        <div class="field">
          <label>Deployment <span class="hint">(auto from project)</span></label>
          <input id="name" type="text" readonly value="" autocomplete="off">
          <div class="error" id="nameError"></div>
        </div>
        <div class="field">
          <label>Type</label>
          <div class="field-row">
            <select id="type">
              <option value="online">Online (InferenceService)</option>
              <option value="batch">Batch (CronJob)</option>
            </select>
            <span></span>
          </div>
        </div>
        <div id="batchFields" class="conditional">
          <div class="field">
            <label>Cron Schedule</label>
            <input id="cron" type="text" placeholder="0 2 * * *" autocomplete="off">
            <div class="error" id="cronError"></div>
            <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
              <button class="secondary" onclick="setCron('0 * * * *')" style="font-size:11px;padding:2px 8px">hourly</button>
              <button class="secondary" onclick="setCron('0 2 * * *')" style="font-size:11px;padding:2px 8px">daily 02:00</button>
              <button class="secondary" onclick="setCron('0 0 * * 0')" style="font-size:11px;padding:2px 8px">weekly</button>
            </div>
          </div>
          <div class="field">
            <label>Scoring Image</label>
            <input id="image" type="text" placeholder="registry.local/batch-score:1.0" autocomplete="off">
            <div class="error" id="imageError"></div>
          </div>
        </div>
        <div class="field">
          <label>Experiment</label>
          <input id="experiment" type="text" readonly value="" autocomplete="off">
          <div class="error" id="experimentError"></div>
        </div>
        <div class="field">
          <label>Run <span class="hint">(search by name or ID)</span></label>
          <input id="run" type="text" list="runOptions" placeholder="Type to search or select…" autocomplete="off">
          <datalist id="runOptions"></datalist>
          <div class="error" id="runError"></div>
        </div>
        <div class="field">
          <label>Resources</label>
          <select id="size"></select>
          <div class="error" id="sizeError"></div>
        </div>
        <div class="toggle-row">
          <input id="gpu" type="checkbox">
          <label for="gpu" style="margin:0;font-weight:400">Enable GPU</label>
        </div>
        <div id="migFields" class="conditional">
          <div class="field">
            <label>GPU MIG Profile</label>
            <select id="mig"></select>
            <div class="error" id="gpuError"></div>
          </div>
        </div>
      </div>
      <div class="actions">
        <button class="primary" id="submitBtn">Submit Deployment</button>
        <button class="secondary" id="previewBtn">Preview YAML</button>
      </div>
    </div>
    <div class="right">
      <div class="yaml-header">values.yaml Preview</div>
      <div class="yaml-body" id="yamlPreview">Fill in the form to see the YAML output.</div>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();

    const $ = (id) => document.getElementById(id);
    const name = $('name'), type = $('type'), cron = $('cron'), image = $('image');
    const experiment = $('experiment'), run = $('run'), size = $('size'), gpu = $('gpu'), mig = $('mig');
    const batchFields = $('batchFields'), migFields = $('migFields'), yamlPreview = $('yamlPreview');
    const errorBanner = $('errorBanner'), statusMessage = $('statusMessage');

    let currentExperimentId = '';
    let currentRunId = '';
    let currentRunName = '';
    let runLabelToId = new Map();

    function readSpec() {
      return {
        name: name.value.trim(),
        type: type.value,
        experimentId: currentExperimentId,
        experimentName: experiment.value.trim(),
        runId: currentRunId,
        runName: currentRunName,
        schedule: type.value === 'batch' ? cron.value.trim() : undefined,
        image: type.value === 'batch' ? image.value.trim() : undefined,
        size: size.value,
        gpu: gpu.checked ? (mig.value || mig.options[0]?.value) : undefined,
      };
    }

    function updatePreview() {
      vscode.postMessage({ type: 'preview', spec: readSpec() });
    }

    function toggleBatch() {
      batchFields.classList.toggle('visible', type.value === 'batch');
      updatePreview();
    }

    function toggleGpu() {
      migFields.classList.toggle('visible', gpu.checked);
      updatePreview();
    }

    function setCron(val) { cron.value = val; updatePreview(); }

    function clearErrors() {
      document.querySelectorAll('.error').forEach(el => el.textContent = '');
    }

    type.addEventListener('change', toggleBatch);
    gpu.addEventListener('change', toggleGpu);
    size.addEventListener('change', updatePreview);
    mig.addEventListener('change', updatePreview);
    cron.addEventListener('input', updatePreview);
    image.addEventListener('input', updatePreview);
    cron.addEventListener('input', clearErrors);
    image.addEventListener('input', clearErrors);
    run.addEventListener('input', () => {
      const selected = runLabelToId.get(run.value);
      if (selected) {
        currentRunId = selected.id;
        currentRunName = selected.name;
      } else {
        currentRunId = '';
        currentRunName = '';
      }
      clearErrors();
      updatePreview();
    });

    $('submitBtn').addEventListener('click', () => {
      clearErrors();
      vscode.postMessage({ type: 'submit', spec: readSpec() });
    });
    $('previewBtn').addEventListener('click', updatePreview);

    function showStatus(msg) {
      statusMessage.textContent = msg;
      statusMessage.classList.add('visible');
    }
    function hideStatus() { statusMessage.classList.remove('visible'); }
    function showError(msg) {
      errorBanner.textContent = msg;
      errorBanner.classList.add('visible');
    }
    function hideError() { errorBanner.classList.remove('visible'); }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'init') {
        hideStatus(); hideError();
        name.value = msg.projectName || '';
        size.innerHTML = '';
        mig.innerHTML = '';
        for (const [presetName, desc] of Object.entries(msg.presets || {})) {
          const opt = document.createElement('option');
          opt.value = presetName;
          opt.textContent = presetName + ' — ' + desc;
          size.appendChild(opt);
        }
        size.value = msg.defaultSize || 'medium';
        for (const profile of msg.migProfiles || []) {
          const opt = document.createElement('option');
          opt.value = profile;
          opt.textContent = profile;
          mig.appendChild(opt);
        }
        if (mig.options.length > 0) {
          mig.value = mig.options[0].value;
        }
        toggleGpu();
        if (msg.repoUrl) {
          showStatus('Repo: ' + msg.repoUrl);
        }
        if (msg.projectName) {
          showStatus((msg.repoUrl ? 'Project: ' + msg.projectName : 'Project: ' + msg.projectName));
        }
        if (msg.imageCatalog && msg.imageCatalog.length > 0) {
          document.getElementById('imageCatalog')?.remove();
          const datalist = document.createElement('datalist');
          datalist.id = 'imageCatalog';
          msg.imageCatalog.forEach(img => {
            const opt = document.createElement('option');
            opt.value = img;
            datalist.appendChild(opt);
          });
          document.body.appendChild(datalist);
          image.setAttribute('list', 'imageCatalog');
        }
        if (msg.dummyData) {
          type.value = 'batch';
          cron.value = '0 2 * * *';
          image.value = msg.imageCatalog?.[0] || 'nexus.local/batch-score:1.2';
          toggleBatch();
        }
      }
      if (msg.type === 'experiment') {
        experiment.value = msg.name || '';
        currentExperimentId = msg.experimentId || '';
        updatePreview();
      }
      if (msg.type === 'runs') {
        const options = $('runOptions');
        options.innerHTML = '';
        runLabelToId = new Map();
        if (!msg.runs || msg.runs.length === 0) {
          run.value = '';
          currentRunId = '';
          currentRunName = '';
          showError('No runs found for this experiment.');
        } else {
          msg.runs.forEach((r) => {
            const label = r.name + ' [' + r.status + '] (' + r.id + ')';
            const opt = document.createElement('option');
            opt.value = label;
            options.appendChild(opt);
            runLabelToId.set(label, { id: r.id, name: r.name });
          });
          const first = msg.runs[0];
          const firstLabel = first.name + ' [' + first.status + '] (' + first.id + ')';
          run.value = firstLabel;
          currentRunId = first.id;
          currentRunName = first.name;
        }
        updatePreview();
      }
      if (msg.type === 'yamlPreview') {
        yamlPreview.textContent = msg.yaml || '';
      }
      if (msg.type === 'validationErrors') {
        for (const [field, error] of Object.entries(msg.errors || {})) {
          const el = document.getElementById(field + 'Error');
          if (el) el.textContent = error;
        }
      }
      if (msg.type === 'error') {
        hideStatus();
        showError(msg.message);
      }
      if (msg.type === 'submitted') {
        hideError();
        hideStatus();
        if (msg.prUrl) {
          yamlPreview.innerHTML =
            '<strong style="color:var(--vscode-terminal-ansiGreen)">✓ Pushed to ' + msg.branch + '</strong>\\n\\n' +
            (msg.prAutoCreated ? 'PR created: ' : 'Review & create PR: ') +
            '<a href="' + msg.prUrl + '" style="color:var(--vscode-textLink-foreground);text-decoration:underline">' + msg.prUrl + '</a>';
        } else {
          yamlPreview.innerHTML = '<strong style="color:var(--vscode-terminal-ansiGreen)">✓ Pushed to ' + msg.branch + '</strong>';
        }
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
