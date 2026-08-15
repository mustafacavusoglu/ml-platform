import * as vscode from 'vscode';
import { type DeploymentRecord } from '../deploy/valuesPatcher';
import { type IsvcStatusInfo } from '../core/isvcStatus';

export type DeploymentTreeItemKind =
  | 'deployment'
  | 'message'
  | 'prStatus'
  | 'clusterStatus';

export class DeploymentTreeItem extends vscode.TreeItem {
  readonly kind: DeploymentTreeItemKind;
  readonly record?: DeploymentRecord;
  readonly isvcStatus?: IsvcStatusInfo;
  readonly prUrl?: string;

  constructor(
    kind: DeploymentTreeItemKind,
    label: string,
    options: {
      description?: string;
      tooltip?: string;
      icon?: vscode.ThemeIcon;
      command?: vscode.Command;
      contextValue?: string;
      record?: DeploymentRecord;
      isvcStatus?: IsvcStatusInfo;
      prUrl?: string;
    } = {}
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.kind = kind;
    this.record = options.record;
    this.isvcStatus = options.isvcStatus;
    this.prUrl = options.prUrl;
    this.description = options.description;
    this.tooltip = options.tooltip;
    this.iconPath = options.icon;
    this.command = options.command;
    this.contextValue = options.contextValue;
    this.id = options.record?.name ?? label;
  }
}

interface DeploymentWithStatus {
  record: DeploymentRecord;
  isvcStatus?: IsvcStatusInfo;
  prUrl?: string;
}

export class DeploymentsTreeProvider implements vscode.TreeDataProvider<DeploymentTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<DeploymentTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private deployments: DeploymentWithStatus[] = [];
  private error?: string;

  refresh(): void {
    this.deployments = [];
    this.error = undefined;
    this._onDidChangeTreeData.fire();
  }

  setDeployments(deployments: DeploymentWithStatus[]): void {
    this.deployments = deployments;
    this.error = undefined;
    this._onDidChangeTreeData.fire();
  }

  setError(message: string): void {
    this.error = message;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DeploymentTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<DeploymentTreeItem[]> {
    if (this.error) {
      return [messageItem('Error', this.error)];
    }
    if (this.deployments.length === 0) {
      return [
        messageItem('No deployments', 'Submit a deployment to see it here.', {
          command: 'depinference.newDeployment',
          title: 'New Deployment',
        }),
      ];
    }

    return this.deployments.map((entry) => {
      const { record, isvcStatus, prUrl } = entry;
      const phaseIcon = isvcStatus
        ? isvcStatus.phase === 'Ready'
          ? 'pass'
          : isvcStatus.phase === 'Failed'
            ? 'error'
            : 'sync~spin'
        : 'circle-outline';
      const phaseLabel = isvcStatus ? isvcStatus.phase : 'Not deployed';
      const ctx = record.type === 'online' ? 'deploymentOnline' : 'deploymentBatch';

      return new DeploymentTreeItem('deployment', record.name, {
        description: `${record.type} · ${phaseLabel}`,
        tooltip: [
          `Name: ${record.name}`,
          `Type: ${record.type}`,
          `Experiment: ${record.experimentId ?? ''}`,
          `Run: ${record.runId ?? ''}`,
          record.type === 'batch' ? `Schedule: ${record.schedule}` : undefined,
          `Status: ${phaseLabel}`,
          isvcStatus?.reason ? `Reason: ${isvcStatus.reason}` : undefined,
          isvcStatus?.message ? `Message: ${isvcStatus.message}` : undefined,
        ]
          .filter(Boolean)
          .join('\n'),
        icon: new vscode.ThemeIcon(phaseIcon),
        contextValue: ctx,
        record,
        isvcStatus,
        prUrl,
        command: prUrl
          ? { command: 'depinference.openPr', title: 'Open PR', arguments: [prUrl] }
          : undefined,
      });
    });
  }
}

function messageItem(
  label: string,
  description: string,
  command?: { command: string; title: string }
): DeploymentTreeItem {
  return new DeploymentTreeItem('message', label, {
    description,
    tooltip: description,
    command: command
      ? { command: command.command, title: command.title }
      : undefined,
  });
}
