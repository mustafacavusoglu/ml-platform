import * as vscode from 'vscode';
import { getConfig, type DepInferenceConfig } from './config';
import { getMlflowSettings, type MlflowSettings } from './mlflow/mlflowSettings';
import { MlflowClient, type MlflowAuthHeadersProvider } from './mlflow/client';
import { KubernetesSecretAuth } from './mlflow/secretAuth';
import { BasicAuth } from './mlflow/basicAuth';
import { resolveResourcePresets, DEFAULT_SIZE, type ResourcePreset } from './core/presets';
import { derivePredictorUrl } from './core/isvcStatus';
import { type DeploymentSpec } from './core/deployment';
import { listDeployments, type DeploymentRecord } from './deploy/valuesPatcher';
import { submitDeployment, type SubmitResult } from './deploy/submitPipeline';
import { AzureDevOpsClient } from './azure/azureClient';
import { PatStore } from './azure/patStore';
import { IsvcWatcher } from './cluster/isvcWatcher';
import { DeployFormPanel } from './views/deployForm';
import { DeploymentsTreeProvider } from './views/deploymentsTree';
import { PlaygroundPanel } from './views/playground';

let config: DepInferenceConfig;
let mlflowSettings: MlflowSettings;
let treeProvider: DeploymentsTreeProvider;
let isvcWatcher: IsvcWatcher | undefined;
let patStore: PatStore;
let treeRefreshInterval: ReturnType<typeof setInterval> | undefined;

