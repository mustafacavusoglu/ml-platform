import * as vscode from 'vscode';
import { deriveProjectName } from './core/project';

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && value.trim().length > 0);
}

export interface DepInferenceConfig {
  workbenchName?: string;
  projectName?: string;
  namespace?: string;
  appsDomain?: string;
  kubernetesApiUrl?: string;
  serviceAccountTokenPath: string;
  azureRepoUrl: string;
  azureApiVersion: string;
  azureTargetBranch: string;
  azureValuesPath: string;
  resourcePresets?: Record<string, unknown>;
  imageCatalog?: string[];
  useDummyData: boolean;
}

export function getConfig(): DepInferenceConfig {
  const env = typeof process === 'undefined' ? {} : process.env;
  const config = vscode.workspace.getConfiguration('depinference');
  const mlflow = vscode.workspace.getConfiguration('mlflow');
  const namespace = firstDefined(
    config.get<string>('namespace'),
    mlflow.get<string>('namespace'),
    env.KUBERNETES_NAMESPACE,
    env.POD_NAMESPACE,
    env.NAMESPACE
  );
  const workbenchName = firstDefined(
    config.get<string>('workbenchName'),
    env.WORKBENCH_NAME
  );
  const useDummyData =
    config.get<boolean>('useDummyData', false) ||
    env.DEPINFERENCE_USE_DUMMY_DATA === 'true' ||
    env.DEPINFERENCE_USE_DUMMY_DATA === '1';
  const projectName =
    deriveProjectName(workbenchName) ??
    namespace ??
    (useDummyData ? 'demo-project' : undefined);
  const configuredImageCatalog = config.get<string[]>('imageCatalog', []);
  const imageCatalog =
    configuredImageCatalog.length > 0
      ? configuredImageCatalog
      : useDummyData
        ? ['nexus.local/batch-score:1.2', 'quay.io/mlops/batch-score:2.0']
        : [];

  return {
    workbenchName,
    projectName,
    namespace,
    appsDomain: firstDefined(
      config.get<string>('appsDomain'),
      mlflow.get<string>('appsDomain'),
      env.OPENSHIFT_APPS_DOMAIN,
      env.CLUSTER_DOMAIN
    ),
    kubernetesApiUrl: firstDefined(
      config.get<string>('kubernetesApiUrl'),
      mlflow.get<string>('kubernetesApiUrl'),
      env.KUBERNETES_API_URL
    ),
    serviceAccountTokenPath:
      firstDefined(
        config.get<string>('serviceAccountTokenPath'),
        mlflow.get<string>('serviceAccountTokenPath'),
        env.SERVICE_ACCOUNT_TOKEN_PATH
      ) ?? '/var/run/secrets/kubernetes.io/serviceaccount/token',
    azureRepoUrl:
      firstDefined(
        config.get<string>('azure.repoUrl'),
        env.DEPINFERENCE_AZURE_REPO_URL,
        env.AZURE_DEVOPS_REPO_URL
      ) ?? '',
    azureApiVersion: config.get<string>('azure.apiVersion', '7.0'),
    azureTargetBranch: config.get<string>('azure.targetBranch', 'main'),
    azureValuesPath: config.get<string>('azure.valuesPath', 'Projects/MainProject/values.yaml'),
    resourcePresets: config.get<Record<string, unknown>>('resourcePresets'),
    imageCatalog,
    useDummyData,
  };
}
