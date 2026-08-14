import * as vscode from 'vscode';
import { type MlflowConfig } from '../config';
import { normalizeTrackingUri } from '../core/urls';
import type { MlflowAuthHeadersProvider } from './client';
import {
  extractSecretValues,
  resolveKubernetesApiUrl,
  toBasicAuthHeader,
  type KubernetesSecretValues,
} from './k8sSecretAuthUtils';

export class KubernetesSecretAuth implements MlflowAuthHeadersProvider {
  private cached?: Promise<KubernetesSecretValues>;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly config: MlflowConfig
  ) {}

  async getHeaders(): Promise<Record<string, string>> {
    const values = await this.getSecretValues();
    return {
      Authorization: toBasicAuthHeader(values.username, values.password),
    };
  }

  async getTrackingUri(): Promise<string | undefined> {
    const values = await this.getSecretValues();
    return normalizeTrackingUri(values.serviceUri);
  }

  async clear(): Promise<void> {
    this.cached = undefined;
  }

  async signIn(): Promise<string> {
    const values = await this.getSecretValues();
    return values.serviceUri;
  }

  private getSecretValues(): Promise<KubernetesSecretValues> {
    if (!this.cached) {
      this.cached = this.loadSecret();
    }
    return this.cached;
  }

  private async loadSecret(): Promise<KubernetesSecretValues> {
    if (!this.config.namespace) {
      throw new Error('Set mlflow.namespace or KUBERNETES_NAMESPACE first.');
    }

    const token = await this.readServiceAccountToken();
    const apiUrl = resolveKubernetesApiUrl(
      this.config.kubernetesApiUrl,
      typeof process === 'undefined' ? {} : process.env
    );
    const url = `${apiUrl}/api/v1/namespaces/${encodeURIComponent(
      this.config.namespace
    )}/secrets/${encodeURIComponent(this.config.secretName)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await safeText(response);
      throw new Error(
        `Could not read Kubernetes secret ${this.config.secretName}: HTTP ${response.status} ${body}`
      );
    }

    const payload = (await response.json()) as {
      data?: Record<string, string>;
    };
    return extractSecretValues(payload.data, {
      username: this.config.secretUsernameKey,
      password: this.config.secretPasswordKey,
      serviceUri: this.config.secretUriKey,
    });
  }

  private async readServiceAccountToken(): Promise<string> {
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.file(this.config.serviceAccountTokenPath)
      );
      const token = new TextDecoder().decode(bytes).trim();
      if (!token) {
        throw new Error('Service account token file is empty.');
      }
      return token;
    } catch (error) {
      throw new Error(
        `Could not read service account token from ${this.config.serviceAccountTokenPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 1000);
  } catch {
    return '';
  }
}