export function activate(context: vscode.ExtensionContext): void {
  config = getConfig();
  mlflowSettings = getMlflowSettings();
  patStore = new PatStore(context);
  treeProvider = new DeploymentsTreeProvider();

  const treeDisposable = vscode.window.registerTreeDataProvider(
    'depinference.deployments',
    treeProvider
  );
  context.subscriptions.push(treeDisposable);

  // --- Commands ---

  context.subscriptions.push(
    vscode.commands.registerCommand('depinference.newDeployment', () => {
      new DeployFormPanel(context, async (spec, preset) => {
        await handleSubmit(context, spec, preset);
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('depinference.refresh', () => {
      treeProvider.refresh();
      void refreshTreeFromCluster();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('depinference.playground', async (...args: unknown[]) => {
      const item = extractTreeItem(args);
      if (!item?.record) {
        return;
      }
      const status = item.isvcStatus;
      if (!status || status.phase !== 'Ready' || !status.addressUrl) {
        void vscode.window.showWarningMessage(
          `Deployment "${item.record.name}" is not ready yet. Status: ${status?.phase ?? 'unknown'}.`
        );
        return;
      }
      new PlaygroundPanel(item.record.name, status.addressUrl);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('depinference.openPr', async (...args: unknown[]) => {
      const item = extractTreeItem(args);
      const url = item?.prUrl ?? (typeof args[0] === 'string' ? args[0] : undefined);
      if (url) {
        await vscode.env.openExternal(vscode.Uri.parse(url));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('depinference.setPat', async () => {
      await patStore.promptAndSet();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('depinference.clearPat', async () => {
      await patStore.clear();
      void vscode.window.showInformationMessage('Azure DevOps PAT cleared.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('depinference.useDummyData', async () => {
      const current = getConfig().useDummyData;
      await vscode.workspace.getConfiguration('depinference').update(
        'useDummyData',
        !current,
        vscode.ConfigurationTarget.Global
      );
      config = getConfig();
      mlflowSettings = getMlflowSettings();
      treeProvider.refresh();
      startOrStopWatcher(context);
      void refreshTreeFromCluster();
      void vscode.window.showInformationMessage(
        !current ? 'Dummy data enabled.' : 'Dummy data disabled.'
      );
    })
  );

  // --- Config change listener ---

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('depinference') ||
        event.affectsConfiguration('mlflow')
      ) {
        config = getConfig();
        mlflowSettings = getMlflowSettings();
        treeProvider.refresh();
        startOrStopWatcher(context);
      }
    })
  );

  // --- Start cluster watcher if namespace is configured ---

  startOrStopWatcher(context);
  void refreshTreeFromCluster();

  // Periodic tree refresh every 30 seconds.
  treeRefreshInterval = setInterval(() => void refreshTreeFromCluster(), 30_000);
  context.subscriptions.push({
    dispose: () => {
      if (treeRefreshInterval !== undefined) {
        clearInterval(treeRefreshInterval);
      }
    },
  });
}

export function deactivate(): void {
  // All subscriptions are owned by the VS Code context.
}

// --- Internal helpers ---

function startOrStopWatcher(context: vscode.ExtensionContext): void {
  if (isvcWatcher) {
    isvcWatcher.dispose();
    isvcWatcher = undefined;
  }

  if (!config.namespace || !config.kubernetesApiUrl) {
    return;
  }

  if (config.useDummyData) {
    return;
  }

  isvcWatcher = new IsvcWatcher({
    namespace: config.namespace,
    kubernetesApiUrl: config.kubernetesApiUrl,
    serviceAccountTokenPath: config.serviceAccountTokenPath,
    appsDomain: config.appsDomain,
  });
  isvcWatcher.onDidChange(() => void refreshTreeFromCluster());
  context.subscriptions.push(isvcWatcher);
  isvcWatcher.start();
}

async function refreshTreeFromCluster(): Promise<void> {
  if (!config.namespace) {
    return;
  }

  try {
    // Fetch values.yaml from repo to get deployment list.
    const deployments = await fetchDeploymentsFromRepo();
    const deploymentNames = deployments.map((d) => d.name);

    // Merge with cluster statuses.
    const clusterStatuses = isvcWatcher?.getAllStatuses() ?? new Map();

    treeProvider.setDeployments(
      deployments.map((record) => ({
        record,
        isvcStatus: clusterStatuses.get(record.name),
        // PR URL is not available from values alone; it could be fetched via
        // Azure API if PAT is configured, but KISS: the user knows the PR.
        prUrl: undefined,
      }))
    );
  } catch (error) {
    // Silently skip on first load — the tree already shows a useful message.
  }
}

async function fetchDeploymentsFromRepo(): Promise<DeploymentRecord[]> {
  if (config.useDummyData) {
    return [
      { name: 'fraud-detector', type: 'online', experimentId: '101', runId: 'dummy-run-a-101' },
      { name: 'batch-scorer', type: 'batch', experimentId: '102', runId: 'dummy-run-b-102', schedule: '0 2 * * *' },
    ];
  }

  if (!config.azureRepoUrl) {
    return [];
  }

  // Use the MLflow auth to read the repo's values.yaml via the Azure DevOps REST API
  // (if PAT available) or git. For the tree refresh, we use the simpler approach:
  // git ls-remote + git clone --depth 1 to read the file.
  // To avoid heavy git operations on every 30s tick, we cache the result and only
  // re-fetch when the tree is manually refreshed.
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const { mkdtemp, rm, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const dir = await mkdtemp(join(tmpdir(), 'depinference-tree-'));
  try {
    await execFileAsync(
      'git',
      [
        'clone',
        '--depth',
        '1',
        '--branch',
        config.azureTargetBranch,
        '--single-branch',
        config.azureRepoUrl,
        dir,
      ],
      {
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'true' },
      }
    );
    const filePath = join(dir, config.azureValuesPath);
    const valuesText = await readFile(filePath, 'utf8');
    return listDeployments(valuesText);
  } catch {
    return [];
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function handleSubmit(
  context: vscode.ExtensionContext,
  spec: DeploymentSpec,
  preset: ResourcePreset
): Promise<void> {
  if (!config.azureRepoUrl) {
    void vscode.window.showErrorMessage(
      'Set depinference.azure.repoUrl before submitting a deployment.'
    );
    return;
  }

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Deploying ${spec.name}…`,
      },
      async (progress) => {
        progress.report({ message: 'Pushing to repository…' });
        const submitResult = await submitDeployment({
          repoUrl: config.azureRepoUrl,
          targetBranch: config.azureTargetBranch,
          valuesPath: config.azureValuesPath,
          apiVersion: config.azureApiVersion,
          spec,
          preset,
          getPat: () => patStore.get(),
        });

        progress.report({ message: 'Opening pull request…' });

        if (submitResult.prAuthWarning) {
          void vscode.window.showWarningMessage(submitResult.prAuthWarning);
        }

        // Open the PR in the browser.
        await vscode.env.openExternal(vscode.Uri.parse(submitResult.prUrl));

        DeployFormPanel.notifySubmitted(submitResult);

        return submitResult;
      }
    );

    void vscode.window.showInformationMessage(
      `Deployment "${spec.name}" pushed to branch ${result.branch}.${result.prAutoCreated ? ' PR created.' : ''}`
    );

    treeProvider.refresh();
    void refreshTreeFromCluster();
  } catch (error) {
    void vscode.window.showErrorMessage(
      error instanceof Error ? error.message : String(error)
    );
  }
}

function createMlflowAuth(context: vscode.ExtensionContext): MlflowAuthHeadersProvider {
  if (mlflowSettings.useDummyData) {
    return {
      getHeaders: async () => ({}),
      getTrackingUri: async () => undefined,
    };
  }
  if (mlflowSettings.authMode === 'basic') {
    return new BasicAuth(mlflowSettings);
  }
  return new KubernetesSecretAuth(context, mlflowSettings);
}

function extractTreeItem(args: unknown[]): import('./views/deploymentsTree').DeploymentTreeItem | undefined {
  for (const arg of args) {
    if (arg && typeof arg === 'object' && 'kind' in arg) {
      return arg as import('./views/deploymentsTree').DeploymentTreeItem;
    }
  }
  return undefined;
}
