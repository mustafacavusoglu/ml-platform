import * as vscode from 'vscode';
import { resolveTrackingUri } from '../core/urls';

export type MlflowAuthMode = 'secret' | 'basic';

/**
 * Reads the same `mlflow.*` settings used by the MLflow Runs extension, so a
 * workbench image configures MLflow access once for every extension.
 */
export interface MlflowSettings {
  trackingUri?: string;
  namespace?: string;
  appsDomain?: string;
  maxResults: number;
  useDummyData: boolean;
  authMode: MlflowAuthMode | string;
  username?: string;
  password?: string;
  secretName: string;
  secretUsernameKey: string;
  secretPasswordKey: string;
  secretUriKey: string;
  kubernetesApiUrl?: string;
  serviceAccountTokenPath: string;
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && value.trim().length > 0);
}

export function getMlflowSettings(): MlflowSettings {
  const env = typeof process === 'undefined' ? {} : process.env;
  const config = vscode.workspace.getConfiguration('mlflow');
  return {
    trackingUri: firstDefined(config.get<string>('trackingUri'), env.MLFLOW_TRACKING_URI),
    namespace: firstDefined(
      config.get<string>('namespace'),
      env.KUBERNETES_NAMESPACE,
      env.POD_NAMESPACE,
      env.NAMESPACE
    ),
    appsDomain: firstDefined(
      config.get<string>('appsDomain'),
      env.OPENSHIFT_APPS_DOMAIN,
      env.CLUSTER_DOMAIN
    ),
    maxResults: config.get<number>('maxResults', 1000),
    useDummyData:
      config.get<boolean>('useDummyData', false) ||
      env.MLFLOW_USE_DUMMY_DATA === 'true' ||
      env.MLFLOW_USE_DUMMY_DATA === '1',
    authMode: config.get<string>('authMode', 'secret'),
    username: firstDefined(config.get<string>('username'), env.MLFLOW_USERNAME),
    password: firstDefined(config.get<string>('password'), env.MLFLOW_PASSWORD),
    secretName:
      firstDefined(config.get<string>('secretName'), env.MLFLOW_SECRET_NAME) ?? 'mlflow-secret',
    secretUsernameKey:
      firstDefined(config.get<string>('secretUsernameKey'), env.MLFLOW_SECRET_USERNAME_KEY) ??
      'username',
    secretPasswordKey:
      firstDefined(config.get<string>('secretPasswordKey'), env.MLFLOW_SECRET_PASSWORD_KEY) ??
      'password',
    secretUriKey:
      firstDefined(config.get<string>('secretUriKey'), env.MLFLOW_SECRET_URI_KEY) ?? 'service_uri',
    kubernetesApiUrl: firstDefined(
      config.get<string>('kubernetesApiUrl'),
      env.KUBERNETES_API_URL
    ),
    serviceAccountTokenPath:
      firstDefined(
        config.get<string>('serviceAccountTokenPath'),
        env.SERVICE_ACCOUNT_TOKEN_PATH
      ) ?? '/var/run/secrets/kubernetes.io/serviceaccount/token',
  };
}

export function effectiveTrackingUri(settings: MlflowSettings): string | undefined {
  return resolveTrackingUri(settings);
}
