import * as vscode from 'vscode';
import { resolveTrackingUri } from './core/urls';

export type MlflowAuthMode = 'secret' | 'oauth' | 'basic';

export interface MlflowConfig {
  trackingUri?: string;
  namespace?: string;
  appsDomain?: string;
  cookieName: string;
  maxResults: number;
  useDummyData: boolean;
  authMode: MlflowAuthMode;
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

export function getMlflowConfig(): MlflowConfig {
  const env = typeof process === 'undefined' ? {} : process.env;
  const config = vscode.workspace.getConfiguration('mlflow');
  const authMode = config.get<MlflowAuthMode>('authMode', 'secret');
  return {
    trackingUri: firstDefined(
      config.get<string>('trackingUri'),
      env.MLFLOW_TRACKING_URI
    ),
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
    cookieName: config.get<string>('cookieName', 'openshift-session-token'),
    maxResults: config.get<number>('maxResults', 1000),
    useDummyData:
      config.get<boolean>('useDummyData', false) ||
      env.MLFLOW_USE_DUMMY_DATA === 'true' ||
      env.MLFLOW_USE_DUMMY_DATA === '1',
    authMode,
    username: firstDefined(config.get<string>('username'), env.MLFLOW_USERNAME),
    password: firstDefined(config.get<string>('password'), env.MLFLOW_PASSWORD),
    secretName: firstDefined(
      config.get<string>('secretName'),
      env.MLFLOW_SECRET_NAME
    ) ?? 'mlflow-secret',
    secretUsernameKey: firstDefined(
      config.get<string>('secretUsernameKey'),
      env.MLFLOW_SECRET_USERNAME_KEY
    ) ?? 'username',
    secretPasswordKey: firstDefined(
      config.get<string>('secretPasswordKey'),
      env.MLFLOW_SECRET_PASSWORD_KEY
    ) ?? 'password',
    secretUriKey: firstDefined(
      config.get<string>('secretUriKey'),
      env.MLFLOW_SECRET_URI_KEY
    ) ?? 'service_uri',
    kubernetesApiUrl: firstDefined(
      config.get<string>('kubernetesApiUrl'),
      env.KUBERNETES_API_URL
    ),
    serviceAccountTokenPath: firstDefined(
      config.get<string>('serviceAccountTokenPath'),
      env.SERVICE_ACCOUNT_TOKEN_PATH
    ) ?? '/var/run/secrets/kubernetes.io/serviceaccount/token',
  };
}

export function effectiveTrackingUri(config: MlflowConfig): string | undefined {
  return resolveTrackingUri(config);
}
