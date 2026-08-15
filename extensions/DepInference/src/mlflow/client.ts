import { resolveTrackingUri } from '../core/urls';
import { normalizeRun } from '../core/mlflowModel';
import type { MlflowExperiment, MlflowRun, RawMlflowRun } from './types';
import { MlflowApiError, MlflowAuthError } from './errors';
import { createDummyExperiment, createDummyExperiments, createDummyRuns } from './dummyData';

export interface MlflowAuthHeadersProvider {
  getHeaders(): Promise<Record<string, string>>;
  getTrackingUri?(): Promise<string | undefined>;
}

export interface MlflowClientConfig {
  trackingUri?: string;
  namespace?: string;
  appsDomain?: string;
  maxResults: number;
  useDummyData?: boolean;
}

interface RawExperiment {
  experiment_id?: string;
  experimentId?: string;
  name?: string;
  artifact_location?: string;
  artifactLocation?: string;
  lifecycle_stage?: string;
  lifecycleStage?: string;
}

export class MlflowClient {
  constructor(
    private readonly config: MlflowClientConfig,
    private readonly auth: MlflowAuthHeadersProvider
  ) {}

  async listExperiments(): Promise<MlflowExperiment[]> {
    if (this.config.useDummyData) {
      return createDummyExperiments();
    }

    const data = await this.request('/experiments/search', {
      method: 'POST',
      body: JSON.stringify({
        max_results: Math.min(Math.max(this.config.maxResults, 1), 1000),
        view_type: 'ACTIVE_ONLY',
      }),
    });

    const rawExperiments = Array.isArray(data.experiments)
      ? (data.experiments as RawExperiment[])
      : [];
    return rawExperiments
      .map(normalizeExperiment)
      .filter((experiment) => experiment.experimentId && experiment.name);
  }

  async listRuns(experimentId: string): Promise<MlflowRun[]> {
    if (this.config.useDummyData) {
      return createDummyRuns(experimentId);
    }

    const data = await this.request('/runs/search', {
      method: 'POST',
      body: JSON.stringify({
        experiment_ids: [experimentId],
        view_type: 'ALL',
        max_results: this.config.maxResults,
        order_by: ['attributes.start_time DESC'],
      }),
    });

    const rawRuns = Array.isArray(data.runs) ? (data.runs as RawMlflowRun[]) : [];
    return rawRuns.map((run) => normalizeRun(run));
  }

  async getExperimentByName(name: string): Promise<MlflowExperiment> {
    if (this.config.useDummyData) {
      return createDummyExperiment(name);
    }

    const data = await this.request(
      `/experiments/get-by-name?experiment_name=${encodeURIComponent(name)}`
    );
    return normalizeExperiment(data.experiment ?? {});
  }

  private async request(
    path: string,
    init: RequestInit = {}
  ): Promise<Record<string, unknown>> {
    const baseUrl =
      resolveTrackingUri(this.config) ?? (await this.auth.getTrackingUri?.());
    if (!baseUrl) {
      throw new Error(
        'Configure mlflow.trackingUri or set MLFLOW_TRACKING_URI/OPENSHIFT_APPS_DOMAIN.'
      );
    }

    const response = await fetch(`${baseUrl}/api/2.0/mlflow${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(await this.auth.getHeaders()),
      },
    });

    if (response.status === 401) {
      throw new MlflowAuthError(response.status, await safeText(response));
    }
    if (!response.ok) {
      const body = await safeText(response);
      throw new MlflowApiError(
        `MLflow API request failed (${response.status}): ${body}`,
        response.status,
        body
      );
    }

    return (await response.json()) as Record<string, unknown>;
  }
}

function normalizeExperiment(raw: RawExperiment): MlflowExperiment {
  return {
    experimentId: raw.experimentId ?? raw.experiment_id ?? '',
    name: raw.name ?? '',
    artifactLocation: raw.artifactLocation ?? raw.artifact_location,
    lifecycleStage: raw.lifecycleStage ?? raw.lifecycle_stage,
  };
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 2000);
  } catch {
    return '';
  }
}
