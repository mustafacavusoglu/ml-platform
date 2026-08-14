import * as vscode from 'vscode';
import { type MlflowConfig } from '../config';
import { MlflowClient } from '../mlflow/client';
import { MlflowAuthError, MlflowNotFoundError } from '../mlflow/errors';
import type { MlflowExperiment, MlflowRun } from '../mlflow/types';
import { formatStartTime, shortRunName } from '../core/mlflowModel';

export type MlflowTreeItemKind = 'experiment' | 'run' | 'message';

export class MlflowTreeItem extends vscode.TreeItem {
  readonly kind: MlflowTreeItemKind;
  readonly experiment?: MlflowExperiment;
  readonly run?: MlflowRun;

  constructor(
    kind: MlflowTreeItemKind,
    label: string,
    options: {
      description?: string;
      tooltip?: string;
      icon?: vscode.ThemeIcon;
      command?: vscode.Command;
      contextValue?: string;
      experiment?: MlflowExperiment;
      run?: MlflowRun;
    } = {}
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.kind = kind;
    this.experiment = options.experiment;
    this.run = options.run;
    this.description = options.description;
    this.tooltip = options.tooltip;
    this.iconPath = options.icon;
    this.command = options.command;
    this.contextValue = options.contextValue;
    this.id = options.run?.info.runId ?? options.experiment?.experimentId ?? label;
  }
}

export class RunsTreeProvider implements vscode.TreeDataProvider<MlflowTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    MlflowTreeItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private experiment?: MlflowExperiment;
  private runs: MlflowRun[] = [];

  constructor(
    private readonly client: MlflowClient,
    private readonly config: MlflowConfig
  ) {}

  refresh(): void {
    this.experiment = undefined;
    this.runs = [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MlflowTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: MlflowTreeItem): Promise<MlflowTreeItem[]> {
    if (element?.kind === 'experiment') {
      return this.runs.map((run) => createRunItem(run));
    }
    if (element?.kind === 'message') {
      return [];
    }
    return this.loadRoot();
  }

  private async loadRoot(): Promise<MlflowTreeItem[]> {
    if (!this.config.useDummyData && !this.config.namespace) {
      return [
        messageItem(
          'Use dummy data for preview',
          'Set mlflow.namespace or enable dummy data',
          {
            command: 'mlflow.useDummyData',
            title: 'Use Dummy Data',
          }
        ),
      ];
    }
    if (!this.config.useDummyData && !this.config.trackingUri && !this.config.appsDomain) {
      return [
        messageItem(
          'Use dummy data for preview',
          'Set mlflow.trackingUri or enable dummy data',
          {
            command: 'mlflow.useDummyData',
            title: 'Use Dummy Data',
          }
        ),
      ];
    }

    try {
      const result = await this.client.listExperimentRuns();
      this.experiment = result.experiment;
      this.runs = result.runs;
      return [
        new MlflowTreeItem('experiment', this.experiment.name, {
          description: `id: ${this.experiment.experimentId || 'unknown'} · ${
            this.runs.length
          } run${this.runs.length === 1 ? '' : 's'}${this.config.useDummyData ? ' · dummy' : ''}`,
          tooltip: [
            this.experiment.name,
            this.experiment.experimentId ? `Experiment ID: ${this.experiment.experimentId}` : undefined,
            this.experiment.artifactLocation ? `Artifacts: ${this.experiment.artifactLocation}` : undefined,
          ]
            .filter(Boolean)
            .join('\n'),
          icon: new vscode.ThemeIcon('flame'),
          contextValue: 'mlflowExperiment',
          experiment: this.experiment,
          command: {
            command: 'mlflow.compareRuns',
            title: 'Compare Runs',
          },
        }),
      ];
    } catch (error) {
      if (error instanceof MlflowAuthError) {
        return [
          messageItem(
            'Authentication required',
            'Run MLflow: Sign in to OpenShift',
            {
              command: 'mlflow.signIn',
              title: 'Sign in to OpenShift',
            }
          ),
        ];
      }
      if (error instanceof MlflowNotFoundError) {
        return [
          messageItem(
            `Experiment "${this.config.namespace}" not found`,
            'Create the experiment or check the namespace setting'
          ),
        ];
      }
      return [
        messageItem(
          'MLflow connection failed',
          error instanceof Error ? error.message : String(error)
        ),
      ];
    }
  }
}

function createRunItem(run: MlflowRun): MlflowTreeItem {
  const startLabel =
    run.info.startTime === undefined ? 'no start time' : formatStartTime(run.info.startTime);
  return new MlflowTreeItem('run', run.info.runName ?? shortRunName(run.info.runId), {
    description: `id: ${run.info.runId} · ${run.info.status} · ${startLabel}`,
    tooltip: [
      `Run: ${run.info.runId}`,
      `Status: ${run.info.status}`,
      run.info.startTime === undefined ? undefined : `Start: ${formatStartTime(run.info.startTime)}`,
      run.info.artifactUri ? `Artifacts: ${run.info.artifactUri}` : undefined,
    ]
      .filter(Boolean)
      .join('\n'),
    icon: new vscode.ThemeIcon(iconForStatus(run.info.status)),
    contextValue: 'mlflowRun',
    run,
    command: {
      command: 'mlflow.compareRuns',
      title: 'Compare Runs',
      arguments: [run],
    },
  });
}

function messageItem(
  label: string,
  description: string,
  command?: { command: string; title: string }
): MlflowTreeItem {
  return new MlflowTreeItem('message', label, {
    description,
    tooltip: description,
    command: command
      ? {
          command: command.command,
          title: command.title,
        }
      : undefined,
  });
}

function iconForStatus(status: string): string {
  switch (status) {
    case 'RUNNING':
      return 'sync~spin';
    case 'FINISHED':
      return 'pass';
    case 'FAILED':
      return 'error';
    case 'KILLED':
      return 'circle-slash';
    default:
      return 'circle-outline';
  }
}
