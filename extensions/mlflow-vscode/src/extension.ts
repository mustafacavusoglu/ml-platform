import * as vscode from 'vscode';
import { effectiveTrackingUri, getMlflowConfig, type MlflowConfig } from './config';
import { OpenShiftAuth } from './mlflow/auth';
import { MlflowClient, type MlflowAuthHeadersProvider } from './mlflow/client';
import { BasicAuth } from './mlflow/basicAuth';
import { KubernetesSecretAuth } from './mlflow/k8sSecretAuth';
import type { MlflowRun } from './mlflow/types';
import { ComparePanel } from './views/comparePanel';
import { RunsTreeProvider } from './views/runsTree';

let config: MlflowConfig;
let auth: MlflowAuthProvider;
let client: MlflowClient;
let treeProvider: RunsTreeProvider;

interface MlflowAuthProvider extends MlflowAuthHeadersProvider {
  clear(): Promise<void>;
  signIn(): Promise<unknown>;
}

export function activate(context: vscode.ExtensionContext): void {
  config = getMlflowConfig();
  auth = createAuth(context, config);
  client = new MlflowClient(config, auth);
  treeProvider = new RunsTreeProvider(client, config);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('mlflowRuns', treeProvider),
    vscode.commands.registerCommand('mlflow.refresh', () => treeProvider.refresh()),
    vscode.commands.registerCommand('mlflow.signOut', async () => {
      await auth.clear();
      treeProvider.refresh();
      void vscode.window.showInformationMessage('MLflow session cleared.');
    }),
    vscode.commands.registerCommand('mlflow.signIn', async () => {
      try {
        const isSecretMode = auth instanceof KubernetesSecretAuth;
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: isSecretMode ? 'Loading MLflow secret' : 'Signing in to OpenShift',
          },
          async () => {
            await auth.signIn();
          }
        );
        treeProvider.refresh();
        void vscode.window.showInformationMessage(
          isSecretMode ? 'MLflow secret loaded.' : 'Signed in to OpenShift.'
        );
      } catch (error) {
        void vscode.window.showErrorMessage(
          error instanceof Error ? error.message : String(error)
        );
      }
    }),
    vscode.commands.registerCommand('mlflow.openTrackingUi', async () => {
      const trackingUri =
        effectiveTrackingUri(config) ?? (await auth.getTrackingUri?.());
      if (!trackingUri) {
        void vscode.window.showWarningMessage(
          'Configure mlflow.trackingUri or set MLFLOW_TRACKING_URI.'
        );
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(trackingUri));
    }),
    vscode.commands.registerCommand('mlflow.useDummyData', async () => {
      const next = !config.useDummyData;
      await vscode.workspace.getConfiguration('mlflow').update(
        'useDummyData',
        next,
        vscode.ConfigurationTarget.Global
      );
      Object.assign(config, getMlflowConfig());
      treeProvider.refresh();
      void vscode.window.showInformationMessage(
        next ? 'Dummy MLflow data enabled.' : 'Dummy MLflow data disabled.'
      );
    }),
    vscode.commands.registerCommand('mlflow.compareRuns', (...args: unknown[]) => {
      const selected = new Set<string>();
      for (const arg of args) {
        const run = extractRun(arg);
        if (run) {
          selected.add(run.info.runId);
        }
      }
      new ComparePanel(client, config, selected);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('mlflow')) {
        Object.assign(config, getMlflowConfig());
        treeProvider.refresh();
      }
    })
  );
}

export function deactivate(): void {
  // Nothing to dispose globally; subscriptions are owned by the VS Code context.
}

function createAuth(
  context: vscode.ExtensionContext,
  config: MlflowConfig
): MlflowAuthProvider {
  if (config.useDummyData) {
    return {
      getHeaders: async () => ({}),
      clear: async () => undefined,
      signIn: async () => undefined,
    };
  }
  if (config.authMode === 'oauth') {
    return new OpenShiftAuth(context, config);
  }
  if (config.authMode === 'basic') {
    return new BasicAuth(config);
  }
  return new KubernetesSecretAuth(context, config);
}

function extractRun(value: unknown): MlflowRun | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as {
    run?: MlflowRun;
    info?: MlflowRun['info'];
  };
  if (candidate.run) {
    return candidate.run;
  }
  if (candidate.info?.runId) {
    return candidate as MlflowRun;
  }
  return undefined;
}
