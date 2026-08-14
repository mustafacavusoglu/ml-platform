import { type MlflowConfig } from '../config';
import { normalizeTrackingUri } from '../core/urls';
import type { MlflowAuthHeadersProvider } from './client';
import { toBasicAuthHeader } from './k8sSecretAuthUtils';

export class BasicAuth implements MlflowAuthHeadersProvider {
  constructor(private readonly config: MlflowConfig) {}

  async getHeaders(): Promise<Record<string, string>> {
    if (!this.config.username || !this.config.password) {
      throw new Error('Configure mlflow.username and mlflow.password for basic auth.');
    }
    return {
      Authorization: toBasicAuthHeader(this.config.username, this.config.password),
    };
  }

  async getTrackingUri(): Promise<string | undefined> {
    return normalizeTrackingUri(this.config.trackingUri);
  }

  async clear(): Promise<void> {
    // Credentials come from settings, so there is no local session to clear.
  }

  async signIn(): Promise<string> {
    if (!this.config.username || !this.config.password) {
      throw new Error('Configure mlflow.username and mlflow.password for basic auth.');
    }
    return normalizeTrackingUri(this.config.trackingUri) ?? '';
  }
}
