import { type MlflowSettings } from './mlflowSettings';
import { normalizeTrackingUri } from '../core/urls';
import type { MlflowAuthHeadersProvider } from './client';
import { toBasicAuthHeader } from '../core/k8sUtils';

export class BasicAuth implements MlflowAuthHeadersProvider {
  constructor(private readonly settings: MlflowSettings) {}

  async getHeaders(): Promise<Record<string, string>> {
    if (!this.settings.username || !this.settings.password) {
      throw new Error('Configure mlflow.username and mlflow.password for basic auth.');
    }
    return {
      Authorization: toBasicAuthHeader(this.settings.username, this.settings.password),
    };
  }

  async getTrackingUri(): Promise<string | undefined> {
    return normalizeTrackingUri(this.settings.trackingUri);
  }
}
