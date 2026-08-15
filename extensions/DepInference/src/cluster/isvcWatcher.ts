import * as vscode from 'vscode';
import { readFile } from 'node:fs/promises';
import {
  summarizeInferenceService,
  derivePredictorUrl,
  type IsvcStatusInfo,
} from '../core/isvcStatus';

export interface IsvcWatcherOptions {
  namespace: string;
  kubernetesApiUrl: string;
  serviceAccountTokenPath: string;
  appsDomain?: string;
}

export class IsvcWatcher implements vscode.Disposable {
  private intervalId?: ReturnType<typeof setInterval>;
  private statusMap = new Map<string, IsvcStatusInfo>();
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly options: IsvcWatcherOptions) {}

  /**
   * Begins polling InferenceServices every 10 seconds. Call `dispose()` to stop.
   */
  start(names?: string[]): void {
    if (this.intervalId) {
      return;
    }
    this.poll(names);
    this.intervalId = setInterval(() => void this.poll(names), 10_000);
  }

  /** Returns the latest known status for a deployment name. */
  getStatus(name: string): IsvcStatusInfo | undefined {
    return this.statusMap.get(name);
  }

  /** Returns all current statuses. */
  getAllStatuses(): Map<string, IsvcStatusInfo> {
    return new Map(this.statusMap);
  }

  dispose(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this._onDidChange.dispose();
  }

  private async poll(names?: string[]): Promise<void> {
    try {
      const token = await this.readServiceAccountToken();
      const apiUrl = this.options.kubernetesApiUrl
        .replace(/\/+$/, '')
        .replace(/^https?:\/\//i, '');
      const baseUrl = `https://${apiUrl}/apis/serving.kserve.io/v1beta1/namespaces/${encodeURIComponent(this.options.namespace)}/inferenceservices`;

      // List all InferenceServices in the namespace.
      const response = await fetch(baseUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        return; // Silently skip — not all namespaces have KServe installed.
      }

      const body = (await response.json()) as { items?: unknown[] };
      const items = Array.isArray(body?.items) ? body.items : [];

      let changed = false;
      for (const item of items) {
        const name = extractName(item);
        if (!name) {
          continue;
        }
        // If names filter is provided, skip irrelevant entries.
        if (names && !names.includes(name)) {
          continue;
        }
        const status = summarizeInferenceService(item);
        const predictorUrl = derivePredictorUrl({
          name,
          namespace: this.options.namespace,
          appsDomain: this.options.appsDomain,
          addressUrl: status.addressUrl,
        });
        if (predictorUrl) {
          status.addressUrl = predictorUrl;
        }
        const prev = this.statusMap.get(name);
        if (!prev || prev.phase !== status.phase || prev.addressUrl !== status.addressUrl) {
          this.statusMap.set(name, status);
          changed = true;
        }
      }

      // Prune statuses for deployments that no longer exist.
      if (names) {
        for (const key of this.statusMap.keys()) {
          if (!names.includes(key) && this.statusMap.has(key)) {
            this.statusMap.delete(key);
            changed = true;
          }
        }
      }

      if (changed) {
        this._onDidChange.fire();
      }
    } catch {
      // Network / auth errors are expected in development; do not spam.
    }
  }

  private async readServiceAccountToken(): Promise<string> {
    try {
      const bytes = await readFile(this.options.serviceAccountTokenPath);
      const token = new TextDecoder().decode(bytes).trim();
      if (!token) {
        throw new Error('Service account token is empty.');
      }
      return token;
    } catch (error) {
      throw new Error(
        `Cannot read SA token from ${this.options.serviceAccountTokenPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

function extractName(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const metadata = (raw as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  const name = (metadata as Record<string, unknown>).name;
  return typeof name === 'string' ? name : undefined;
}
